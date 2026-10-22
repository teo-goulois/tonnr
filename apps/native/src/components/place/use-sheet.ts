import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";

import { RAISED, isWorthMoving, lowDetent } from "./fold";

// What a place's sheet knows of itself as the platform's sheet: whether it is at rest, so that its
// charts draw (the web's `useChartTurn`), and how tall it stands while low, from the summary of
// its panel (decision 040).

type Navigation = NativeStackNavigationProp<Record<string, object | undefined>>;

/**
 * Whether the sheet has come to rest, and at which height: its opening is over, and no finger
 * drags it. iOS says a height once it is reached; Android says whether it is still settling.
 */
export function useSheetState() {
  const navigation = useNavigation<Navigation>();
  const [atRest, setAtRest] = useState(false);
  const [detent, setDetent] = useState(0);
  useEffect(() => {
    const opened = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) setAtRest(true);
    });
    const moved = navigation.addListener("sheetDetentChange", (event) => {
      setDetent(event.data.index);
      setAtRest(event.data.stable);
    });
    // A sheet that says nothing of its opening is at rest once it has had the time to open.
    const timer = setTimeout(() => setAtRest(true), 700);
    return () => {
      opened();
      moved();
      clearTimeout(timer);
    };
  }, [navigation]);
  return { atRest, detent };
}

/**
 * Makes the low sheet as tall as the summary its panel ends at, once it is known: only while the
 * sheet is low, so that a raised sheet is not moved under the reader.
 */
export function useFoldHeight(detent: number) {
  const navigation = useNavigation<Navigation>();
  const { height } = useWindowDimensions();
  const current = useRef<number | undefined>(undefined);
  return (foldBottom: number) => {
    if (detent !== 0) return;
    const low = lowDetent(foldBottom, height);
    if (current.current !== undefined && !isWorthMoving(current.current, low)) return;
    current.current = low;
    navigation.setOptions({ sheetAllowedDetents: [low, RAISED] });
  };
}
