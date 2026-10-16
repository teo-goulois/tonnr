import { useState } from "react";

import { rangeWords } from "@/components/alerts/alert-words";
import { RatingStars } from "@/components/sessions/rating";
import { UnitTabs } from "@/components/shared/units-settings";
import { Bearing } from "@/components/viewer/bearing";
import { formatNumber, formatSeconds } from "@/lib/format";
import { WAVE_HEIGHT_SCALE, WAVE_PERIOD_SCALE, scaleColor } from "@/lib/sea-scales";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Arrow, Control, Demo, Hint, Moving, Readout, Scene, at, rounded } from "./demo";

// The demos of the advanced guide, over invented figures: what the figures are made of, and
// where they end, in an alert made of the sessions one logged. Decision 060.

// A coast of a hundred kilometres across, seen from above, with a cove a few kilometres wide.
const MODEL_SCENE = { width: 320, height: 160, kmPerPixel: 100 / 320 };
const COAST =
  "M210 0C200 30 215 55 212 70C208 78 196 78 196 86C196 94 210 94 214 102C218 125 205 145 215 160L320 160L320 0Z";
// Whether a point of the scene is sea: left of the coast, the cove included.
function isSea(x: number, y: number) {
  const coastX =
    y < 70
      ? 210 - 10 * Math.sin((y / 70) * Math.PI)
      : y < 102
        ? y < 78
          ? 212 - (y - 70)
          : y < 94
            ? 196
            : 196 + (y - 94) * 2.25
        : 214 + 4 * Math.sin(((y - 102) / 58) * Math.PI);
  return x < coastX;
}
const RESOLUTIONS = [25, 8, 2] as const;

