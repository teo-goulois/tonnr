import { cn } from "@repo/ui/lib/utils";
import { useRef, useState } from "react";

import { arrive, order, useArrivalOf } from "@/components/landing/landing-parts";
import { UnitTabs } from "@/components/shared/units-settings";
import { Bearing } from "@/components/viewer/bearing";
import { waveEnergy } from "@/components/viewer/details/metrics";
import { formatDay, formatClock, formatNumber, formatSeconds } from "@/lib/format";
import {
  WAVE_ENERGY_SCALE,
  WAVE_HEIGHT_SCALE,
  WAVE_PERIOD_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
} from "@/lib/sea-scales";
import { formatDistance, formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import {
  Arrow,
  at as pointAt,
  Control,
  Demo,
  Hint,
  Moving,
  Readout,
  Scene,
  arcPath,
  rounded,
  within,
} from "./demo";

// The demos of the intermediate guide, over invented figures: a sea read as the week's table
// reads it, apart and together, and a week to find a window in. Decision 060.
//
// While a demo is in view, and unless the reader asked for no motion, it moves a little by
// itself, as the landing's cards do: what moves is drawn only then, in SVG animations or CSS
// transitions, and never what the reader's slider sets. The server draws every demo still.

/** Whether a demo's drawing is in view and may move, and whether it waits below the view. */
function useDemoMotion<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const { stage, moving } = useArrivalOf(ref);
  return {
    ref,
    stage,
    moving,
    // What a wrapper spreads so that the pieces marked with `arrive` come in as it is reached.
    arrival: {
      ref,
      "data-stage": stage === "still" ? undefined : stage,
      className: "group/arrival",
    },
  };
}

/** A row of the week's table, as the panel colors it: a figure on the color of its value. */
function Cell({ color, children }: { color: string; children: string }) {
  return (
    <td
      className="rounded-(--radius-xs) px-s py-xs text-center text-s font-medium tabular-nums transition-colors duration-300 motion-reduce:transition-none"
      style={{ backgroundColor: color, color: scaleInkOf(color) }}
    >
      <Moving>{children}</Moving>
    </td>
  );
}

// `scaleInk` reads a scale and a value; a cell that knows its color alone reads the color's own ink.
function scaleInkOf(color: string) {
  const [red = 0, green = 0, blue = 0] = color.match(/\d+/g)?.map(Number) ?? [];
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? "#0b0b0b" : "#ffffff";
}

const SWELL = { meters: 1.2, seconds: 13 };

