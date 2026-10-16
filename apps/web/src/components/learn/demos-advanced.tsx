import { LIKED_SESSIONS } from "@repo/conditions/sessions/liked";
import { type CSSProperties, useId, useRef, useState } from "react";

import { rangeWords } from "@/components/alerts/alert-words";
import { RatingStars } from "@/components/sessions/rating";
import { UnitTabs } from "@/components/shared/units-settings";
import { useArrivalOf } from "@/components/landing/landing-parts";
import { Bearing } from "@/components/viewer/bearing";
import { formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { WAVE_HEIGHT_SCALE, WAVE_PERIOD_SCALE, scaleColor } from "@/lib/sea-scales";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Arrow, Control, Demo, Hint, Moving, Readout, Scene, at, rounded } from "./demo";

// The demos of the advanced guide, over invented figures: what the figures are made of, and
// where they end, in an alert made of the sessions one logged. Decision 060.
//
// Each demo also moves a little of its own while it is in view, as the landing's cards do: what
// arrives comes in once, as the demo is reached, and what loops is drawn only while it is in view
// and the reader did not ask for less motion. Nothing of it moves what the slider sets, and the
// server draws every demo at rest, as the reader without a script sees it.

/** Where a demo stands: whether its arrival is still to come, and whether it may move now. */
function useShown() {
  const ref = useRef<HTMLDivElement>(null);
  const { stage, moving } = useArrivalOf(ref);
  // An id for the gradients, masks and clips a demo draws, written as an SVG reference takes it.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return { ref, waiting: stage === "wait", moving, id };
}

/** A transition written on an element, which waits `delay` milliseconds after the demo arrives. */
const arriving = (properties: string, duration: number, delay = 0): CSSProperties => ({
  transitionProperty: properties,
  transitionDuration: `${duration}ms`,
  transitionDelay: `${delay}ms`,
  transitionTimingFunction: "var(--motion-large-easing, ease-out)",
});

// A coast of a hundred kilometres across, seen from above, with a cove three kilometres wide.
const MODEL_SCENE = { width: 320, height: 160, kmPerPixel: 100 / 320 };
// Where the shore runs at a height of the scene, the cove left out: the land is to its right.
const shoreAt = (y: number) => 205 - 10 * Math.sin((y / MODEL_SCENE.height) * Math.PI);
// The cove: ten pixels across, about three kilometres, and sixteen deep into the land. It stands
// where a 25 km cell around it is land and no 8 km cell has its centre in it.
const COVE = { y: 76, half: 5, depth: 16 };
function coastAt(y: number) {
  const t = (y - COVE.y) / COVE.half;
  return Math.abs(t) < 1 ? shoreAt(y) + COVE.depth * Math.sqrt(1 - t * t) : shoreAt(y);
}
// The coast is drawn from the same line that tells the sea from the land, so that a cell is
// judged on what the reader sees.
const COAST_LINE = Array.from(
  { length: MODEL_SCENE.height * 2 + 1 },
  (_, index) => `${index ? "L" : "M"}${rounded(coastAt(index / 2))} ${index / 2}`,
).join("");
const COAST = `${COAST_LINE}L320 160L320 0Z`;
const isSea = (x: number, y: number) => x < coastAt(y);
const inCove = (x: number, y: number) => isSea(x, y) && x > shoreAt(y);
const RESOLUTIONS = [25, 8, 2] as const;

