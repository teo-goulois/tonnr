import { router } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChartsAtRest } from "@/components/charts/chart-turn";
import { placeHref } from "@/components/map/place-route";
import type { PlaceRef } from "@/components/saved/sea-now";
import { ReadingLock } from "@/components/charts/reading";
import { AlertsTab } from "@/components/place-tabs/alerts";
import { GuideTab } from "@/components/place-tabs/guide";
import { ReportsTab } from "@/components/place-tabs/reports";
import { SessionsTab } from "@/components/place-tabs/sessions";
import { Tabs } from "@/components/ui/tabs";
import { SheetRoot } from "@/components/ui/sheet";
import { useAccount } from "@/lib/account";
import type { Route } from "@/lib/links";
import { useRecentViews } from "@/lib/recents";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";

import { PlaceForecast } from "./place-forecast";
import { PlaceHeader } from "./place-header";
import { type PlaceKind, type PlaceTab, tabFrom, tabsOf } from "./tabs";
import { useLists } from "./use-lists";
import { usePlaceConditions, usePlaceRecord } from "./use-place";
import { useFoldHeight, useSheetState } from "./use-sheet";
import { useSpotActions } from "./use-spot";

// A place as a sheet over the map: a surf break, a station or a spot, at
// `/place/<break|station|spot>/<id>?tab=`. It opens low, with the map alive over it, as tall as
// the summary of its forecast, and rises to be read (decision 040). Its head says what the place
// is and holds the bookmark, the menu and what closes the sheet; its tabs are those the web gives
// each kind, and the address opens one. What a tab other than the forecast draws is drawn by its
// own part of the app, in a scroll view of its own under the head.

const TAB_NAMES: Record<PlaceTab, () => string> = {
  forecast: m.details_forecast_tab,
  reports: m.details_reports_tab,
  guide: m.details_guide_tab,
  alerts: m.details_alert_tab,
  sessions: m.details_sessions_tab,
};

