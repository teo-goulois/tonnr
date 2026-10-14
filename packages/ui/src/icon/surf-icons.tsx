import { type ReactNode, useId } from "react";

import type { IconProps } from "./icon-types";

/*
 * What a surf break is like, drawn as Stormrider's guides draw it: a ring, with what it says
 * inside. They are drawn on Nucleo Micro Bold's grid, 20 pixels with a ring of 7 and a stroke
 * of 2, and what stands behind is at Nucleo's second opacity, as in its Fill Duo. Each glyph is
 * drawn from what it says, so that a break's window, tide or level reads in its icon.
 */

const C = 10;
const RING = 7;
// What a glyph draws inside is cut at the inside of the ring.
const INSIDE = 6;
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

/** A row of small waves across the glyph, at a height. */
const waves = (y: number) => `M1 ${y}q1.5-1.25 3 0t3 0t3 0t3 0t3 0t3 0`;

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
      viewBox="0 0 20 20"
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
        strokeWidth="1.5"
      >
        {children}
      </g>
      <circle cx={C} cy={C} r={RING} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const solid = { fill: "currentColor", stroke: "none" } as const;
const duo = { fill: "currentColor", stroke: "none", opacity: DUO } as const;

/** The tide's stages a break works at, from low to high: a row of waves for each. */
export function TideIcon({
  low = false,
  mid = false,
  high = false,
  ...props
}: IconProps & { low?: boolean; mid?: boolean; high?: boolean }) {
  return (
    <Glyph {...props}>
      {high && <path d={waves(7)} />}
      {mid && <path d={waves(10.25)} />}
      {low && <path d={waves(13.5)} />}
    </Glyph>
  );
}

