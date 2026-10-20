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
import { Segmented } from "@/components/ui/segmented";
import { useAccount } from "@/lib/account";
import type { Route } from "@/lib/links";
import { useRecentViews } from "@/lib/recents";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { PlaceForecast } from "./place-forecast";
import { PlaceHeader } from "./place-header";
import { type PlaceKind, type PlaceTab, tabFrom, tabsOf } from "./tabs";
import { useLists } from "./use-lists";
import { useNow, usePlaceConditions, usePlaceRecord } from "./use-place";
import { useDistanceFrom, useFoldHeight, useSheetState } from "./use-sheet";
import { useSpotActions } from "./use-spot";

// A place as a sheet over the map: a surf break, a station or a spot, at
// `/place/<break|station|spot>/<id>?tab=`. It opens low, with the map alive over it, as tall as
// the summary of its forecast, and rises to be read (decision 040). Its head says what the place
// is and holds the bookmark and the menu; its tabs are those the web gives each kind, and the
// address opens one. What a tab other than the forecast draws is drawn by its own part of the app,
// in a scroll view of its own under the head.

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
  const distanceKm = useDistanceFrom(record.point);
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

  const tabs = tabsOf({ kind, signedIn, isOwner: record.isOwner });
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
  // ends under them: the low sheet is as tall as both, with a step of room under the summary.
  // Each is known by its own layout, in either order.
  const chrome = useRef(0);
  const foldBottom = useRef<number | undefined>(undefined);
  const fit = () => {
    if (chrome.current > 0 && foldBottom.current !== undefined) {
      foldAt(chrome.current + space.xs + foldBottom.current + space.s);
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

  // The head of the sheet: what the place is, its bookmark and its menu, and its tabs.
  const head = (
    <View
      className="bg-background"
      onLayout={(event) => {
        chrome.current = event.nativeEvent.layout.height;
        fit();
      }}
    >
      <PlaceHeader
        record={record}
        now={now}
        distanceKm={distanceKm}
        isSaved={item ? isSaved(item) : false}
        onSave={save}
        onCopy={copy}
        isCopying={spots.isCopying}
        onMenu={
          name ? () => router.push({ pathname: "/place/menu", params: { kind, id } }) : undefined
        }
      />
      {tabs.length > 1 && (
        // Its names may be longer than a phone is wide, in some languages: the row scrolls.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.m, paddingBottom: space.s }}
        >
          <Segmented
            // A station has one tab and no row: what has tabs is a break or a spot.
            label={m.native_place_sections({
              name: name ?? (kind === "break" ? m.break_title() : m.spot_title()),
            })}
            options={tabs.map((one) => ({ value: one, label: TAB_NAMES[one]() }))}
            value={shown}
            onChange={setTab}
          />
        </ScrollView>
      )}
    </View>
  );

  // Each tab is its own scroll view, with the head over it: the forecast's holds the head as its
  // sticky header, and the others scroll, and are pulled to be read again, under it. The tab in
  // view comes first, as iOS finds the scroll view that raises the sheet among the first things
  // of the screen; the others stay drawn, hidden, in the order they were seen.
  return (
    <ChartsAtRest atRest={atRest}>
      <View className="flex-1 bg-background">
        {/* react-native-screens sizes a form sheet's scroll view, found down the first child
            of each view, to the sheet: one deeper than the sheet's own children, as each tab's
            is here, it moves to where the sheet stands on the screen, out of sight. A first
            child of no size that is never flattened ends that search, and the scroll views
            keep the layout the sheet already gives them. */}
        <View collapsable={false} pointerEvents="none" style={{ position: "absolute" }} />
        {[shown, ...seen.filter((one) => one !== shown)].map((one) => (
          <View key={one} style={one === shown ? { flex: 1 } : { display: "none" }}>
            {one === "forecast" ? (
              <ForecastScroll bottom={insets.bottom + space.xl}>
                {one === shown ? head : <View />}
                <View style={{ paddingHorizontal: space.m, paddingTop: space.xs }}>
                  {panelOf(one)}
                </View>
              </ForecastScroll>
            ) : (
              <>
                {one === shown ? head : null}
                <View style={{ flex: 1 }}>{panelOf(one)}</View>
              </>
            )}
          </View>
        ))}
      </View>
    </ChartsAtRest>
  );
}

/**
 * The forecast's scroll view, with the head as its sticky header, which holds still under the
 * finger while a chart or the week's table is read. The lock is its own state: a reading that
 * begins or ends draws this view again, and not the head and the panel it is given.
 */
function ForecastScroll({ bottom, children }: { bottom: number; children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  return (
    <ReadingLock onLock={setLocked}>
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!locked}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: bottom }}
      >
        {children}
      </ScrollView>
    </ReadingLock>
  );
}
