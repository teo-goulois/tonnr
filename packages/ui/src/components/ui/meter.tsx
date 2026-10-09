"use client";

import { Meter as MeterPrimitive } from "@base-ui/react/meter";
import { cn } from "@repo/ui/lib/utils";
import type React from "react";

// Colors and radius follow the Meter assignments of the Tonnr theme, in
// gui/themes/tonnr-components.md. The parts are the registry's.

/** How full the meter is, for the color of its indicator: the theme's `low` and `high` states. */
export type MeterLevel = "rest" | "low" | "high";

export function Meter({
  className,
  children,
  ...props
}: MeterPrimitive.Root.Props): React.ReactElement {
  return (
    <MeterPrimitive.Root className={cn("flex w-full flex-col gap-xs", className)} {...props}>
      {children ? (
        children
      ) : (
        <MeterTrack>
          <MeterIndicator />
        </MeterTrack>
      )}
    </MeterPrimitive.Root>
  );
}

export function MeterLabel({
  className,
  ...props
}: MeterPrimitive.Label.Props): React.ReactElement {
  return (
    <MeterPrimitive.Label
      className={cn("text-s font-medium text-neutral-10", className)}
      data-slot="meter-label"
      {...props}
    />
  );
}

export function MeterTrack({
  className,
  ...props
}: MeterPrimitive.Track.Props): React.ReactElement {
  return (
    <MeterPrimitive.Track
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-neutral-3", className)}
      data-slot="meter-track"
      {...props}
    />
  );
}

export function MeterIndicator({
  className,
  level = "rest",
  ...props
}: MeterPrimitive.Indicator.Props & { level?: MeterLevel }): React.ReactElement {
  return (
    <MeterPrimitive.Indicator
      className={cn(
        // structure & layout
        "rounded-full",
        // border & background
        level === "rest" && "bg-color-1",
        level === "low" && "bg-warning",
        level === "high" && "bg-error",
        // transitions
        "transition-[width,background-color] duration-(--motion-large-duration) ease-theme-large",
        className,
      )}
      data-level={level}
      data-slot="meter-indicator"
      {...props}
    />
  );
}

export function MeterValue({
  className,
  ...props
}: MeterPrimitive.Value.Props): React.ReactElement {
  return (
    <MeterPrimitive.Value
      className={cn("text-s text-neutral-7 tabular-nums", className)}
      data-slot="meter-value"
      {...props}
    />
  );
}

export { MeterPrimitive };
