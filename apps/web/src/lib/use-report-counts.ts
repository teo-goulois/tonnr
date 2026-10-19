import { useEffect, useRef } from "react";

import { client } from "@/utils/orpc";

import { COUNTS_KEY, createReportCounter } from "./report-counts";

// The counts of this browser, told to the API: decision 068.

let counter: ReturnType<typeof createReportCounter> | null = null;

/** The counter of this browser, made once it is asked for. None on the server. */
export function reportCounter() {
  if (typeof window === "undefined") return null;
  counter ??= createReportCounter(
    {
      get: () => window.localStorage.getItem(COUNTS_KEY),
      set: (value) => window.localStorage.setItem(COUNTS_KEY, value),
    },
    {
      seen: (ids) => client.v1.reports.seen({ ids }),
      opened: (id) => client.v1.reports.opened({ id }),
    },
  );
  return counter;
}

/**
 * Counts a report as seen once what the returned ref is given has been half in view a second.
 * Nothing when `id` is null: the reader's own report, or one that is not shown.
 */
export function useCountWhenSeen<Element extends HTMLElement>(id: string | null) {
  const ref = useRef<Element>(null);
  useEffect(() => {
    const element = ref.current;
    if (!id || !element || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Half of it in view, without a pause, for a second: a sliver of it is not seen.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer ??= setTimeout(() => {
            reportCounter()?.seen(id);
            observer.disconnect();
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [id]);
  return ref;
}