/** A coast under the grids of three models: what a cell sees, and what it does not. */
export function ModelsDemo() {
  const [step, setStep] = useState(1);
  const km = RESOLUTIONS[step]!;
  const cell = km / MODEL_SCENE.kmPerPixel;
  const columns = Math.ceil(MODEL_SCENE.width / cell);
  const rows = Math.ceil(MODEL_SCENE.height / cell);
  const cells: { x: number; y: number; sea: boolean }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * cell;
      const y = row * cell;
      cells.push({ x: rounded(x), y: rounded(y), sea: isSea(x + cell / 2, y + cell / 2) });
    }
  }
  // The cove has a cell of its own when one's centre falls in it.
  const coveSeen = cells.some(
    (one) => one.sea && one.x + cell / 2 > 200 && one.y + cell / 2 > 78 && one.y + cell / 2 < 94,
  );
  const sea = scaleColor(WAVE_HEIGHT_SCALE, 1);
  return (
    <Demo>
      <Scene viewBox={`0 0 ${MODEL_SCENE.width} ${MODEL_SCENE.height}`}>
        <path d={COAST} className="fill-neutral-4" />
        {cells.map((one) => (
          <rect
            key={`${one.x}-${one.y}`}
            x={one.x}
            y={one.y}
            width={rounded(cell)}
            height={rounded(cell)}
            fill={one.sea ? sea : "none"}
            opacity={one.sea ? 0.35 : 1}
            className="stroke-neutral-1"
            strokeWidth={0.6}
          />
        ))}
        <circle cx={203} cy={86} r={3} className="fill-neutral-10" />
        <text x={190} y={120} fontSize={9} textAnchor="end" className="fill-neutral-7">
          {m.learn_a_models_cove()}
        </text>
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
const MODEL = Array.from({ length: 85 }, (_, index) => {
  const days = -1 + index / 12;
  return { days, meters: modelAt(days) };
});
const line = (points: { days: number; meters: number }[]) =>
  points
    .map((point, index) => `${index ? "L" : "M"}${chartX(point.days)} ${chartY(point.meters)}`)
    .join("");

/** The buoy that measured, the model that computed, and how far ahead the model is still trusted. */
export function BuoysDemo() {
  useUnits();
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
  return (
    <Demo>
      <Scene viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
        <path d={fan} fill={scaleColor(WAVE_PERIOD_SCALE, 10)} opacity={0.18} />
        <path
          d={line(MODEL)}
          fill="none"
          stroke={scaleColor(WAVE_PERIOD_SCALE, 10)}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <path
          d={line(BUOY)}
          fill="none"
          stroke={scaleColor(WAVE_HEIGHT_SCALE, 1.8)}
          strokeWidth={2}
        />
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
        <circle
          cx={chartX(days)}
          cy={chartY(model)}
          r={4}
          fill={scaleColor(WAVE_PERIOD_SCALE, 10)}
        />
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
  );
}

const PRIMARY = { meters: 1.5, seconds: 14, from: 290 };
const SECOND = { seconds: 8, from: 200 };

/** Two swells at once: the long one from afar, a short one to raise, and the sea they make. */
export function SecondaryDemo() {
  useUnits();
  const [meters, setMeters] = useState(0.6);
  const total = rounded(Math.sqrt(PRIMARY.meters ** 2 + meters ** 2));
  const secondLeads = meters > PRIMARY.meters;
  const trains = (from: number, gap: number, color: string, opacity: number) =>
    [0, 1, 2, 3, 4].map((index) => {
      const centre = at(160, 85, from, 70 - index * gap);
      const left = at(centre.x, centre.y, from + 90, 60);
      const right = at(centre.x, centre.y, from - 90, 60);
      return (
        <line
          key={index}
          x1={left.x}
          y1={left.y}
          x2={right.x}
          y2={right.y}
          stroke={color}
          strokeWidth={2}
          opacity={opacity}
        />
      );
    });
  return (
    <Demo>
      <Scene viewBox="0 0 320 170" className="overflow-hidden">
        {trains(PRIMARY.from, 22, scaleColor(WAVE_PERIOD_SCALE, PRIMARY.seconds), 0.7)}
        {trains(
          SECOND.from,
          12,
          scaleColor(WAVE_PERIOD_SCALE, SECOND.seconds),
          Math.max(0.1, meters / 1.5),
        )}
      </Scene>
      <table className="w-full text-s">
        <tbody>
          <tr>
            <th className="py-xxs text-left font-medium">
              {secondLeads ? m.learn_g_secondary_swell_word() : m.learn_a_secondary_primary()}
            </th>
            <td className="text-right tabular-nums">
              {formatHeight(PRIMARY.meters)} · {formatSeconds(PRIMARY.seconds)}
            </td>
            <td className="text-right">
              <Bearing degrees={PRIMARY.from} />
            </td>
          </tr>
          <tr>
            <th className="py-xxs text-left font-medium">
              {secondLeads ? m.learn_a_secondary_primary() : m.learn_g_secondary_swell_word()}
            </th>
            <td className="text-right tabular-nums">
              <Moving>{`${formatHeight(meters)} · ${formatSeconds(SECOND.seconds)}`}</Moving>
            </td>
            <td className="text-right">
              <Bearing degrees={SECOND.from} />
            </td>
          </tr>
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
  );
}

// An island off a beach that faces west, and the shadow it casts in a swell.
const ISLAND = { cx: 120, cy: 70, r: 22 };
const SPOT = { cx: 232, cy: 100 };

/** A swell to turn around an island: the spot behind it is in its shadow, or not. */
export function ShadowDemo() {
  const [degrees, setDegrees] = useState(270);
  // The shadow runs the way the swell goes, from the island's two edges, with the swell's
  // bearing; the spot is in it when it lies within the island's width along that line.
  const along = degrees + 180;
  const edgeA = at(ISLAND.cx, ISLAND.cy, degrees + 90, ISLAND.r);
  const edgeB = at(ISLAND.cx, ISLAND.cy, degrees - 90, ISLAND.r);
  const farA = at(edgeA.x, edgeA.y, along, 260);
  const farB = at(edgeB.x, edgeB.y, along, 260);
  // Where the spot stands across the swell's way, from the island's centre.
  const dx = SPOT.cx - ISLAND.cx;
  const dy = SPOT.cy - ISLAND.cy;
  const radians = (along * Math.PI) / 180;
  const ahead = dx * Math.sin(radians) - dy * Math.cos(radians);
  const across = Math.abs(dx * Math.cos(radians) + dy * Math.sin(radians));
  const shaded = ahead > 0 && across < ISLAND.r;
  const color = scaleColor(WAVE_HEIGHT_SCALE, 0.5);
  return (
    <Demo>
      <Scene viewBox="0 0 320 170">
        <path
          d="M250 0C235 40 260 80 240 120C230 150 255 170 255 170L320 170L320 0Z"
          className="fill-neutral-4"
        />
        <path
          d={`M${edgeA.x} ${edgeA.y}L${farA.x} ${farA.y}L${farB.x} ${farB.y}L${edgeB.x} ${edgeB.y}Z`}
          className="fill-neutral-6"
          opacity={0.25}
        />
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

/** The sessions one rated, and the alert their best ones add up to. */
export function AlertDemo() {
  useUnits();
  const [least, setLeast] = useState(3.5);
  const kept = SESSIONS.filter((session) => session.rating >= least);
  const range = (key: "meters" | "seconds" | "knots") =>
    kept.length === 0
      ? null
      : {
          min: Math.min(...kept.map((one) => one[key])),
          max: Math.max(...kept.map((one) => one[key])),
        };
  const heights = range("meters");
  const periods = range("seconds");
  const winds = range("knots");
  return (
    <Demo>
      <ul className="grid gap-xxs text-s">
        {SESSIONS.map((session) => (
          <li
            key={session.rating}
            className={`flex items-center justify-between gap-s rounded-(--radius-xs) px-s py-xxs ${session.rating >= least ? "bg-neutral-1" : "text-neutral-6"}`}
          >
            <RatingStars rating={session.rating} className="text-xs" />
            <span className="tabular-nums">
              {formatHeight(session.meters)} · {formatSeconds(session.seconds)} ·{" "}
              {formatWind(session.knots)}
            </span>
          </li>
        ))}
      </ul>
      <p className="rounded-(--radius-xs) bg-neutral-1 p-m text-neutral-7">
        {kept.length === 0 ? (
          m.learn_a_alert_none()
        ) : (
          <>
            {m.alert_says_waves()}{" "}
            <span className="font-medium text-neutral-10">
              {m.alert_height_of({ range: rangeWords("waveHeightMeters", heights!) })}
            </span>
            ,{" "}
            <span className="font-medium text-neutral-10">
              {m.alert_period_of({
                range: rangeWords("wavePeakPeriodSeconds", { min: periods!.min }),
              })}
            </span>
            , {m.alert_says_wind()}{" "}
            <span className="font-medium text-neutral-10">
              {m.alert_wind_at({
                range: rangeWords("windSpeedMetersPerSecond", { max: winds!.max / 1.943844 }),
              })}
            </span>
            .
          </>
        )}
      </p>
      <Readout
        figure={<Moving>{m.learn_a_alert_kept({ count: kept.length })}</Moving>}
        verdict={kept.length <= 2 ? m.learn_a_alert_narrow() : m.learn_a_alert_wide()}
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
  );
}
