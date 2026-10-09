import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Range } from "@/lib/usage";
import { orpc } from "@/utils/orpc";

// The API writes its counts every thirty seconds.
const EVERY = 30 * 1000;
// Where the reader's day starts.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Filter = { developerId?: string };

/** The calls over a span of time, hour by hour or day by day. */
export function useUsageSeries(range: Range, filter: Filter = {}) {
  return useQuery(
    orpc.v1.usage.series.queryOptions({
      input: { from: range.from, to: range.to, step: range.step, timeZone, ...filter },
      refetchInterval: EVERY,
      // A longer span is drawn in place of the shorter one, with no blank between.
      placeholderData: keepPreviousData,
    }),
  );
}

/** The calls of a span of time, by who called or by what was called. */
export function useUsageBreakdown(
  range: Range,
  by: "via" | "developer" | "key" | "procedure",
  filter: Filter = {},
) {
  return useQuery(
    orpc.v1.usage.breakdown.queryOptions({
      input: { from: range.from, to: range.to, by, ...filter },
      refetchInterval: EVERY,
      placeholderData: keepPreviousData,
    }),
  );
}

// A developer account the reader is no member of answers as one that does not exist. The
// console says so itself, and leaves the other failures to the toast.
const ASKED_AS_A_MEMBER = { quietWhenMissing: true };

/** The calls of a developer account over a span of time, as one of its members reads them. */
export function useConsoleSeries(range: Range, developerId: string) {
  return useQuery(
    orpc.v1.console.series.queryOptions({
      input: { from: range.from, to: range.to, step: range.step, timeZone, developerId },
      refetchInterval: EVERY,
      placeholderData: keepPreviousData,
      meta: ASKED_AS_A_MEMBER,
    }),
  );
}

/** The calls of a developer account in a span of time, by key or by what was called. */
export function useConsoleBreakdown(range: Range, by: "key" | "procedure", developerId: string) {
  return useQuery(
    orpc.v1.console.breakdown.queryOptions({
      input: { from: range.from, to: range.to, by, developerId },
      refetchInterval: EVERY,
      placeholderData: keepPreviousData,
      meta: ASKED_AS_A_MEMBER,
    }),
  );
}
