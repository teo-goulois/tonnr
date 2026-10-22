import { type NativeStackNavigationProp, useNavigation, useRoute } from "expo-router";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Platform, useWindowDimensions, type View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { opensRaised, selectsOnMap } from "@/components/map/place-route";
import { hideSheet, showSheet } from "@/components/map/sheet-state";

import {
  FOLD_NONE,
  RAISED,
  isWorthMoving,
  largestSheet,
  lowDetent,
  sheetDetentOf,
  sheetShift,
} from "./fold";

// What a place's sheet knows of itself as the platform's sheet: whether it is at rest, so that its
// charts draw (the web's `useChartTurn`), and how tall it stands while low, from the summary of
// its panel (decision 040).

type Navigation = NativeStackNavigationProp<Record<string, object | undefined>>;

// How long a sheet given a new low height takes to reach it, past which it is measured.
const SETTLING_MS = 400;

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
  // Raised as it opens, unless it was pressed on the map (`opensRaised`), and where it stands once
  // it is given another place, whose parameters say nothing of it.
  const [detent, setDetent] = useState(() =>
    sheetDetentOf(detents, route.key, opensRaised(route.params)),
  );
  useEffect(() => {
    const opened = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) setAtRest(true);
    });
    const moved = navigation.addListener("sheetDetentChange", (event) => {
      detents.set(route.key, event.data.index);
      setDetent(event.data.index);
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
  }, [navigation, route.key]);
  return { atRest, detent };
}

/**
 * Makes the low sheet as tall as the summary its panel ends at, once it is known: only while the
 * sheet is low, so that a raised sheet is not moved under the reader. The platform takes a
 * height as a share of the sheet at its largest, which is shorter than the screen. The map under
 * it is told how tall the low sheet stands, whether it is raised and the place it selects
 * (`sheet-state.ts`), as the web's drawer tells its viewer: how tall it stands is measured, from
 * where `top`, a view at the top of the sheet, stands on the screen once the low sheet is at rest,
 * since the platform's sheet does not stand exactly at the height its share gives it.
 */
export function useFoldHeight(detent: number, atRest: boolean) {
  const navigation = useNavigation<Navigation>();
  const route = useRoute();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const largest = largestSheet(height, insets.top, Platform.OS === "ios");
  const current = useRef<number | undefined>(undefined);
  // The low height as a share of the largest sheet: the one it opens at until its summary is known.
  const [low, setLow] = useState(() => lows.get(route.key) ?? FOLD_NONE);
  // The place it selects on the map, by its address: a station over a place's sheet selects none.
  const place = selectsOnMap(route.params);
  const placeKind = place?.kind;
  const placeId = place?.id;
  const [shift, setShift] = useState(measuredShift);
  useEffect(() => {
    showSheet(route.key, {
      height: low * largest + shift,
      raised: detent > 0,
      place: placeKind && placeId ? { kind: placeKind, id: placeId } : undefined,
    });
  }, [route.key, low, largest, shift, detent, placeKind, placeId]);
  // Measured once the low sheet is at rest, and once it has taken a new low height, which the
  // platform gives it without saying when it is reached.
  const top = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!atRest || detent !== 0) return;
    const timer = setTimeout(() => {
      top.current?.measureInWindow((_x, y) => {
        const next = sheetShift(height - y, low * largest);
        if (next === undefined) return;
        measuredShift = next;
        setShift(next);
      });
    }, SETTLING_MS);
    return () => clearTimeout(timer);
  }, [atRest, detent, low, largest, height]);
  useEffect(() => () => hideSheet(route.key), [route.key]);
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
    top,
  };
}