/**
 * The directions a swell works from, as Stormrider draws them: what is closed to it stands
 * behind, as land does, and the window open to it holds the swell's rings. A bearing is where the swell
 * comes from.
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
      : open.map(({ to }, index) => ({
          from: to,
          to: (open[index + 1] ?? open[0]!).from,
        }));
  return (
    <Glyph {...props}>
      {/* The swell's rings, as they come in through the window. */}
      {open.map(({ from, to }) => (
        <g key={from}>
          <path d={arc(from, to, 2.75)} />
          <path d={arc(from, to, 5.25)} />
        </g>
      ))}
      {closed.map(({ from, to }) =>
        from % 360 === to % 360 && open.length > 0 ? null : (
          <path key={from} d={sector(from, to)} {...duo} />
        ),
      )}
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
        <g strokeWidth="2">
          <path d={`M${at(tip + 180, 3.5)}L${at(tip, 3.5)}`} />
          <path d={`M${at(tip - 35, 1.25)}L${at(tip, 3.5)}L${at(tip + 35, 1.25)}`} />
        </g>
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
      ? `M2 ${y}H6Q10 ${y + 3.5} 14 ${y}H18`
      : left
        ? `M4 ${y + 3}Q5.5 ${y} 9 ${y}H18`
        : `M16 ${y + 3}Q14.5 ${y} 11 ${y}H2`;
  return (
    <Glyph {...props}>
      <rect x="0" y="14.5" width="20" height="6" {...duo} />
      {(left || right) && (
        <>
          <path d={crest(6.5)} />
          <path d={crest(10.5)} />
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

// What stands under the sea at each kind of break, drawn solid as Stormrider draws the land.
const SHAPES: Record<BreakShape, ReactNode> = {
  beach: <path d="M0 13.5Q10 11.5 20 13.5V20H0Z" {...solid} />,
  reef: (
    <>
      <rect x="0" y="15.5" width="20" height="5" {...duo} />
      <path d="M0 20V14.5H4.5V12.5H8V14H11.5V12H15V13.5H20V20Z" {...solid} />
    </>
  ),
  point: <path d="M0 6.5L9.5 13.5L12 20H0Z" {...solid} />,
  jetty: (
    <>
      <rect x="0" y="15" width="20" height="5" {...duo} />
      <rect x="8.5" y="8" width="3" height="12" rx="0.75" {...solid} />
    </>
  ),
  pier: (
    <>
      <rect x="0" y="15" width="20" height="5" {...duo} />
      <path d="M8 7V20M12 7V20M8 9.5H12M8 12.5H12M8 15.5H12" />
    </>
  ),
  offshore: <ellipse cx="10" cy="13.75" rx="4" ry="1.75" {...solid} />,
  slab: <path d="M0 20V11.5H10.5V15H20V20Z" {...solid} />,
  canyon: <path d="M0 20V12.5H7L10 17L13 12.5H20V20Z" {...solid} />,
};

/** The kind of a break: what the sea breaks on, under the waves. */
export function BreakTypeIcon({ shape, ...props }: IconProps & { shape: BreakShape }) {
  // The waves stand over the shape, and go round what rises through them.
  const under = shape === "point" ? 12 : shape === "beach" || shape === "offshore" ? 9 : 8;
  return (
    <Glyph {...props}>
      <path d={waves(under - 3.25)} />
      {shape !== "point" && shape !== "jetty" && shape !== "pier" && <path d={waves(under)} />}
      {SHAPES[shape]}
    </Glyph>
  );
}

export type BottomKind = "sand" | "rock" | "coral" | "lava";

// A hard bottom's profile, drawn solid.
const HARD: Record<Exclude<BottomKind, "sand">, string> = {
  rock: "M0 20V13.5H5V11.5H9V14H12.5V12H16V13.5H20V20Z",
  coral:
    "M0 20V13.5A2.25 2.25 0 0 1 4.5 12.5A2 2 0 0 1 8.5 13A2.25 2.25 0 0 1 13 12.25A2 2 0 0 1 17 13A2 2 0 0 1 20 13.5V20Z",
  lava: "M0 20V13L4 10.5L6.5 13.5L10 10L12.5 13L15.5 11L20 13.5V20Z",
};

/** What a break's bottom is: a hard bottom drawn solid, and sand behind it or alone. */
export function BottomIcon({ bottoms, ...props }: IconProps & { bottoms: readonly BottomKind[] }) {
  const hard = (["rock", "coral", "lava"] as const).find((kind) => bottoms.includes(kind));
  const sand = bottoms.includes("sand");
  return (
    <Glyph {...props}>
      {sand && (
        <path
          d={hard ? "M9 20V13.25Q13 11.75 20 12.5V20Z" : "M0 13Q5 10.5 10 12.25T20 11.5V20H0Z"}
          {...duo}
        />
      )}
      {sand &&
        (hard
          ? [
              [12.5, 15],
              [14.5, 16.75],
            ]
          : [
              [6, 15.25],
              [10, 14.75],
              [14, 15.75],
              [8, 17.25],
            ]
        ).map(([x, y]) => <circle key={`${x} ${y}`} cx={x} cy={y} r="0.8" {...solid} />)}
      {hard && (
        <path
          d={HARD[hard]}
          {...solid}
          transform={sand ? "translate(-0.5 0) scale(0.55 1)" : undefined}
        />
      )}
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
  const lowest = Math.min(...levels);
  const highest = Math.max(...levels);
  const known = levels.length > 0;
  const needle = angle((lowest + highest) / 2);
  return (
    <Glyph {...props}>
      {known && <path d={sector(angle(lowest) - 90 / of, angle(highest) + 90 / of)} {...duo} />}
      {known && (
        <g strokeWidth="2">
          <path d={`M${at(needle + 180, 1.5)}L${at(needle, 4.5)}`} />
        </g>
      )}
      <circle cx={C} cy={C} r="1.25" {...solid} />
    </Glyph>
  );
}

/** A board: what is ridden at a break. */
export function BoardIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <g transform={`rotate(25 ${C} ${C})`}>
        <path d="M10 3.25C13 6 13.25 12.25 12 16.75H8C6.75 12.25 7 6 10 3.25Z" {...solid} />
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
            d={sector(middle - 37, middle + 37, 4.5)}
            {...(seasons.includes(season) ? solid : duo)}
          />
        );
      })}
    </Glyph>
  );
}
