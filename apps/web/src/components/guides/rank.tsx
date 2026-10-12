import { cn } from "@repo/ui/lib/utils";
import { type ComponentProps, useId } from "react";

import { m } from "@/paraglide/messages.js";

import type { Rank } from "../viewer/types";
import { RANKS } from "./guide-words";

/**
 * A wave of an emblem: a line whose troughs are round and whose crests are points, as the water
 * of the app's wave icon is drawn. It starts and ends at the bottom of a trough, with a whole
 * trough between the two: `width` is that trough's, and `depth` how far under its crests it goes.
 */
const wave = (y: number, from: number, width: number, depth: number) =>
  `M${from} ${y}q${width / 4} 0 ${width / 2} ${-depth}` +
  `q${width / 2} ${2 * depth} ${width} 0q${width / 4} ${depth} ${width / 2} ${depth}`;

// The emblem of each rank, drawn in a square of 24: a pin with a rim, a field and its waves, one
// more at each rank. The outline changes with the rank as well, so that none is told by its
// color alone: a coin, a shield, then a shield that wears a crown. The colors are the ranks' own,
// as the sea's are in `lib/sea-scales.ts`: the theme has none for them, and they are read on a
// light screen and on a dark one alike.
const EMBLEMS: Record<
  Rank,
  { outline: string; rim: string; top: string; bottom: string; ink: string; waves: string[] }
> = {
  qs: {
    outline: "M12 1.5a10.5 10.5 0 1 0 0 21a10.5 10.5 0 1 0 0-21Z",
    rim: "#087686",
    top: "#3bd2c2",
    bottom: "#0a8fa3",
    ink: "#ffffff",
    waves: [wave(13.2, 6.2, 5.8, 1.9)],
  },
  cs: {
    outline: "M12 1.6 20.4 4.3v7.5c0 5.3-3.6 8.7-8.4 10.6C7.2 20.5 3.6 17.1 3.6 11.8V4.3Z",
    rim: "#4227bd",
    top: "#9a8cff",
    bottom: "#5638e0",
    ink: "#ffffff",
    waves: [wave(11.1, 6.4, 5.6, 1.7), wave(14.9, 6.4, 5.6, 1.7)],
  },
  ct: {
    outline:
      "M3.6 3 7.9 5.6 12 1.7l4.1 3.9L20.4 3v8.8c0 5.3-3.6 8.7-8.4 10.6C7.2 20.5 3.6 17.1 3.6 11.8Z",
    rim: "#c47b06",
    top: "#ffe072",
    bottom: "#f3a012",
    ink: "#4a2c00",
    waves: [wave(9.9, 6.9, 5.1, 1.5), wave(13.2, 6.9, 5.1, 1.5), wave(16.5, 6.9, 5.1, 1.5)],
  },
};

// From this size an emblem has room for a finer rim and a light along it.
const FINE_FROM = 28;

/** A shape drawn around the middle of the square, a little smaller than it is given. */
const inset = (scale: number) => `translate(12 12) scale(${scale}) translate(-12 -12)`;

type RankBadgeProps = Omit<ComponentProps<"svg">, "children" | "viewBox" | "width" | "height"> & {
  rank: Rank;
  // The side of the emblem, in pixels: 16 beside a username, more where the rank is the subject.
  size?: number;
  // A rank that is not reached yet: the emblem in the theme's grays.
  locked?: boolean;
};

/**
 * The emblem of a rank. It says the rank's name to who cannot see it, unless what draws it
 * hides it from them because the name is written beside.
 */
export function RankBadge({
  rank,
  size = 16,
  locked = false,
  className,
  ...props
}: RankBadgeProps) {
  // Two emblems on a page must not share the name of a gradient.
  const gradient = `rank-${useId().replace(/[^\w-]/g, "")}`;
  const emblem = EMBLEMS[rank];
  const name = RANKS[rank].name();
  const isFine = size >= FINE_FROM;
  const field = isFine ? 0.86 : 0.88;
  const rim = locked ? "var(--neutral-4)" : emblem.rim;
  const fill = locked ? "var(--neutral-3)" : `url(#${gradient})`;
  const isHidden = props["aria-hidden"] === true || props["aria-hidden"] === "true";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={isHidden ? undefined : "img"}
      aria-label={isHidden ? undefined : m.rank_label({ name })}
      data-rank={rank}
      className={cn("shrink-0", className)}
      {...props}
    >
      {!isHidden && <title>{name}</title>}
      {!locked && (
        <defs>
          <linearGradient id={gradient} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor={emblem.top} />
            <stop offset="1" stopColor={emblem.bottom} />
          </linearGradient>
        </defs>
      )}
      <path d={emblem.outline} fill={rim} stroke={rim} strokeWidth={1.2} strokeLinejoin="round" />
      <path
        d={emblem.outline}
        fill={fill}
        stroke={fill}
        strokeWidth={1}
        strokeLinejoin="round"
        transform={inset(field)}
      />
      {isFine && !locked && (
        <path
          d={emblem.outline}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.38}
          strokeWidth={0.7}
          strokeLinejoin="round"
          transform={inset(field - 0.05)}
        />
      )}
      {emblem.waves.map((path) => (
        <path
          key={path}
          d={path}
          fill="none"
          stroke={locked ? "var(--neutral-5)" : emblem.ink}
          // The smaller the emblem, the bolder its waves: they must still be read.
          strokeWidth={(rank === "ct" ? 1.6 : 1.8) + (isFine ? 0 : 0.2)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

type UsernameProps = {
  name: string;
  // The rank the account reached. Null for one that has reached none.
  rank: Rank | null | undefined;
  // The side of the emblem, in pixels, for a line of larger text.
  size?: number;
  className?: string;
};

/**
 * An account as others read it: its username, then the emblem of the rank it reached. Every
 * screen writes an account with this, so that it reads the same on a line of a guide, among
 * friends and in its own panel. A name too long for its line is cut, and the emblem stays.
 */
export function Username({ name, rank, size, className }: UsernameProps) {
  return (
    <span className={cn("inline-flex max-w-full min-w-0 items-center gap-xxs", className)}>
      <span className="truncate">@{name}</span>
      {rank && <RankBadge rank={rank} size={size} />}
    </span>
  );
}

/**
 * Who wrote a line of a guide: a username and a rank, and nothing else of the account. A line
 * whose author is gone, or has no username, is a contributor's.
 */
export function Author({ by }: { by: { username: string; rank: Rank | null } | null }) {
  if (!by) return <span>{m.guide_by_nobody()}</span>;
  return <Username name={by.username} rank={by.rank} />;
}
