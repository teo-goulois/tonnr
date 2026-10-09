import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";

/**
 * The place of a tide chart that is not there yet: its day, then its strip. It has the chart's
 * size, so nothing moves when the tide comes. It stands apart from the chart, which loads late.
 */
export function TideChartSkeleton({ className }: { className?: string }) {
  return (
    <div className="grid gap-xxs" aria-busy>
      <div className="flex h-8 items-center">
        <Skeleton className="h-(--line-s) w-16 rounded-(--radius-xs)" />
      </div>
      <Skeleton className={cn("h-56 w-full rounded-(--radius-xs)", className)} />
    </div>
  );
}
