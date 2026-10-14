import { ArrowUpIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { m } from "@/paraglide/messages.js";

/**
 * Which way the tide goes, as it is written everywhere: an arrow up or down, then the word, as a
 * direction is written with `Bearing`.
 */
export function TideTrend({
  trend,
  className,
}: {
  trend: "rising" | "falling";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-xxs whitespace-nowrap", className)}>
      <ArrowUpIcon
        aria-hidden
        strokeWidth={2.25}
        className={cn("size-[0.85em] shrink-0", trend === "falling" && "rotate-180")}
      />
      {trend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling()}
    </span>
  );
}
