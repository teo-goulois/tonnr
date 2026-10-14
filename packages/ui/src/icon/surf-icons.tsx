import { type ReactNode, useId } from "react";

import type { IconProps } from "./icon-types";

/*
 * What a surf break is like, drawn as Stormrider's guides draw it: a ring, with what it says
 * inside. They are drawn to be read at 40 pixels, beside two lines of text: on a grid of 40, with
 * a line of 1.5 and as few marks as say it, and what stands behind is at Nucleo's second
 * opacity, as in its Fill Duo. Each glyph is drawn from what it says, so that a break's window,
 * tide or level reads in its icon.
 */

const C = 20;
const RING = 18.75;
// What a glyph draws inside is cut at the inside of the ring.
const INSIDE = 18;
const LINE = 1.5;
const DUO = 0.4;

/** A point at a bearing, clockwise from north, and a distance from the center. */
function at(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  const x = C + radius * Math.sin(radians);
  const y = C - radius * Math.cos(radians);
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

/** The sector of the inside from one bearing to another, clockwise. */
function sector(from: number, to: number, radius = INSIDE + 1) {
  const sweep = (((to - from) % 360) + 360) % 360 || 360;
  if (sweep >= 360)
    return `M${C - radius} ${C}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z`;
  return `M${C} ${C}L${at(from, radius)}A${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${at(to, radius)}Z`;
}

/** An arc of a circle from one bearing to another, clockwise. */
function arc(from: number, to: number, radius: number) {
  const sweep = (((to - from) % 360) + 360) % 360 || 360;
  if (sweep >= 360)
    return `M${C - radius} ${C}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  return `M${at(from, radius)}A${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${at(to, radius)}`;
}

/** A row of waves across the glyph, at a height. */
const waves = (y: number) => `M-1 ${y}q3.5-3 7 0t7 0t7 0t7 0t7 0t7 0`;

/**
 * The sectors a set of directions covers, each direction standing for its share of the compass
 * around it, with neighbours joined: what a window of swell or of wind draws.
 */
export function windowOf(bearings: readonly number[], share = 22.5) {
  const slots = Math.round(360 / share);
  const taken = Array.from({ length: slots }, () => false);
  for (const bearing of bearings) {
    taken[((Math.round(bearing / share) % slots) + slots) % slots] = true;
  }
  if (taken.every(Boolean)) return [{ from: 0, to: 360 }];
  // Start after a gap, so that a sector that passes through north is one.
  const start = taken.indexOf(false);
  const sectors: { from: number; to: number }[] = [];
  for (let step = 1; step <= slots; step++) {
    const slot = (start + step) % slots;
    if (!taken[slot]) continue;
    const last = sectors.at(-1);
    const from = slot * share - share / 2;
    if (last && taken[(slot - 1 + slots) % slots]) last.to = from + share;
    else sectors.push({ from, to: from + share });
  }
  return sectors;
}

/** The mean of directions, or none when they are spread all around. */
function meanOf(bearings: readonly number[]) {
  let x = 0;
  let y = 0;
  for (const bearing of bearings) {
    x += Math.sin((bearing * Math.PI) / 180);
    y += Math.cos((bearing * Math.PI) / 180);
  }
  if (bearings.length === 0 || Math.hypot(x, y) < bearings.length * 0.2) return undefined;
  return (Math.atan2(x, y) * 180) / Math.PI;
}

/** The ring, and what is drawn inside it, cut at its inside. */
function Glyph({
  children,
  height,
  size = "1em",
  title,
  width,
  ...props
}: IconProps & { children: ReactNode }) {
  const clip = `surf-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <clipPath id={clip}>
        <circle cx={C} cy={C} r={INSIDE} />
      </clipPath>
      <g
        clipPath={`url(#${clip})`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={LINE}
      >
        {children}
      </g>
      <circle cx={C} cy={C} r={RING} fill="none" stroke="currentColor" strokeWidth={LINE} />
    </svg>
  );
}

const solid = { fill: "currentColor", stroke: "none" } as const;
const duo = { fill: "currentColor", stroke: "none", opacity: DUO } as const;
const faint = { opacity: DUO } as const;

// A row of water as Nucleo draws it in its water levels: scallops that meet at sharp crests.
const water = (y: number) => {
  let d = `M-10 ${y}`;
  for (let crest = 2; crest <= 50; crest += 12) d += `c2.5 3.5 9.5 3.5 12 0`;
  return d;
};
// The rows of water of each third of the tide, from its top.
const TIDE_ROWS = { high: [6.5, 11.5], mid: [17, 22], low: [27.5, 32.5] } as const;

/**
 * The tide's stages a break works at, as Stormrider draws them: the ring holds water where the
 * waves are ridden, at low, mid or high, and stands empty where they are not.
 */
export function TideIcon({
  low = false,
  mid = false,
  high = false,
  ...props
}: IconProps & { low?: boolean; mid?: boolean; high?: boolean }) {
  const thirds = { high, mid, low };
  return (
    <Glyph {...props}>
      {(Object.keys(TIDE_ROWS) as (keyof typeof TIDE_ROWS)[]).flatMap((third) =>
        thirds[third] ? TIDE_ROWS[third].map((y) => <path key={y} d={water(y)} />) : [],
      )}
    </Glyph>
  );
}

/**
 * The directions a swell works from, as Stormrider draws them: what is closed to it stands
 * behind, as land does, and the window open to it holds the swell's rings. A bearing is where
 * the swell comes from.
 */
export function SwellWindowIcon({
  bearings,
  ...props
}: IconProps & { bearings: readonly number[] }) {
  // A window is drawn half a point wider each side, so that a narrow one still reads.
  const open = windowOf(bearings).map(({ from, to }) =>
    to - from >= 360 ? { from, to } : { from: from - 11.25, to: to + 11.25 },
  );
  const closed =
    open.length === 0
      ? [{ from: 0, to: 360 }]
      : open.map(({ to }, index) => ({ from: to, to: (open[index + 1] ?? open[0]!).from }));
  return (
    <Glyph {...props}>
      {closed.map(({ from, to }) =>
        from % 360 === to % 360 && open.length > 0 ? null : (
          <path key={from} d={sector(from, to)} {...duo} />
        ),
      )}
      {open.map(({ from, to }) => (
        <g key={from}>
          <path d={arc(from, to, 7)} />
          <path d={arc(from, to, 12.5)} />
        </g>
      ))}
    </Glyph>
  );
}

/**
 * The directions a wind works from: the window it blows from, and an arrow the way it goes, as
 * a direction is drawn everywhere. An arrow alone, with no window, for one direction such as
 * the offshore wind's.
 */
export function WindWindowIcon({
  bearings,
  window: showWindow = true,
  ...props
}: IconProps & { bearings: readonly number[]; window?: boolean }) {
  const mean = meanOf(bearings);
  const tip = mean === undefined ? undefined : mean + 180;
  return (
    <Glyph {...props}>
      {showWindow &&
        windowOf(bearings).map(({ from, to }) => <path key={from} d={sector(from, to)} {...duo} />)}
      {tip !== undefined && (
        <>
          <path d={`M${at(tip + 180, 9)}L${at(tip, 9)}`} />
          <path d={`M${at(tip - 28, 3.5)}L${at(tip, 9)}L${at(tip + 28, 3.5)}`} />
        </>
      )}
    </Glyph>
  );
}

/**
 * The way a wave breaks, seen from the beach with the sea above: a left breaks to the right of
 * whoever watches it, a right to their left, and a peak both ways.
 */
export function WaveDirectionIcon({
  left = false,
  right = false,
  ...props
}: IconProps & { left?: boolean; right?: boolean }) {
  // Each crest bends toward the shore where it breaks first, and runs straight to its shoulder.
  const crest = (y: number) =>
    left && right
      ? `M0 ${y}H12Q20 ${y + 7} 28 ${y}H40`
      : left
        ? `M7 ${y + 7}Q10 ${y} 17 ${y}H40`
        : `M33 ${y + 7}Q30 ${y} 23 ${y}H0`;
  return (
    <Glyph {...props}>
      <rect x="0" y="30" width="40" height="10" {...duo} />
      {(left || right) && (
        <>
          <path d={crest(11)} />
          <path d={crest(19)} />
        </>
      )}
    </Glyph>
  );
}

export type BreakShape =
  | "beach"
  | "reef"
  | "point"
  | "jetty"
  | "pier"
  | "offshore"
  | "slab"
  | "canyon";

// What stands under the sea at each kind of break, drawn solid as Stormrider draws the land, and
// how high the wave over it stands.
const SHAPES: Record<BreakShape, { wave: number; shape: ReactNode }> = {
  beach: { wave: 17, shape: <path d="M0 27Q20 23 40 27V40H0Z" {...solid} /> },
  reef: { wave: 15, shape: <path d="M0 40V29H9V25H16V28H23V24H30V27H40V40Z" {...solid} /> },
  point: { wave: 15, shape: <path d="M0 14L19 27L23 40H0Z" {...solid} /> },
  jetty: {
    wave: 15,
    shape: (
      <>
        <rect x="0" y="31" width="40" height="9" {...duo} />
        <rect x="17" y="20" width="6" height="20" rx="1.5" {...solid} />
      </>
    ),
  },
  pier: {
    wave: 15,
    shape: (
      <>
        <rect x="0" y="31" width="40" height="9" {...duo} />
        <path d="M16 20V40M24 20V40M16 25H24" />
      </>
    ),
  },
  offshore: { wave: 17, shape: <ellipse cx="20" cy="27" rx="8" ry="3" {...solid} /> },
  slab: { wave: 15, shape: <path d="M0 40V23H21V30H40V40Z" {...solid} /> },
  canyon: { wave: 15, shape: <path d="M0 40V25H13L20 34L27 25H40V40Z" {...solid} /> },
};

/** The kind of a break: what the sea breaks on, under a wave. */
export function BreakTypeIcon({ shape, ...props }: IconProps & { shape: BreakShape }) {
  return (
    <Glyph {...props}>
      <path d={waves(SHAPES[shape].wave)} />
      {SHAPES[shape].shape}
    </Glyph>
  );
}

export type BottomKind = "sand" | "rock" | "coral" | "lava";

// A hard bottom's profile, drawn solid.
const HARD: Record<Exclude<BottomKind, "sand">, string> = {
  rock: "M0 40V27H10V23H18V28H25V24H32V27H40V40Z",
  coral:
    "M0 40V27A4.5 4.5 0 0 1 9 25A4 4 0 0 1 17 26A4.5 4.5 0 0 1 26 24.5A4 4 0 0 1 34 26A4 4 0 0 1 40 27V40Z",
  lava: "M0 40V26L8 21L13 27L20 20L25 26L31 22L40 27V40Z",
};

/** What a break's bottom is: a hard bottom drawn solid, and sand beside it or alone. */
export function BottomIcon({ bottoms, ...props }: IconProps & { bottoms: readonly BottomKind[] }) {
  const hard = (["rock", "coral", "lava"] as const).find((kind) => bottoms.includes(kind));
  const sand = bottoms.includes("sand");
  return (
    <Glyph {...props}>
      {sand && (
        <path d={hard ? "M18 40V27Q27 24 40 25V40Z" : "M0 26Q10 21 20 24.5T40 23V40H0Z"} {...duo} />
      )}
      {sand && !hard && (
        <>
          <circle cx="13" cy="31" r="1.25" {...solid} />
          <circle cx="21" cy="30" r="1.25" {...solid} />
          <circle cx="28" cy="32" r="1.25" {...solid} />
        </>
      )}
      {hard && <path d={HARD[hard]} {...solid} transform={sand ? "scale(0.55 1)" : undefined} />}
    </Glyph>
  );
}

/**
 * The levels a break suits, on a dial from the first to the last: the range is drawn behind the
 * needle, which stands at its middle. Levels count from 0.
 */
export function LevelIcon({
  levels,
  of = 4,
  ...props
}: IconProps & { levels: readonly number[]; of?: number }) {
  const angle = (level: number) => -90 + (180 * (level + 0.5)) / of;
  const known = levels.length > 0;
  const lowest = Math.min(...levels);
  const highest = Math.max(...levels);
  const needle = angle((lowest + highest) / 2);
  return (
    <Glyph {...props}>
      {known && <path d={sector(angle(lowest) - 90 / of, angle(highest) + 90 / of)} {...duo} />}
      <path d={`M${at(-90, 13)}L${at(-90, 16)}M${at(90, 13)}L${at(90, 16)}`} {...faint} />
      {known && <path d={`M${C} ${C}L${at(needle, 12)}`} />}
      <circle cx={C} cy={C} r="2" {...solid} />
    </Glyph>
  );
}

/** A board: what is ridden at a break. */
export function BoardIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <g transform={`rotate(30 ${C} ${C})`}>
        <path d="M20 6C25 11 25.5 24 23.5 33H16.5C14.5 24 15 11 20 6Z" />
        <path d="M20 12V29" {...faint} />
      </g>
    </Glyph>
  );
}

export type Season = "winter" | "spring" | "summer" | "autumn";

// Each season is a quarter of the year round the ring, winter at its top.
const QUARTERS: Record<Season, number> = { winter: 0, spring: 90, summer: 180, autumn: 270 };

/** The seasons a break works best in, as quarters of the year: those it works in are solid. */
export function SeasonIcon({ seasons, ...props }: IconProps & { seasons: readonly Season[] }) {
  return (
    <Glyph {...props}>
      {(Object.keys(QUARTERS) as Season[]).map((season) => {
        const middle = QUARTERS[season];
        return (
          <path
            key={season}
            d={sector(middle - 38, middle + 38, 11)}
            {...(seasons.includes(season) ? solid : duo)}
          />
        );
      })}
    </Glyph>
  );
}
