import { type NativeStackNavigationProp, useNavigation, useRoute } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { holdPlaceSheet } from "@/components/map/open-place";
import { opensRaised, selectsOnMap, standsOver } from "@/components/map/place-route";
import { hideSheet, showSheet } from "@/components/map/sheet-state";

import {
  FOLD_NONE,
  RAISED,
  floatsSheets,
  isWorthMoving,
  largestSheet,
  lowDetent,
  sheetDetentOf,
  sheetShift,
  standingHeight,
} from "./fold";

// What a place's sheet knows of itself as the platform's sheet: whether it is at rest, so that its
// charts draw (the web's `useChartTurn`), and how tall it stands while low, from the summary of
// its panel (decision 040).

type Navigation = NativeStackNavigationProp<Record<string, object | undefined>>;

// By when a sheet the platform says nothing of has begun to be shown.
const SHOWN_BY_MS = 600;

// The height each sheet stands at, and its low height, by its route: a sheet given another place,
// by a press on the map or from anywhere else, keeps them, though the place is drawn anew in it.
// They are forgotten once the route has left.
const detents = new Map<string, number>();
const lows = new Map<string, number>();

// How far over the height its share gives it the low sheet stands, as last measured: the same for
// every sheet of the app, which a sheet that opens raised takes before it is measured itself.
let measuredShift = 0;

/** Forgets what a route's sheet stood at, once the route is no longer among its navigator's. */
function forgetLeft(navigation: Navigation, route: string) {
  if (navigation.getState()?.routes.some((one) => one.key === route)) return;
  detents.delete(route);
  lows.delete(route);
}

/**
 * Whether the sheet has come to rest, and at which height: its opening is over, and no finger
 * drags it. iOS says a height once it is reached; Android says whether it is still settling.
 */
export function useSheetState() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute();
  const [atRest, setAtRest] = useState(false);
  // A sheet over another place's has one height, its raised one, which the platform counts as
  // its first: it is raised whatever it says.
  const over = standsOver(route.params);
  // Raised as it opens, unless it was pressed on the map (`opensRaised`), and where it stands once
  // it is given another place, whose parameters say nothing of it.
  const [detent, setDetent] = useState(() =>
    over ? 1 : sheetDetentOf(detents, route.key, opensRaised(route.params)),
  );
  useEffect(() => {
    const opened = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) setAtRest(true);
    });
    const moved = navigation.addListener("sheetDetentChange", (event) => {
      const index = over ? 1 : event.data.index;
      detents.set(route.key, index);
      setDetent(index);
      setAtRest(event.data.stable);
    });
    // A sheet that says nothing of its opening is at rest once it has had the time to open.
    const timer = setTimeout(() => setAtRest(true), 700);
    return () => {
      opened();
      moved();
      clearTimeout(timer);
      // A sheet drawn anew for another place is still the route's.
      forgetLeft(navigation, route.key);
    };
  }, [navigation, route.key, over]);
  return { atRest, detent };
}

/**
 * Makes the low sheet as tall as the summary its panel ends at, once it is known: only while the
 * sheet is low, so that a raised sheet is not moved under the reader. The platform takes a
 * height as a share of the sheet at its largest, which is shorter than the screen. The map under
 * it is told how tall the low sheet stands, whether it is raised and the place it selects
 * (`sheet-state.ts`), as the web's drawer tells its viewer: how tall it stands is measured, from
 * the layout of the sheet's root, which `measure` is given, and how iOS 26 draws a floating sheet
 * from it (`standingHeight`): its share of the largest sheet does not say it. Where its top stands
 * on the screen cannot be read: React Native measures a view in its own layout, where a sheet's
 * top is the screen's and nothing is drawn smaller.
 */
export function useFoldHeight(detent: number) {
  const navigation = useNavigation<Navigation>();
  const route = useRoute();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const largest = largestSheet(height, insets.top, Platform.OS === "ios");
  const floating = floatsSheets(Platform.OS, Platform.Version);
  const current = useRef<number | undefined>(undefined);
  // The low height as a share of the largest sheet: the one it opens at until its summary is known.
  const [low, setLow] = useState(() => lows.get(route.key) ?? FOLD_NONE);
  // The place it selects on the map, by its address: a station over a place's sheet selects none.
  const place = selectsOnMap(route.params);
  const placeKind = place?.kind;
  const placeId = place?.id;
  const [shift, setShift] = useState(measuredShift);
  const over = standsOver(route.params);
  // The map is told the sheet's height as the platform begins to show it, and not as it is
  // mounted, which comes earlier by the time its panel takes to be drawn: what stands on it then
  // rises with it. Until then the sheet is said with no height, so that it counts as open and
  // selects its place, except a sheet over another place's, which selects none and would bring
  // what stands on the map down for a moment. It is told as the sheet begins to go, and not once
  // it is gone, so that what stands on it comes down with it, and told again that it stands when
  // a swipe that began to close it lets it go.
  const [showing, setShowing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const starts = navigation.addListener("transitionStart", (event) => {
      if (event.data.closing) setLeaving(true);
      else setShowing(true);
    });
    const ends = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) {
        setShowing(true);
        setLeaving(false);
      }
    });
    // A platform that says nothing of the opening has begun to show the sheet by then.
    const timer = setTimeout(() => setShowing(true), SHOWN_BY_MS);
    return () => {
      starts();
      ends();
      clearTimeout(timer);
    };
  }, [navigation]);
  useEffect(() => {
    if (leaving) {
      hideSheet(route.key);
      return;
    }
    if (!showing && over) return;
    showSheet(route.key, {
      height: showing ? low * largest + shift : 0,
      raised: detent > 0,
      place: placeKind && placeId ? { kind: placeKind, id: placeId } : undefined,
    });
  }, [route.key, showing, leaving, low, largest, shift, detent, over, placeKind, placeId]);
  // Only a low sheet's layout is read. One far from what its share gives is left: the size of the
  // screen, which the platform lays the sheet out at before it shows it, or one taken as the sheet
  // goes from a height to another.
  const measure = (laidOut: number) => {
    if (detent !== 0) return;
    const next = sheetShift(standingHeight(laidOut, width, floating), low * largest);
    if (next === undefined) return;
    measuredShift = next;
    setShift(next);
  };
  useEffect(() => () => hideSheet(route.key), [route.key]);
  // A place given to the sheet from anywhere comes to this one, once what stands over it is
  // closed (`open-place.ts`): a station's sheet over it takes none.
  useEffect(() => {
    if (over) return;
    return holdPlaceSheet(route.key, () => {
      const state = navigation.getState();
      const at = state?.routes.findIndex((one) => one.key === route.key) ?? -1;
      return state && at >= 0 ? state.index - at : 0;
    });
  }, [navigation, route.key, over]);
  // Where the summary ends, as last told: a sheet that opened raised takes its low height once it
  // is lowered.
  const told = useRef<number | undefined>(undefined);
  const fit = (foldBottom: number) => {
    if (detent !== 0) return;
    const next = lowDetent(foldBottom, height, largest);
    if (current.current !== undefined && !isWorthMoving(current.current, next)) return;
    current.current = next;
    lows.set(route.key, next);
    setLow(next);
    navigation.setOptions({ sheetAllowedDetents: [next, RAISED] });
  };
  useEffect(() => {
    if (told.current !== undefined) fit(told.current);
    // Once lowered: what the summary told is read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detent]);
  return {
    fit: (foldBottom: number) => {
      told.current = foldBottom;
      fit(foldBottom);
    },
    measure,
  };
}
