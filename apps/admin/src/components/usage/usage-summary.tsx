import { useMemo } from "react";

import { type Range, type UsagePoint, sumOf } from "@/lib/usage";

import { OutcomeTotals } from "./outcome-totals";
import { UsageChart } from "./usage-chart";

type UsageSummaryProps = {
  range: Range;
  // Undefined while the counts load.
  points: UsagePoint[] | undefined;
};

/** The calls of a span of time: how many ended each way, then all of them over time. */
export function UsageSummary({ range, points }: UsageSummaryProps) {
  const counts = useMemo(() => (points ? sumOf(points) : null), [points]);

  return (
    <div className="grid grid-cols-1 gap-l">
      <OutcomeTotals counts={counts} />
      <UsageChart points={points ?? []} range={range} isLoading={points === undefined} />
    </div>
  );
}
