import { router, useNavigation } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { ChartsAtRest } from "@/components/charts/chart-turn";
import { NewSpotOffer } from "@/components/map/new-spot-offer";
import { overHref, placeHref } from "@/components/map/place-route";
import type { PlaceRef } from "@/components/saved/sea-now";
import { ReadingLock } from "@/components/charts/reading";
import { AlertsTab } from "@/components/place-tabs/alerts";
import { GuideTab } from "@/components/place-tabs/guide";
import { ReportsTab } from "@/components/place-tabs/reports";
import { SessionsTab } from "@/components/place-tabs/sessions";
import { Tabs } from "@/components/ui/tabs";
import { SheetRoot } from "@/components/ui/sheet";
import { useAccount } from "@/lib/account";
import { useRecentViews } from "@/lib/recents";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";

import { FOLD_MARGIN } from "./fold";
import { FAVORITES } from "./lists";
import { PlaceForecast } from "./place-forecast";
import { PlaceHeader } from "./place-header";
import { PlaceMenu } from "./place-menu";
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
  isNew = false,
}: {
  kind: PlaceKind;
  id: string;
  askedTab?: string;
  // A spot just added, whose owner is offered to describe it and an alert there (`?new=1`).
  isNew?: boolean;
}) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { signedIn } = useAccount();
  const requireAccount = useRequireAccount();
  const record = usePlaceRecord(kind, id);
  const conditions = usePlaceConditions(record, now);
  const { atRest, detent } = useSheetState();
  const { fit: foldAt, top: sheetTop } = useFoldHeight(detent, atRest);
  const { lists, isSaved, save: saveTo } = useLists();
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
  // ends under them, past the panel's room over it: the low sheet is as tall as both, with the
  // web's room under the summary. Each is known by its own layout, in either order.
  const chrome = useRef(0);
  const [headHeight, setHeadHeight] = useState(0);
  const foldBottom = useRef<number | undefined>(undefined);
  const fit = () => {
    if (chrome.current > 0 && foldBottom.current !== undefined) {
      foldAt(chrome.current + space.m + foldBottom.current + FOLD_MARGIN);
    }
  };

  // What the bookmark keeps, once it is known to be there: a spot of someone else's is copied.
  const known =
    kind === "station" ? record.station : kind === "break" ? record.found : record.isOwner;
  const item: PlaceRef | undefined = known ? { kind, id } : undefined;
  const sharedSpot = kind === "spot" && record.spot && !record.isOwner ? record.spot : undefined;

  // The bookmark opens an account's lists. A visitor's asks for an account, then puts the place
  // in the favorites once it is signed in, as the web's does.
  const [wantsFavorite, setWantsFavorite] = useState(false);
  useEffect(() => {
    if (!wantsFavorite || !signedIn || !item || !lists.isSuccess) return;
    setWantsFavorite(false);
    saveTo(FAVORITES, item, true);
  }, [wantsFavorite, signedIn, item, lists.isSuccess, saveTo]);
  const save = item
    ? () => {
        if (!signedIn) {
          // Once signed in through this prompt, and only then.
          requireAccount(m.auth_reason_save({ name: name ?? m.auth_reason_this_station() }), () =>
            setWantsFavorite(true),
          );
          return;
        }
        router.push({ pathname: "/place/save", params: { kind, id } });
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
  // The station nearest the place opens in a sheet over this one, which closing it gives back,
  // and the map keeps the place selected, as the web's `?buoy=` opens it over the break's panel.
  const openStation = (stationId: string) => router.push(overHref("station", stationId));
  // Closes this sheet, whatever stands over it then.
  const navigation = useNavigation();
  const close = () => navigation.goBack();

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
          ref={sheetTop}
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
            saveLabel={signedIn ? m.saved_add_to_list() : m.saved_add_favorite()}
            onCopy={copy}
            isCopying={spots.isCopying}
            menu={
              name ? (
                <PlaceMenu
                  kind={kind}
                  id={id}
                  record={record}
                  onAlert={() => setTab("alerts")}
                  onDeleted={close}
                />
              ) : undefined
            }
            onClose={close}
          />
          {isNew && kind === "spot" ? (
            <NewSpotOffer
              id={id}
              onDescribe={() => setTab("guide")}
              style={{ marginHorizontal: space.m, marginTop: space.m }}
            />
          ) : null}
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

// How far the panel's edges fade while more of it is hidden past them, the web's `--fade-size`.
const FADE = 24;

/**
 * The forecast's scroll view, which holds still under the finger while a chart or the week's
 * table is read, the web's panel with its room around what it holds. Its top and its bottom fade
 * into the sheet while more of it is hidden past them, as the web's panel fades, as far as what is
 * hidden and no further than the fade. The lock is its own state: a reading that begins or ends
 * draws this view again, and not the panel it is given.
 */
function ForecastScroll({ bottom, children }: { bottom: number; children: ReactNode }) {
  const { colors, space } = useTheme();
  const [locked, setLocked] = useState(false);
  // How far it is scrolled, how tall it stands and how tall what it holds is.
  const offset = useSharedValue(0);
  const frame = useSharedValue(0);
  const content = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.set(event.contentOffset.y);
    frame.set(event.layoutMeasurement.height);
    content.set(event.contentSize.height);
  });
  const over = useAnimatedStyle(() => ({
    height: Math.min(FADE, Math.max(0, offset.get())),
  }));
  const under = useAnimatedStyle(() => ({
    height: Math.min(FADE, Math.max(0, content.get() - frame.get() - offset.get())),
  }));
  const canvas = colors["cte-canvas"];

  return (
    <ReadingLock onLock={setLocked}>
      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          style={{ flex: 1 }}
          scrollEnabled={!locked}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={(event) => {
            frame.set(event.nativeEvent.layout.height);
          }}
          onContentSizeChange={(_, height) => {
            content.set(height);
          }}
          contentContainerStyle={{
            paddingHorizontal: space.m,
            paddingTop: space.m,
            paddingBottom: bottom,
          }}
        >
          {children}
        </Animated.ScrollView>
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", top: 0, left: 0, right: 0 }, over]}
        >
          <Fade color={canvas} from="top" />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", bottom: 0, left: 0, right: 0 }, under]}
        >
          <Fade color={canvas} from="bottom" />
        </Animated.View>
      </View>
    </ReadingLock>
  );
}

/** The sheet's color, from the edge it stands at to nothing. */
function Fade({ color, from }: { color: string; from: "top" | "bottom" }) {
  const id = `panel-fade-${from}`;
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient
          id={id}
          x1="0"
          y1={from === "top" ? "0" : "1"}
          x2="0"
          y2={from === "top" ? "1" : "0"}
        >
          <Stop offset="0" stopColor={color} stopOpacity={1} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