/** A coast under the grids of three models: what a cell sees, and what it does not. */
export function ModelsDemo() {
  const shown = useShown();
  const [step, setStep] = useState(1);
  const km = RESOLUTIONS[step]!;
  const cell = km / MODEL_SCENE.kmPerPixel;
  const columns = Math.ceil(MODEL_SCENE.width / cell);
  const rows = Math.ceil(MODEL_SCENE.height / cell);
  const cells: { x: number; y: number; sea: boolean; cove: boolean }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * cell;
      const y = row * cell;
      const centre = { x: x + cell / 2, y: y + cell / 2 };
      cells.push({
        x: rounded(x),
        y: rounded(y),
        sea: isSea(centre.x, centre.y),
        cove: inCove(centre.x, centre.y),
      });
    }
  }
  // The cove has a cell of its own when one's centre falls in it.
  const coveSeen = cells.some((one) => one.cove);
  const sea = scaleColor(WAVE_HEIGHT_SCALE, 1);
  return (
    <div ref={shown.ref}>
      <Demo>
        <Scene viewBox={`0 0 ${MODEL_SCENE.width} ${MODEL_SCENE.height}`}>
          <defs>
            <linearGradient id={`${shown.id}-run`}>
              <stop offset="0" stopColor="white" stopOpacity={0} />
              <stop offset="0.5" stopColor="white" stopOpacity={0.35} />
              <stop offset="1" stopColor="white" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={COAST} className="fill-neutral-4" />
          {/* The cells come in from the open sea to the coast as the demo arrives, as a run
              computes them. */}
          {cells.map((one) => (
            <rect
              key={`${one.x}-${one.y}`}
              x={one.x}
              y={one.y}
              width={rounded(cell)}
              height={rounded(cell)}
              fill={one.sea ? sea : undefined}
              className={one.sea ? "stroke-neutral-1" : "fill-neutral-4 stroke-neutral-1"}
              strokeWidth={0.6}
              style={{
                opacity: shown.waiting ? 0 : one.sea ? (one.cove ? 0.6 : 0.35) : 0.8,
                ...arriving("opacity", 500, rounded((one.x / MODEL_SCENE.width) * 700)),
              }}
            />
          ))}
          {/* The real coast over the cells: what the model makes of it shows against it. */}
          <path d={COAST_LINE} fill="none" className="stroke-neutral-7" strokeWidth={0.8} />
          {/* While the demo is in view, a run passes over the grid now and then. */}
          {shown.moving && (
            <rect
              x={-60}
              y={0}
              width={60}
              height={MODEL_SCENE.height}
              fill={`url(#${shown.id}-run)`}
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0 0;${MODEL_SCENE.width + 60} 0;${MODEL_SCENE.width + 60} 0`}
                keyTimes="0;0.6;1"
                dur="5s"
                repeatCount="indefinite"
              />
            </rect>
          )}
          <circle
            cx={rounded(shoreAt(COVE.y) + 7)}
            cy={COVE.y}
            r={2.5}
            className="fill-neutral-10"
          />
          <text x={184} y={104} fontSize={9} textAnchor="end" className="fill-neutral-7">
            {m.learn_a_models_cove()}
          </text>
          <line
            x1={186}
            y1={100}
            x2={rounded(shoreAt(COVE.y) + 5)}
            y2={COVE.y + 3}
            className="stroke-neutral-6"
            strokeWidth={0.8}
          />
        </Scene>
        <Readout
          figure={<Moving>{m.learn_a_models_cells({ km: formatNumber(km, 0) })}</Moving>}
          verdict={coveSeen ? m.learn_a_models_seen() : m.learn_a_models_unseen()}
        />
        <Control
          label={m.learn_g_resolution_word()}
          value={step}
          min={0}
          max={2}
          text={`${formatNumber(km, 0)} km`}
          onChange={setStep}
        />
        <Hint>{m.learn_a_models_hint()}</Hint>
      </Demo>
    </div>
  );
}

// A buoy's day against the model's week: the buoy's noise, and a gap that grows with the days.
const CHART = { width: 320, height: 130, left: 10, right: 310, top: 12, bottom: 110, max: 3.5 };
const noise = (index: number) => {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return value - Math.floor(value) - 0.5;
};
const modelAt = (days: number) => 1.6 + 0.8 * Math.sin(days * 1.1) + 0.3 * Math.sin(days * 3.7);
const spread = (days: number) => 0.15 + 0.12 * days;
const chartX = (days: number) =>
  rounded(CHART.left + ((days + 1) / 8) * (CHART.right - CHART.left));
const chartY = (meters: number) =>
  rounded(CHART.bottom - (meters / CHART.max) * (CHART.bottom - CHART.top));
const BUOY = Array.from({ length: 25 }, (_, index) => {
  const days = -1 + index / 24;
  return { days, meters: modelAt(days) + 0.12 * noise(index) + 0.08 * Math.sin(index) };
});
// The model's run, hour by hour in steps of two, from a day back to the seventh day ahead, where
// the slider ends.
const MODEL = Array.from({ length: 8 * 12 + 1 }, (_, index) => {
  const days = -1 + index / 12;
  return { days, meters: modelAt(days) };
});
const line = (points: { days: number; meters: number }[]) =>
  points
    .map((point, index) => `${index ? "L" : "M"}${chartX(point.days)} ${chartY(point.meters)}`)
    .join("");
const BUOY_NOW = BUOY[BUOY.length - 1]!;

/** The buoy that measured, the model that computed, and how far ahead the model is still trusted. */
export function BuoysDemo() {
  useUnits();
  const shown = useShown();
  const [days, setDays] = useState(2);
  const gap = spread(days);
  const model = modelAt(days);
  // The cone of what the model may miss: its upper edge forward, then its lower edge back.
  const ahead = MODEL.filter((point) => point.days >= 0);
  const upper = ahead.map(
    (point, index) =>
      `${index ? "L" : "M"}${chartX(point.days)} ${chartY(point.meters + spread(point.days))}`,
  );
  const lower = ahead
    .map(
      (point) => `L${chartX(point.days)} ${chartY(Math.max(0, point.meters - spread(point.days)))}`,
    )
    .reverse();
  const fan = `${upper.join("")}${lower.join("")}Z`;
  const verdict =
    days <= 2
      ? m.learn_a_buoys_trust()
      : days <= 4
        ? m.learn_a_buoys_trend()
        : m.learn_a_buoys_guess();
  const modelColor = scaleColor(WAVE_PERIOD_SCALE, 10);
  const buoyColor = scaleColor(WAVE_HEIGHT_SCALE, 1.8);
  return (
    <div ref={shown.ref}>
      <Demo>
        <Scene viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
          {/* As the demo arrives, the buoy's day is drawn first, from the left, then the model's
              week is unveiled after it: what was measured, then what is computed. */}
          <defs>
            <clipPath id={`${shown.id}-week`}>
              <rect
                x={0}
                y={0}
                width={CHART.width}
                height={CHART.height}
                style={{
                  transform: shown.waiting ? "scaleX(0)" : "scaleX(1)",
                  transformOrigin: "0 0",
                  ...arriving("transform", 1400, 700),
                }}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${shown.id}-week)`}>
            <path d={fan} fill={modelColor} opacity={0.18} />
            <path
              d={line(MODEL)}
              fill="none"
              stroke={modelColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          </g>
          <path
            d={line(BUOY)}
            fill="none"
            stroke={buoyColor}
            strokeWidth={2}
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            style={{
              strokeDashoffset: shown.waiting ? 1 : 0,
              ...arriving("stroke-dashoffset", 900),
            }}
          />
          {/* The buoy's last reading beats while the demo is in view, as a fresh one does on the map. */}
          <circle cx={chartX(0)} cy={chartY(BUOY_NOW.meters)} r={2.5} fill={buoyColor} />
          {shown.moving && (
            <circle cx={chartX(0)} cy={chartY(BUOY_NOW.meters)} r={2.5} fill={buoyColor}>
              <animate
                attributeName="r"
                values="2.5;8;8"
                keyTimes="0;0.5;1"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.6;0;0"
                keyTimes="0;0.5;1"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          )}
          <line
            x1={chartX(0)}
            y1={CHART.top}
            x2={chartX(0)}
            y2={CHART.bottom}
            className="stroke-neutral-6"
            strokeDasharray="2 2"
          />
          <text x={chartX(0) + 3} y={CHART.top + 8} fontSize={9} className="fill-neutral-7">
            {m.learn_a_buoys_now()}
          </text>
          <line
            x1={chartX(days)}
            y1={CHART.top}
            x2={chartX(days)}
            y2={CHART.bottom}
            className="stroke-neutral-10"
            strokeDasharray="3 3"
          />
          <circle cx={chartX(days)} cy={chartY(model)} r={4} fill={modelColor} />
        </Scene>
        <Readout
          figure={
            <Moving>
              {m.learn_a_buoys_gap({ height: formatHeight(model), gap: formatHeight(gap) })}
            </Moving>
          }
          verdict={verdict}
        >
          <UnitTabs measure="height" />
        </Readout>
        <Control
          label={m.learn_a_buoys_ahead()}
          value={days}
          min={0}
          max={7}
          step={0.5}
          text={m.learn_a_buoys_days({ days: formatNumber(days, 1) })}
          onChange={setDays}
        />
        <Hint>{m.learn_a_buoys_hint()}</Hint>
      </Demo>
    </div>
  );
}

const PRIMARY = { meters: 1.5, seconds: 14, from: 290 };
const SECOND = { seconds: 8, from: 200 };
// A train of swell is drawn as crests across the whole scene, so that it may advance without an
// end showing: the centre, and how far a crest reaches on each side.
const TRAIN = { cx: 160, cy: 85, reach: 220 };

/** The crests of one swell, the way it goes, a gap apart, advancing while the demo is in view. */
function Train({
  from,
  gap,
  seconds,
  color,
  opacity,
  moving,
}: {
  from: number;
  gap: number;
  seconds: number;
  color: string;
  opacity: number;
  moving: boolean;
}) {
  const count = Math.ceil(TRAIN.reach / gap);
  const step = at(0, 0, from + 180, gap);
  return (
    <g style={{ opacity: rounded(opacity), ...arriving("opacity", 300) }}>
      <g>
        {Array.from({ length: count * 2 + 1 }, (_, index) => {
          const centre = at(TRAIN.cx, TRAIN.cy, from, (index - count) * gap);
          const left = at(centre.x, centre.y, from + 90, TRAIN.reach);
          const right = at(centre.x, centre.y, from - 90, TRAIN.reach);
          return (
            <line
              key={index}
              x1={left.x}
              y1={left.y}
              x2={right.x}
              y2={right.y}
              stroke={color}
              strokeWidth={2}
            />
          );
        })}
        {/* A crest moves one gap the way the swell goes in a fifth of its period, and the next
            takes its place: the long swell comes on in slow, wide steps, the short one in quick
            ones. */}
        {moving && (
          <animateTransform
            attributeName="transform"
            type="translate"
            from="0 0"
            to={`${step.x} ${step.y}`}
            dur={`${seconds / 5}s`}
            repeatCount="indefinite"
          />
        )}
      </g>
    </g>
  );
}

/** Two swells at once: the long one from afar, a short one to raise, and the sea they make. */
export function SecondaryDemo() {
  useUnits();
  const shown = useShown();
  const [meters, setMeters] = useState(0.6);
  const total = rounded(Math.sqrt(PRIMARY.meters ** 2 + meters ** 2));
  // The table writes the bigger swell first, as the main one.
  const swells = [
    { key: "long", ...PRIMARY, isSet: false },
    { key: "short", meters, ...SECOND, isSet: true },
  ].sort((one, other) => other.meters - one.meters);
  return (
    <div ref={shown.ref}>
      <Demo>
        <Scene viewBox="0 0 320 170" className="overflow-hidden">
          <g style={{ opacity: shown.waiting ? 0 : 1, ...arriving("opacity", 900) }}>
            <Train
              from={PRIMARY.from}
              gap={22}
              seconds={PRIMARY.seconds}
              color={scaleColor(WAVE_PERIOD_SCALE, PRIMARY.seconds)}
              opacity={0.7}
              moving={shown.moving}
            />
            <Train
              from={SECOND.from}
              gap={12}
              seconds={SECOND.seconds}
              color={scaleColor(WAVE_PERIOD_SCALE, SECOND.seconds)}
              opacity={meters === 0 ? 0 : Math.min(0.8, 0.15 + meters / 2)}
              moving={shown.moving}
            />
          </g>
        </Scene>
        <table className="w-full text-s">
          <tbody>
            {swells.map((swell, index) => (
              <tr key={swell.key}>
                <th className="py-xxs text-left font-medium">
                  {index === 0 ? m.learn_a_secondary_primary() : m.learn_g_secondary_swell_word()}
                </th>
                <td className="text-right tabular-nums">
                  {swell.isSet ? (
                    <Moving>{`${formatHeight(swell.meters)} · ${formatSeconds(swell.seconds)}`}</Moving>
                  ) : (
                    `${formatHeight(swell.meters)} · ${formatSeconds(swell.seconds)}`
                  )}
                </td>
                <td className="text-right">
                  <Bearing degrees={swell.from} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Readout
          figure={<Moving>{m.learn_a_secondary_total({ height: formatHeight(total) })}</Moving>}
          verdict={
            meters < 0.3
              ? m.learn_a_secondary_clean()
              : meters < 1
                ? m.learn_a_secondary_sets()
                : m.learn_a_secondary_crossed()
          }
        >
          <UnitTabs measure="height" />
        </Readout>
        <Control
          label={m.learn_a_secondary_second()}
          value={meters}
          min={0}
          max={1.8}
          step={0.1}
          text={formatHeight(meters)}
          onChange={setMeters}
        />
        <Hint>{m.learn_a_secondary_hint()}</Hint>
      </Demo>
    </div>
  );
}

// An island off a beach that faces west, and the shadow it casts in a swell.
const ISLAND = { cx: 120, cy: 70, r: 22 };
const SPOT = { cx: 232, cy: 100 };
const SHADOW_COAST = "M250 0C235 40 260 80 240 120C230 150 255 170 255 170L320 170L320 0Z";
// How far the shadow is drawn behind the island, and how much of its width refraction takes back
// over that distance: the swell bends in behind the island, and the shadow narrows.
const SHADOW = { reach: 260, narrows: 0.5 };
const shadowWidth = (behind: number) =>
  ISLAND.r * (1 - SHADOW.narrows * Math.min(1, Math.max(0, behind) / SHADOW.reach));

/** A swell to turn around an island: the spot behind it is in its shadow, or not. */
export function ShadowDemo() {
  const shown = useShown();
  const [degrees, setDegrees] = useState(270);
  // The shadow runs the way the swell goes from the island's two edges, and narrows with the
  // distance; the spot is in it when it lies within the shadow's width at its distance.
  const along = degrees + 180;
  const far = at(ISLAND.cx, ISLAND.cy, along, SHADOW.reach);
  const edgeA = at(ISLAND.cx, ISLAND.cy, degrees + 90, ISLAND.r);
  const edgeB = at(ISLAND.cx, ISLAND.cy, degrees - 90, ISLAND.r);
  const farA = at(far.x, far.y, degrees + 90, shadowWidth(SHADOW.reach));
  const farB = at(far.x, far.y, degrees - 90, shadowWidth(SHADOW.reach));
  const shadow = `M${edgeA.x} ${edgeA.y}L${farA.x} ${farA.y}L${farB.x} ${farB.y}L${edgeB.x} ${edgeB.y}Z`;
  // Where the spot stands along the swell's way and across it, from the island's centre.
  const dx = SPOT.cx - ISLAND.cx;
  const dy = SPOT.cy - ISLAND.cy;
  const radians = (along * Math.PI) / 180;
  const behind = dx * Math.sin(radians) - dy * Math.cos(radians);
  const across = Math.abs(dx * Math.cos(radians) + dy * Math.sin(radians));
  const shaded = behind > 0 && across < shadowWidth(behind);
  const color = scaleColor(WAVE_HEIGHT_SCALE, 0.5);
  // The crests of the swell, across the scene, a gap apart, which the shadow and the land hide.
  const gap = 18;
  const count = Math.ceil(240 / gap);
  const step = at(0, 0, along, gap);
  const crests = Array.from({ length: count * 2 + 1 }, (_, index) => {
    const centre = at(160, 85, degrees, (index - count) * gap);
    return {
      a: at(centre.x, centre.y, degrees + 90, 240),
      b: at(centre.x, centre.y, degrees - 90, 240),
    };
  });
  return (
    <div ref={shown.ref}>
      <Demo>
        <Scene viewBox="0 0 320 170" className="overflow-hidden">
          <defs>
            {/* The shadow is darkest behind the island and fades where refraction fills it. */}
            <linearGradient
              id={`${shown.id}-shade`}
              gradientUnits="userSpaceOnUse"
              x1={ISLAND.cx}
              y1={ISLAND.cy}
              x2={far.x}
              y2={far.y}
            >
              <stop offset="0" stopColor="var(--color-neutral-6)" stopOpacity={0.45} />
              <stop offset="1" stopColor="var(--color-neutral-6)" stopOpacity={0.05} />
            </linearGradient>
            {/* The crests are hidden in the shadow, and come back far behind the island. */}
            <linearGradient
              id={`${shown.id}-hide`}
              gradientUnits="userSpaceOnUse"
              x1={ISLAND.cx}
              y1={ISLAND.cy}
              x2={far.x}
              y2={far.y}
            >
              <stop offset="0" stopColor="black" />
              <stop offset="1" stopColor="rgb(70%,70%,70%)" />
            </linearGradient>
            <mask id={`${shown.id}-sea`}>
              <rect x={0} y={0} width={320} height={170} fill="white" />
              <path d={shadow} fill={`url(#${shown.id}-hide)`} />
              <circle cx={ISLAND.cx} cy={ISLAND.cy} r={ISLAND.r} fill="black" />
              <path d={SHADOW_COAST} fill="black" />
            </mask>
          </defs>
          <g mask={`url(#${shown.id}-sea)`} opacity={0.35}>
            <g>
              {crests.map((crest, index) => (
                <line
                  key={index}
                  x1={crest.a.x}
                  y1={crest.a.y}
                  x2={crest.b.x}
                  y2={crest.b.y}
                  stroke={color}
                  strokeWidth={1.5}
                />
              ))}
              {shown.moving && (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from="0 0"
                  to={`${step.x} ${step.y}`}
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              )}
            </g>
          </g>
          <path
            d={shadow}
            fill={`url(#${shown.id}-shade)`}
            style={{ opacity: shown.waiting ? 0 : 1, ...arriving("opacity", 1200, 300) }}
          />
          {/* The land over the shadow: a shadow falls on the sea alone. */}
          <path d={SHADOW_COAST} className="fill-neutral-4" />
          <circle cx={ISLAND.cx} cy={ISLAND.cy} r={ISLAND.r} className="fill-neutral-5" />
          <circle
            cx={SPOT.cx}
            cy={SPOT.cy}
            r={5}
            className={shaded ? "fill-neutral-6" : "fill-neutral-10"}
          />
          <Arrow cx={50} cy={120} fromDegrees={degrees} length={30} color={color} />
        </Scene>
        <Readout
          figure={
            <span className="inline-flex items-center gap-xxs">
              {m.learn_b_swell_from()} <Bearing degrees={degrees} withDegrees />
            </span>
          }
          verdict={shaded ? m.learn_a_shadow_shaded() : m.learn_a_shadow_exposed()}
        />
        <Control
          label={m.learn_direction()}
          value={degrees}
          min={180}
          max={360}
          text={`${degrees}°`}
          onChange={setDegrees}
        />
        <Hint>{m.learn_a_shadow_hint()}</Hint>
      </Demo>
    </div>
  );
}

// Six sessions one logged at a spot, each with what the sea did and how it was rated.
const SESSIONS = [
  { rating: 4.5, meters: 1.4, seconds: 13, knots: 6 },
  { rating: 4, meters: 1.1, seconds: 12, knots: 9 },
  { rating: 2, meters: 0.6, seconds: 8, knots: 14 },
  { rating: 3.5, meters: 1.8, seconds: 14, knots: 5 },
  { rating: 1.5, meters: 2.4, seconds: 11, knots: 22 },
  { rating: 3, meters: 0.9, seconds: 10, knots: 11 },
];
// The ends of a range, rounded outward to a step as `likedConditions` rounds them in the product.
// The quotient is rounded first, so that 0.6 m is not taken for 5.999… tenths and written 0.5.
const steps = (value: number, step: number) => Number((value / step).toFixed(6));
const down = (value: number, step: number) =>
  Number((Math.floor(steps(value, step)) * step).toFixed(2));
const up = (value: number, step: number) =>
  Number((Math.ceil(steps(value, step)) * step).toFixed(2));

/** The sessions one rated, and the alert their best ones add up to. */
export function AlertDemo() {
  useUnits();
  const shown = useShown();
  const [least, setLeast] = useState(3.5);
  const kept = SESSIONS.filter((session) => session.rating >= least);
  // The product proposes conditions once enough sessions were liked, as `likedConditions` does:
  // the heights they span, the shortest period, and the strongest wind, in metres a second.
  const enough = kept.length >= LIKED_SESSIONS;
  const of = (key: "meters" | "seconds" | "knots") => kept.map((one) => one[key]);
  const heights = {
    min: down(Math.min(...of("meters")), 0.1),
    max: up(Math.max(...of("meters")), 0.1),
  };
  const shortest = down(Math.min(...of("seconds")), 1);
  const strongest = up(Math.max(...of("knots")) / toKnots(1), 1);
  const counted =
    kept.length === 0
      ? m.learn_a_alert_kept_none()
      : kept.length === 1
        ? m.learn_a_alert_kept_one({ count: kept.length })
        : m.learn_a_alert_kept({ count: kept.length });
  return (
    <div ref={shown.ref}>
      <Demo>
        {/* The sessions come in one after the other as the demo arrives, then the alert. */}
        <ul className="grid gap-xxs text-s">
          {SESSIONS.map((session, index) => (
            <li
              key={session.rating}
              className={`flex items-center justify-between gap-s rounded-(--radius-xs) px-s py-xxs ${session.rating >= least ? "bg-neutral-1" : "text-neutral-6"}`}
              style={{
                opacity: shown.waiting ? 0 : undefined,
                translate: shown.waiting ? "0 0.5rem" : undefined,
                // The arrival waits its turn; what the slider changes follows the hand at once.
                transitionProperty: "opacity, translate, background-color, color",
                transitionDuration: "600ms, 600ms, 200ms, 200ms",
                transitionDelay: `${index * 120}ms, ${index * 120}ms, 0ms, 0ms`,
                transitionTimingFunction: "var(--motion-large-easing, ease-out)",
              }}
            >
              <RatingStars rating={session.rating} className="text-xs" />
              <span className="tabular-nums">
                {formatHeight(session.meters)} · {formatSeconds(session.seconds)} ·{" "}
                {formatWind(session.knots)}
              </span>
            </li>
          ))}
        </ul>
        <p
          className="rounded-(--radius-xs) bg-neutral-1 p-m text-neutral-7"
          style={{
            opacity: shown.waiting ? 0 : undefined,
            ...arriving("opacity", 600, SESSIONS.length * 120 + 150),
          }}
        >
          {enough ? (
            <>
              {m.alert_says_waves()}{" "}
              <span className="font-medium text-neutral-10">
                {m.alert_height_of({ range: rangeWords("waveHeightMeters", heights) })}
              </span>
              ,{" "}
              <span className="font-medium text-neutral-10">
                {m.alert_period_of({
                  range: rangeWords("wavePeakPeriodSeconds", { min: shortest }),
                })}
              </span>
              , {m.alert_says_wind()}{" "}
              <span className="font-medium text-neutral-10">
                {m.alert_wind_at({
                  range: rangeWords("windSpeedMetersPerSecond", { max: strongest }),
                })}
              </span>
              .
            </>
          ) : (
            m.learn_a_alert_none({ count: LIKED_SESSIONS })
          )}
        </p>
        <Readout
          figure={<Moving>{counted}</Moving>}
          verdict={
            enough
              ? kept.length <= LIKED_SESSIONS
                ? m.learn_a_alert_narrow()
                : m.learn_a_alert_wide()
              : undefined
          }
        />
        <Control
          label={m.learn_a_alert_least()}
          value={least}
          min={1}
          max={5}
          step={0.5}
          text={formatNumber(least, 1)}
          onChange={setLeast}
        />
        <Hint>{m.learn_a_alert_hint()}</Hint>
      </Demo>
    </div>
  );
}