export function PlaceSheet({
  kind,
  id,
  askedTab,
}: {
  kind: PlaceKind;
  id: string;
  askedTab?: string;
}) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { signedIn } = useAccount();
  const requireAccount = useRequireAccount();
  const record = usePlaceRecord(kind, id);
  const conditions = usePlaceConditions(record, now);
  const { atRest, detent } = useSheetState();
  const foldAt = useFoldHeight(detent);
  const { isSaved } = useLists();
  const spots = useSpotActions();
  const name = record.name;

  // What is open is what was looked at last.
  const viewedKind = kind === "spot" ? (record.isOwner ? "spot" : undefined) : kind;
  useRecentViews(
    viewedKind && name && record.point
      ? { kind: viewedKind, id, name, ...record.point }
      : undefined,
  );

  const tabs = tabsOf({
    kind,
    signedIn,
    isOwner: record.isOwner,
    // A break that has left the catalogue may still be in the cache: the error comes first.
    known:
      !record.isError &&
      (kind === "break" ? record.found !== undefined : kind === "spot" ? !!record.spot : true),
  });
  // The tab asked for, by the address or by a press, which is shown once the place has it: the
  // alerts of an account come once it is known to be signed in.
  const [tab, setTab] = useState<string | undefined>(askedTab);
  // A link to the same place on another tab opens that tab.
  useEffect(() => {
    if (askedTab) setTab(askedTab);
  }, [askedTab]);
  const shown = tabFrom(tab, tabs);
  // A tab once seen stays drawn: what its reader wrote there is not lost to a look at another.
  const [seen, setSeen] = useState<PlaceTab[]>([shown]);
  useEffect(() => {
    setSeen((all) => (all.includes(shown) ? all : [...all, shown]));
  }, [shown]);

  // How tall the head and the tabs stand over what scrolls, and where the summary of the panel
  // ends under them, past the panel's room over it: the low sheet is as tall as both, with a step
  // of room under the summary. Each is known by its own layout, in either order.
  const chrome = useRef(0);
  const [headHeight, setHeadHeight] = useState(0);
  const foldBottom = useRef<number | undefined>(undefined);
  const fit = () => {
    if (chrome.current > 0 && foldBottom.current !== undefined) {
      foldAt(chrome.current + space.m + foldBottom.current + space.s);
    }
  };

  // What the bookmark keeps, once it is known to be there: a spot of someone else's is copied.
  const known =
    kind === "station" ? record.station : kind === "break" ? record.found : record.isOwner;
  const item: PlaceRef | undefined = known ? { kind, id } : undefined;
  const sharedSpot = kind === "spot" && record.spot && !record.isOwner ? record.spot : undefined;

  const save = item
    ? () => {
        const next =
          `/place/save?kind=${kind}&id=${encodeURIComponent(id)}&name=${encodeURIComponent(name ?? "")}` as Route;
        requireAccount(
          m.auth_reason_save({ name: name ?? m.auth_reason_this_station() }),
          () => router.push(next),
          next,
        );
      }
    : undefined;
  const copy = sharedSpot
    ? () =>
        requireAccount(
          m.auth_reason_copy_spot({ name: sharedSpot.name }),
          () => spots.copy(sharedSpot, (made) => router.replace(placeHref("spot", made.id))),
          placeHref(kind, id),
        )
    : undefined;
  const openStation = (stationId: string) => router.push(placeHref("station", stationId));

  const panelOf = (one: PlaceTab): ReactNode => {
    switch (one) {
      case "forecast":
        return (
          <PlaceForecast
            record={record}
            conditions={conditions}
            now={now}
            onOpenStation={openStation}
            onFold={(bottom) => {
              foldBottom.current = bottom;
              fit();
            }}
          />
        );
      case "guide":
        return <GuideTab kind={kind} id={id} />;
      case "reports":
        return <ReportsTab kind={kind} id={id} />;
      case "alerts":
        return <AlertsTab kind={kind} id={id} />;
      case "sessions":
        return <SessionsTab kind={kind} id={id} />;
    }
  };

  // The tab in view comes first, as iOS finds the scroll view that raises the sheet among the
  // first things of the screen; the others stay drawn, hidden, in the order they were seen. Each
  // is its own scroll view, which scrolls, and is pulled to be read again, under the head.
  return (
    <ChartsAtRest atRest={atRest}>
      {/* Each tab's scroll view stands under the head: SheetRoot keeps react-native-screens
          from moving it. */}
      <SheetRoot className="flex-1 bg-background">
        {[shown, ...seen.filter((one) => one !== shown)].map((one) => (
          <View
            key={one}
            style={one === shown ? { flex: 1, paddingTop: headHeight } : { display: "none" }}
          >
            {one === "forecast" ? (
              <ForecastScroll bottom={insets.bottom + space.xl}>{panelOf(one)}</ForecastScroll>
            ) : (
              panelOf(one)
            )}
          </View>
        ))}
        {/* The head of the sheet, drawn once over the tabs, whichever is in view, so that the line
            under the tab chosen moves to it and the row keeps where it was scrolled: what the
            place is, its buttons, then its tabs, as the web's drawer heads its panel. It comes
            after the tabs, so that their scroll view is the first that iOS finds. */}
        <View
          className="bg-background"
          style={{ position: "absolute", top: 0, left: 0, right: 0 }}
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height;
            chrome.current = height;
            setHeadHeight(height);
            fit();
          }}
        >
          <PlaceHeader
            record={record}
            now={now}
            isSaved={item ? isSaved(item) : false}
            onSave={save}
            onCopy={copy}
            isCopying={spots.isCopying}
            onMenu={
              name
                ? () => router.push({ pathname: "/place/menu", params: { kind, id } })
                : undefined
            }
            onClose={() => router.back()}
          />
          {/* A station has one tab and no row: what has tabs is a break or a spot, once it is
              read. */}
          {tabs.length > 1 && (
            <View style={{ paddingHorizontal: space.m, paddingTop: space.m }}>
              <Tabs
                label={m.native_place_sections({
                  name: name ?? (kind === "break" ? m.break_title() : m.spot_title()),
                })}
                options={tabs.map((one) => ({ value: one, label: TAB_NAMES[one]() }))}
                value={shown}
                onChange={setTab}
                bleed={space.m}
              />
            </View>
          )}
        </View>
      </SheetRoot>
    </ChartsAtRest>
  );
}

/**
 * The forecast's scroll view, which holds still under the finger while a chart or the week's
 * table is read, the web's panel with its room around what it holds. The lock is its own state: a
 * reading that begins or ends draws this view again, and not the panel it is given.
 */
function ForecastScroll({ bottom, children }: { bottom: number; children: ReactNode }) {
  const { space } = useTheme();
  const [locked, setLocked] = useState(false);
  return (
    <ReadingLock onLock={setLocked}>
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!locked}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space.m,
          paddingTop: space.m,
          paddingBottom: bottom,
        }}
      >
        {children}
      </ScrollView>
    </ReadingLock>
  );
}
