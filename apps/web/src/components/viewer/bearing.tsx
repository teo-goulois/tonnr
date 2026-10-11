import { cn } from "@repo/ui/lib/utils";

import { compassPoint, formatNumber } from "@/lib/format";

import { DirectionArrow } from "./map-markers";

/**
 * Where a wind or a swell comes from, as it is written everywhere: an arrow that points the way
 * it goes, then the name of the point it comes from. A name alone asks the reader to turn it
 * into a direction, and the arrow has done it.
 */
export function Bearing({
  degrees,
  withDegrees = false,
  className,
}: {
  // Clockwise from north, where it comes from.
  degrees: number;
  // Writes the figure after the name, as "S 190°".
  withDegrees?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-xxs whitespace-nowrap", className)}>
      <DirectionArrow fromDegrees={degrees} className="size-[0.85em]" />
      {compassPoint(degrees)}
      {withDegrees && ` ${formatNumber(degrees, 0)}°`}
    </span>
  );
}