/** The swell and the wind sea apart, then together: what the local wind adds to the table. */
export function WindSeaDemo() {
  useUnits();
  const { arrival } = useDemoMotion<HTMLTableElement>();
  const [knots, setKnots] = useState(12);
  // What a wind raises on the spot in a few hours: short waves, higher and a little longer as it
  // strengthens. No wind raises none, and has no period to write.
  const windSeaMeters = rounded(Math.min(2.5, (knots / 10) ** 1.6 * 0.25));
  const windSea = {
    meters: windSeaMeters,
    seconds: windSeaMeters < 0.05 ? null : rounded(3 + knots * 0.15),
  };
  // Two seas add up as their energies do, not as their heights: the root of the sum of squares.
  const total = rounded(Math.sqrt(SWELL.meters ** 2 + windSea.meters ** 2));
  const verdict =
    knots < 8
      ? m.learn_i_windsea_clean()
      : knots < 18
        ? m.learn_i_windsea_crossed()
        : m.learn_i_windsea_messy();
  const rows = [
    { name: m.learn_i_windsea_row_swell(), ...SWELL },
    { name: m.learn_i_windsea_row_windsea(), ...windSea },
    { name: m.learn_i_windsea_row_total(), meters: total, seconds: null },
  ];
  return (
    <Demo>
      <table
        {...arrival}
        className={cn(arrival.className, "w-full border-separate border-spacing-xxs")}
      >
        <thead>
          <tr className="text-xs text-neutral-7">
            <th className="text-left font-normal" />
            <th className="font-normal">{m.learn_i_height()}</th>
            <th className="font-normal">{m.learn_g_period_word()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // The swell, then the wind sea, then what they make together.
            <tr key={row.name} className={arrive} style={order(index + 1)}>
              <th className="text-left text-s font-medium">{row.name}</th>
              <Cell color={scaleColor(WAVE_HEIGHT_SCALE, row.meters)}>
                {formatHeight(row.meters)}
              </Cell>
              {row.seconds === null ? (
                <td className="text-center text-s text-neutral-7">–</td>
              ) : (
                <Cell color={scaleColor(WAVE_PERIOD_SCALE, row.seconds)}>
                  {formatSeconds(row.seconds)}
                </Cell>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <Readout
        figure={<Moving>{m.learn_i_windsea_total({ height: formatHeight(total) })}</Moving>}
        verdict={verdict}
      >
        <UnitTabs measure="windSpeed" />
      </Readout>
      <Control
        label={m.learn_i_windsea_local()}
        value={knots}
        min={0}
        max={30}
        text={formatWind(knots)}
        onChange={setKnots}
      />
      <Hint>
        {m.learn_i_windsea_hint({
          height: formatHeight(SWELL.meters),
          period: formatSeconds(SWELL.seconds),
        })}
      </Hint>
    </Demo>
  );
}

/**
 * Where a value stands on a scale's bar, in percent, when the bar puts its stops at equal
 * distances: the marker then sits on its own color.
 */
function placeOn(scale: typeof WAVE_ENERGY_SCALE, value: number) {
  const last = scale.length - 1;
  for (let index = 0; index < last; index++) {
    const from = scale[index]!;
    const to = scale[index + 1]!;
    if (value <= to.value) {
      const share = Math.max(0, (value - from.value) / (to.value - from.value));
      return rounded(((index + share) / last) * 100);
    }
  }
  return 100;
}

/** Height and period together: one figure of energy, and two seas that carry the same. */
export function EnergyDemo() {
  useUnits();
  const { ref, stage } = useDemoMotion();
  // The marker settles from the start of the bar as the demo comes in, then follows the hand.
  const [touched, setTouched] = useState(false);
  const [meters, setMeters] = useState(1.5);
  const [seconds, setSeconds] = useState(10);
  const energy = waveEnergy(meters, seconds) ?? 0;
  const color = scaleColor(WAVE_ENERGY_SCALE, energy);
  const verdict =
    energy < 200
      ? m.learn_i_energy_weak()
      : energy < 800
        ? m.learn_i_energy_fair()
        : energy < 2500
          ? m.learn_i_energy_strong()
          : m.learn_i_energy_heavy();
  const same = { low: waveEnergy(1, 14)!, high: waveEnergy(2, 7)! };
  return (
    <Demo>
      <div ref={ref} className="grid gap-xxs rounded-(--radius-xs) bg-neutral-1 p-m">
        <div
          className="h-3 rounded-full"
          style={{
            backgroundImage: `linear-gradient(90deg, ${WAVE_ENERGY_SCALE.map((stop) => stop.color).join(", ")})`,
          }}
        />
        <div className="relative h-4">
          <span
            className="absolute -top-1 size-3 -translate-x-1/2 rounded-full border-2 border-neutral-1 transition-[left,background-color] ease-theme-large motion-reduce:transition-none"
            style={{
              left: stage === "wait" ? "0%" : `${placeOn(WAVE_ENERGY_SCALE, energy)}%`,
              backgroundColor: color,
              transitionDuration: touched ? "150ms" : "1200ms",
              transitionDelay: touched ? "0ms" : "300ms",
            }}
          />
        </div>
      </div>
      <Readout
        figure={
          // The scale's light colors do not read as text on the card: the figure keeps its ink,
          // and a dot beside it takes the color.
          <span className="inline-flex items-center gap-xs">
            <span
              aria-hidden
              className="size-3 rounded-full transition-colors duration-300 motion-reduce:transition-none"
              style={{ backgroundColor: color }}
            />
            <Moving>{`${formatNumber(energy, 0)} kJ/m`}</Moving>
          </span>
        }
        verdict={verdict}
      >
        <UnitTabs measure="height" />
      </Readout>
      <Control
        label={m.learn_i_height()}
        value={meters}
        min={0.3}
        max={4}
        step={0.1}
        text={formatHeight(meters)}
        onChange={(value) => {
          setTouched(true);
          setMeters(value);
        }}
      />
      <Control
        label={m.learn_g_period_word()}
        value={seconds}
        min={5}
        max={18}
        text={formatSeconds(seconds)}
        onChange={(value) => {
          setTouched(true);
          setSeconds(value);
        }}
      />
      <Hint>
        {m.learn_i_energy_hint({
          low: formatHeight(1),
          lowPeriod: formatSeconds(14),
          high: formatHeight(2),
          highPeriod: formatSeconds(7),
          energy: `${formatNumber(same.low, 0)} kJ/m`,
        })}
      </Hint>
    </Demo>
  );
}

const G = 9.81;
const KNOT_MS = 1852 / 3600;
// How far the beach stands from the storm, in kilometres.
const TO_BEACH_KM = 2000;
const FETCH_MAX_KM = 2000;

/**
 * A storm's wind and fetch, and the swell they send to the beach. At the storm, JONSWAP's figures
 * for a sea still growing, held to those of a sea fully developed (Shore Protection Manual, 1984:
 * gH/U² = 0.243, gT/U = 8.13). On its way the swell spreads, and loses height as the root of the
 * fetch's share of the distance it has gone: a small storm far away sends little.
 */
function swellOf(knots: number, fetchKm: number) {
  const wind = knots * KNOT_MS;
  const fetch = fetchKm * 1000;
  const atStorm = Math.min(0.0016 * wind * Math.sqrt(fetch / G), (0.243 * wind ** 2) / G);
  const seconds = Math.min(
    ((0.286 * wind) / G) * Math.cbrt((G * fetch) / wind ** 2),
    (8.13 * wind) / G,
  );
  const meters = atStorm * Math.sqrt(fetchKm / (fetchKm + TO_BEACH_KM));
  // A swell travels at half its wave speed: 0.78 T metres a second.
  const days = (TO_BEACH_KM * 1000) / (0.78 * seconds) / 86400;
  return { meters: rounded(meters), seconds: rounded(seconds), days: rounded(days) };
}

// The coast the swell reaches, in the scene's coordinates, and three crests on their way to it.
const SHORE_X = 284;
const CRESTS = [0, 1, 2];

/** A storm to strengthen and to stretch, and the swell it sends to a beach far away. */
export function FetchDemo() {
  useUnits();
  const { ref, moving } = useDemoMotion();
  const [knots, setKnots] = useState(30);
  const [fetchKm, setFetchKm] = useState(800);
  const swell = swellOf(knots, fetchKm);
  const width = rounded(40 + (fetchKm / FETCH_MAX_KM) * 150);
  const color = scaleColor(WIND_SPEED_SCALE, knots);
  const crest = scaleColor(WAVE_HEIGHT_SCALE, swell.meters);
  return (
    <Demo>
      <div ref={ref}>
        <Scene viewBox="0 0 320 120">
          <rect x={20} y={40} width={width} height={40} rx={20} fill={color} opacity={0.25} />
          {[0, 1, 2, 3].map((index) => (
            <g key={index}>
              {/* The wind blows across the storm in gusts, one arrow after the other. */}
              {moving && (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="-3 0;4 0;-3 0"
                  dur="2.4s"
                  begin={`${index * 0.3}s`}
                  repeatCount="indefinite"
                />
              )}
              <Arrow
                cx={rounded(40 + (index * (width - 40)) / 3)}
                cy={60}
                fromDegrees={270}
                length={rounded(8 + knots * 0.2)}
                color={color}
              />
            </g>
          ))}
          {/* The swell leaves the storm's edge and goes to the coast, one crest after the other. */}
          {moving &&
            CRESTS.map((index) => (
              <path
                key={index}
                d="M0 -14Q6 0 0 14"
                fill="none"
                stroke={crest}
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0}
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values={`${rounded(20 + width + 6)} 60;${SHORE_X} 60`}
                  dur="3.6s"
                  begin={`${index * 1.2}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;0.9;0.9;0"
                  keyTimes="0;0.2;0.8;1"
                  dur="3.6s"
                  begin={`${index * 1.2}s`}
                  repeatCount="indefinite"
                />
              </path>
            ))}
          <path d="M290 0C280 40 300 80 290 120L320 120L320 0Z" className="fill-neutral-4" />
          <text x={20} y={100} fontSize={10} className="fill-neutral-7">
            {m.learn_i_fetch_storm()}
          </text>
          <text x={300} y={62} fontSize={10} textAnchor="middle" className="fill-neutral-7">
            {m.learn_land()}
          </text>
        </Scene>
      </div>
      <Readout
        figure={
          <Moving>
            {m.learn_i_fetch_at_beach({
              swell: `${formatHeight(swell.meters)} · ${formatSeconds(swell.seconds)}`,
            })}
          </Moving>
        }
        verdict={m.learn_i_fetch_arrives({ days: formatNumber(swell.days, 1) })}
      >
        <UnitTabs measure="height" />
      </Readout>
      <Control
        label={m.learn_i_fetch_wind()}
        value={knots}
        min={10}
        max={45}
        text={formatWind(knots)}
        onChange={setKnots}
      />
      <Control
        label={m.learn_i_fetch_length()}
        value={fetchKm}
        min={100}
        max={FETCH_MAX_KM}
        step={50}
        text={formatDistance(fetchKm)}
        onChange={setFetchKm}
      />
      <Hint>{m.learn_i_fetch_hint({ distance: formatDistance(TO_BEACH_KM) })}</Hint>
    </Demo>
  );
}

// Three days of an invented forecast, hour by hour, in UTC: a swell that rises on the second day
// while the wind turns onshore in the afternoons and sleeps at dawn.
const WEEK_START = Date.UTC(2026, 9, 12);
const HOUR_MS = 60 * 60 * 1000;
const WEEK_HOURS = 72;
const OFFSHORE_FROM = 90;
/** Under this wind, in knots, a wind from the sea leaves the waves alone: the lesson says it. */
export const LIGHT_WIND_KNOTS = 10;

function hourOf(hour: number) {
  const day = hour / 24;
  const meters = rounded(0.6 + 1.2 * Math.max(0, Math.sin(((day - 0.6) / 2.4) * Math.PI)));
  const seconds = rounded(7 + 6 * Math.max(0, Math.sin(((day - 0.5) / 2.6) * Math.PI)));
  const clock = hour % 24;
  const knots = rounded(4 + 14 * Math.max(0, Math.sin(((clock - 9) / 12) * Math.PI)));
  const windFrom = clock < 11 ? OFFSHORE_FROM : 270;
  return { meters, seconds, knots, windFrom };
}

const WEEK = Array.from({ length: WEEK_HOURS }, (_, hour) => hourOf(hour));

/** Whether an hour is one to surf: enough swell, long enough, and a wind that leaves it alone. */
function works({ meters, seconds, knots, windFrom }: (typeof WEEK)[number]) {
  return meters >= 1 && seconds >= 10 && (knots < LIGHT_WIND_KNOTS || windFrom === OFFSHORE_FROM);
}

/** Three days of forecast, hour by hour, with the hours that make a window marked. */
export function WeekDemo() {
  useUnits();
  const { ref, stage } = useDemoMotion();
  const [hour, setHour] = useState(30);
  // Below the view, the bars wait at the bottom, and rise one hour after the other as it is
  // reached; the hours of the window are marked once they have risen.
  const waiting = stage === "wait";
  const at = WEEK[hour]!;
  const time = new Date(WEEK_START + hour * HOUR_MS);
  const barWidth = rounded(320 / WEEK_HOURS);
  return (
    <Demo>
      <div ref={ref}>
        <Scene viewBox="0 0 320 120">
          {WEEK.map((one, index) => (
            <rect
              key={index}
              x={rounded(index * barWidth)}
              y={rounded(100 - one.meters * 36)}
              width={rounded(barWidth - 0.6)}
              height={rounded(one.meters * 36)}
              fill={scaleColor(WAVE_HEIGHT_SCALE, one.meters)}
              opacity={works(one) ? 1 : 0.35}
              className="origin-bottom transition-transform duration-700 ease-theme-large [transform-box:fill-box] motion-reduce:transition-none"
              style={{
                transform: waiting ? "scaleY(0)" : undefined,
                transitionDelay: `${index * 10}ms`,
              }}
            />
          ))}
          {WEEK.map((one, index) =>
            works(one) ? (
              <rect
                key={`window-${index}`}
                x={rounded(index * barWidth)}
                y={104}
                width={barWidth}
                height={4}
                fill={scaleColor(WAVE_HEIGHT_SCALE, 1.5)}
                className="transition-opacity duration-500 motion-reduce:transition-none"
                style={{
                  opacity: waiting ? 0 : undefined,
                  transitionDelay: `${800 + index * 10}ms`,
                }}
              />
            ) : null,
          )}
          {[0, 24, 48].map((start) => (
            <text
              key={start}
              x={rounded(start * barWidth + 8)}
              y={118}
              fontSize={9}
              className="fill-neutral-7"
            >
              {formatDay(new Date(WEEK_START + start * HOUR_MS), "UTC")}
            </text>
          ))}
          <line
            x1={rounded(hour * barWidth + barWidth / 2)}
            y1={8}
            x2={rounded(hour * barWidth + barWidth / 2)}
            y2={108}
            className="stroke-neutral-10"
            strokeDasharray="3 3"
          />
        </Scene>
      </div>
      <Readout
        figure={
          <span className="inline-flex flex-wrap items-center gap-xxs">
            <Moving>{`${formatHeight(at.meters)} · ${formatSeconds(at.seconds)} · ${formatWind(at.knots)}`}</Moving>
            <Bearing degrees={at.windFrom} />
          </span>
        }
        verdict={works(at) ? m.learn_i_week_window() : m.learn_i_week_not_yet()}
      >
        <UnitTabs measure="windSpeed" />
      </Readout>
      <Control
        label={m.learn_hour()}
        value={hour}
        min={0}
        max={WEEK_HOURS - 1}
        text={`${formatDay(time, "UTC")} ${formatClock(time, "UTC")}`}
        onChange={setHour}
      />
      <Hint>{m.learn_i_week_hint()}</Hint>
    </Demo>
  );
}

// Two spots on one coast: a beach that faces west, open from west-south-west to north-north-west,
// and a cove that faces south behind a headland, which a swell from the south to the south-west
// reaches as it bends. The hint names a swell for each: north-west and south-west.
const SPOTS = [
  { name: () => m.learn_i_neighbours_west(), cx: 190, cy: 60, from: 240, to: 330 },
  { name: () => m.learn_i_neighbours_south(), cx: 230, cy: 135, from: 165, to: 235 },
] as const;

/** One swell, two spots a few kilometres apart: each has its own window. */
export function NeighboursDemo() {
  const { ref, moving } = useDemoMotion();
  const [degrees, setDegrees] = useState(290);
  const color = scaleColor(WAVE_HEIGHT_SCALE, 0.5);
  // The swell's arrow pushes a little the way it goes.
  const push = pointAt(0, 0, degrees + 180, 5);
  return (
    <Demo>
      <div ref={ref}>
        <Scene viewBox="0 0 320 170">
          <path
            d="M200 0C190 30 230 50 250 70C280 95 250 120 260 170L320 170L320 0Z"
            className="fill-neutral-4"
          />
          {SPOTS.map((spot) => {
            const enters = within(degrees, spot.from, spot.to);
            return (
              <g key={spot.name()}>
                <circle
                  cx={spot.cx}
                  cy={spot.cy}
                  r={28}
                  fill="none"
                  strokeWidth={5}
                  className="stroke-neutral-3"
                />
                {/* A window the swell enters glows, slowly, while the demo is in view. */}
                {moving && enters && (
                  <path
                    d={arcPath(spot.cx, spot.cy, 28, spot.from, spot.to)}
                    fill="none"
                    stroke={color}
                    strokeWidth={12}
                    strokeLinecap="round"
                    strokeOpacity={0.1}
                  >
                    <animate
                      attributeName="stroke-opacity"
                      values="0.1;0.4;0.1"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </path>
                )}
                <path
                  d={arcPath(spot.cx, spot.cy, 28, spot.from, spot.to)}
                  fill="none"
                  stroke={enters ? color : "var(--neutral-6)"}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <circle
                  cx={spot.cx}
                  cy={spot.cy}
                  r={4}
                  className={enters ? "fill-neutral-10" : "fill-neutral-6"}
                />
              </g>
            );
          })}
          <g>
            {moving && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0 0;${push.x} ${push.y};0 0`}
                dur="2.4s"
                repeatCount="indefinite"
              />
            )}
            <Arrow cx={70} cy={85} fromDegrees={degrees} length={34} color={color} />
          </g>
        </Scene>
      </div>
      <div className="grid gap-xxs text-s">
        {SPOTS.map((spot) => {
          const enters = within(degrees, spot.from, spot.to);
          return (
            <div key={spot.name()} className="flex items-center justify-between gap-s">
              <span className="font-medium">{spot.name()}</span>
              <span className={enters ? "text-neutral-10" : "text-neutral-7"}>
                {enters ? m.learn_i_neighbours_works() : m.learn_i_neighbours_flat()}
              </span>
            </div>
          );
        })}
      </div>
      <Readout
        figure={
          <span className="inline-flex items-center gap-xxs">
            {m.learn_b_swell_from()} <Bearing degrees={degrees} withDegrees />
          </span>
        }
      />
      <Control
        label={m.learn_direction()}
        value={degrees}
        min={0}
        max={359}
        text={`${degrees}°`}
        onChange={setDegrees}
      />
      <Hint>{m.learn_i_neighbours_hint()}</Hint>
    </Demo>
  );
}
