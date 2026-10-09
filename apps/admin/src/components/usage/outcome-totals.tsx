import { Skeleton } from "@repo/ui/components/ui/skeleton";

import { formatCount } from "@/lib/format";
import { type Counts, OUTCOMES } from "@/lib/usage";

import { OUTCOME_HINTS, OUTCOME_LABELS } from "./outcomes";

type OutcomeTotalsProps = {
  // Null while the counts load.
  counts: Counts | null;
};

/** The calls of a span of time, by what came of them. The chart draws them over time. */
export function OutcomeTotals({ counts }: OutcomeTotalsProps) {
  return (
    <dl className="grid grid-cols-2 gap-x-l gap-y-m sm:grid-cols-5">
      {OUTCOMES.map((outcome) => (
        <div key={outcome} className="grid gap-xxs">
          <dt className="text-s text-neutral-7" title={OUTCOME_HINTS[outcome]()}>
            {OUTCOME_LABELS[outcome]()}
          </dt>
          <dd className="text-l font-medium tabular-nums">
            {counts ? formatCount(counts[outcome]) : <Skeleton className="h-7 w-16" />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
