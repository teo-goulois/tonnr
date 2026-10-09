import { useEffect, useMemo, useState } from "react";

import { type Range, type RangeName, rangeOf } from "@/lib/usage";

/** The time, read again every so often, so that a screen left open does not stay in the past. */
export function useNow(everyMs = 60 * 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);

  return now;
}

/**
 * The span of time a screen shows, which moves when the hour turns or when the reader's day
 * does, and stays the same object until then, so that nothing is asked again at every tick.
 */
export function useRange(name: RangeName): Range {
  const now = useNow();
  const { from, to, step } = rangeOf(name, now);
  const [fromTime, toTime] = [from.getTime(), to.getTime()];

  return useMemo(
    () => ({ from: new Date(fromTime), to: new Date(toTime), step }),
    [fromTime, toTime, step],
  );
}
