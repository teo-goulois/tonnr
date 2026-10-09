import { ArrowUpIcon, StarBoldIcon, WaveIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps } from "react";

import { type Freshness, formatMeters, formatNumber, formatSeconds } from "@/lib/format";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor, scaleInk } from "@/lib/sea-scales";

/** An arrow that points where the waves or the wind are going, from the bearing they come from. */
export function DirectionArrow({
  fromDegrees,
  className,
}: {
  fromDegrees: number;
  className?: string;
}) {
  return (
    <ArrowUpIcon
      aria-hidden
      strokeWidth={2.25}
      className={cn("size-3.5 shrink-0", className)}
      style={{ rotate: `${fromDegrees + 180}deg` }}
    />
  );
}

/** How recent a reading is: a green dot that beats, an amber one, then a gray one. */
export function FreshnessDot({
  freshness,
  className,
}: {
  freshness: Freshness;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative size-1.5 shrink-0 rounded-full",
        freshness === "fresh" && "bg-success",
        freshness === "aging" && "bg-warning",
        (freshness === "old" || freshness === "none") && "bg-neutral-6",
        className,
      )}
    >
      {freshness === "fresh" && (
        <span className="absolute inset-0 rounded-full bg-success motion-safe:animate-ping" />
      )}
    </span>
  );
}

/** The disc that says a wave height by its color, with the direction of the waves when known. */
export function HeightChip({
  heightMeters,
  directionDegrees,
  className,
}: {
  heightMeters: number;
  directionDegrees: number | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("grid size-6 shrink-0 place-items-center rounded-full", className)}
      style={{
        background: scaleColor(WAVE_HEIGHT_SCALE, heightMeters),
        color: scaleInk(WAVE_HEIGHT_SCALE, heightMeters),
      }}
    >
      {directionDegrees !== null && <DirectionArrow fromDegrees={directionDegrees} />}
    </span>
  );
}

type BuoyPillProps = Omit<ComponentProps<"button">, "children"> & {
  heightMeters: number;
  periodSeconds: number | null;
  directionDegrees: number | null;
  freshness: Freshness;
  selected?: boolean;
  saved?: boolean;
};

/** A buoy on the map: its wave height, period and direction, and how recent the reading is. */
export function BuoyPill({
  heightMeters,
  periodSeconds,
  directionDegrees,
  freshness,
  selected = false,
  saved = false,
  className,
  ...props
}: BuoyPillProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        // structure & layout
        "pointer-events-auto flex h-7 cursor-pointer items-center gap-xxs rounded-full py-0.5 pr-xs pl-0.5",
        // typography
        "text-s font-medium whitespace-nowrap tabular-nums",
        // border & background
        "edge bg-neutral-1 text-neutral-10 [--edge-color:var(--neutral-10-transparent)]",
        // transitions
        "transition-[background-color,color,scale] duration-(--motion-duration) ease-theme",
        // focus
        "focus-ring outline-none",
        // state: hover / selected
        "hover:scale-105",
        selected && "scale-110 bg-color-1 text-neutral-1 hover:scale-110",
        className,
      )}
      {...props}
    >
      <HeightChip heightMeters={heightMeters} directionDegrees={directionDegrees} />
      <span>{formatMeters(heightMeters)}</span>
      {periodSeconds !== null && (
        <span className={cn("text-xs font-normal", selected ? "text-neutral-4" : "text-neutral-7")}>
          {formatSeconds(periodSeconds)}
        </span>
      )}
      {saved && <StarBoldIcon aria-hidden className="size-2.5 shrink-0" />}
      <FreshnessDot freshness={freshness} />
    </button>
  );
}

type WindBadgeProps = Omit<ComponentProps<"button">, "children"> & {
  speedKnots: number;
  // Null when the wind turns too much to say.
  directionDegrees: number | null;
  selected?: boolean;
};

/** A wind station on the map: the speed in knots, on its color, and where the wind is going. */
export function WindBadge({
  speedKnots,
  directionDegrees,
  selected = false,
  className,
  style,
  ...props
}: WindBadgeProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        // structure & layout
        "pointer-events-auto flex h-5.5 cursor-pointer items-center gap-0.5 rounded-(--radius-xs) px-1.5",
        // typography
        "text-xs font-medium whitespace-nowrap tabular-nums",
        // border: a ring of the surface, so two badges that touch stay apart
        "edge [--edge-color:var(--neutral-1)] [--edge-width:var(--border-m)]",
        // transitions
        "transition-[scale] duration-(--motion-duration) ease-theme",
        // focus
        "focus-ring outline-none",
        // state: hover / selected
        "hover:scale-105",
        selected && "scale-110 [--edge-color:var(--neutral-10)] [--edge-width:var(--border-l)]",
        className,
      )}
      style={{
        background: scaleColor(WIND_SPEED_SCALE, speedKnots),
        color: scaleInk(WIND_SPEED_SCALE, speedKnots),
        ...style,
      }}
      {...props}
    >
      {directionDegrees !== null && (
        <DirectionArrow fromDegrees={directionDegrees} className="size-3" />
      )}
      {formatNumber(speedKnots, 0)}
    </button>
  );
}

/**
 * The mark of a surf break: a disc with a wave in it, in the theme's ink since a break measures
 * nothing.
 */
export function BreakDisc({
  onDark = false,
  className,
}: {
  // On a selected pill, whose surface is the ink.
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full [&>svg]:size-3.5",
        onDark ? "bg-neutral-1 text-neutral-10" : "bg-neutral-10 text-neutral-1",
        className,
      )}
    >
      <WaveIcon strokeWidth={1.75} />
    </span>
  );
}

type BreakPillProps = ComponentProps<"span"> & {
  name: string;
  selected?: boolean;
  // The name before the disc, for a pill that has no room after it.
  mirrored?: boolean;
};

/**
 * A surf break the reader points at or has selected: its mark and its name. The map draws the
 * breaks itself, which are too many for a pill each, and puts this one over the break in hand.
 */
export function BreakPill({
  name,
  selected = false,
  mirrored = false,
  className,
  ...props
}: BreakPillProps) {
  return (
    <span
      className={cn(
        // structure & layout
        "flex h-7 max-w-56 items-center gap-xxs rounded-full py-0.5",
        mirrored ? "flex-row-reverse pr-0.5 pl-s" : "pr-s pl-0.5",
        // typography
        "text-s font-medium whitespace-nowrap",
        // border & background
        "edge bg-neutral-1 text-neutral-10 [--edge-color:var(--neutral-10-transparent)]",
        // state: selected
        selected && "scale-110 bg-color-1 text-neutral-1",
        className,
      )}
      {...props}
    >
      <BreakDisc onDark={selected} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Where the user is. */
export function UserDot({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "block size-3.5 rounded-full bg-color-1",
        "edge [--edge-color:var(--neutral-1)] [--edge-width:var(--border-l)]",
        className,
      )}
      {...props}
    >
      <span className="absolute -inset-1.5 rounded-full bg-color-1-transparent motion-safe:animate-ping" />
    </span>
  );
}
