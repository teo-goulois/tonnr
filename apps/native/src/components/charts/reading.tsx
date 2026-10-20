import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { useChartPressState } from "victory-native";
import { scheduleOnRN } from "react-native-worklets";

import { feel } from "@/components/ui/haptics";

// How a finger reads a chart, as decision 029 has it: a press held still for 300 ms starts the
// reading, and sliding then reads the nearest sample, with a touch felt at each hour it passes.
// A press that moves before the hold scrolls instead. While it reads, what scrolls around it holds
// still, so that the finger reads and moves nothing.

/** How long a press holds still before it reads, in milliseconds. */
export const HOLD_MS = 300;

const LockContext = createContext<(reading: boolean) => void>(() => {});

/** Holds still what scrolls around the charts it holds while one of them is read. */
export function ReadingLock({
  onLock,
  children,
}: {
  onLock: (reading: boolean) => void;
  children: ReactNode;
}) {
  return <LockContext.Provider value={onLock}>{children}</LockContext.Provider>;
}

/** Says whether a chart is read, for what scrolls around it to hold still. */
export function useReadingLock() {
  return useContext(LockContext);
}

/** The values a chart's press reads: up to four curves, `a` to `d`. */
export const PRESS_INIT = { x: 0, y: { a: 0, b: 0, c: 0, d: 0 } };

/**
 * The press of a chart, and the sample it reads, said on the JavaScript side once each time it
 * changes: an index of the chart's data, or undefined once the finger has lifted. `timeOf` gives
 * the moment of an index, for the touch felt at each hour.
 */
export function useChartReading(
  onRead: (index: number | undefined) => void,
  timeOf: (index: number) => number | undefined,
) {
  const { state, isActive } = useChartPressState(PRESS_INIT);
  const lock = useReadingLock();
  const read = useRef(onRead);
  read.current = onRead;
  const time = useRef(timeOf);
  time.current = timeOf;
  const hour = useRef<number | undefined>(undefined);

  const said = useCallback((index: number) => {
    if (index < 0) {
      hour.current = undefined;
      read.current(undefined);
      return;
    }
    const at = time.current(index);
    const inHour = at === undefined ? undefined : Math.floor(at / (60 * 60 * 1000));
    // The first sample is felt as the hold that began the reading.
    if (hour.current === undefined) feel("hold");
    else if (inHour !== hour.current) feel("select");
    hour.current = inHour;
    read.current(index);
  }, []);

  useAnimatedReaction(
    () => (state.isActive.value ? state.matchedIndex.value : -1),
    (index, previous) => {
      if (index !== previous) scheduleOnRN(said, index);
    },
  );

  useEffect(() => {
    lock(isActive);
  }, [isActive, lock]);
  useEffect(() => () => lock(false), [lock]);

  return { state, isActive };
}
