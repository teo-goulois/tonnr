import { useState } from "react";

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
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import {
  Arrow,
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

/** A row of the week's table, as the panel colors it: a figure on the color of its value. */
function Cell({ color, children }: { color: string; children: string }) {
  return (
    <td
      className="rounded-(--radius-xs) px-s py-xs text-center text-s font-medium tabular-nums"
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
  const [knots, setKnots] = useState(12);
  // What a wind raises on the spot in a few hours: short waves whose height grows with its square.
  const windSea = {
    meters: rounded(Math.min(2.5, (knots / 10) ** 1.6 * 0.25)),
    seconds: rounded(3 + knots * 0.15),
  };
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
      <table className="w-full border-separate border-spacing-xxs">
        <thead>
          <tr className="text-xs text-neutral-7">
            <th className="text-left font-normal" />
            <th className="font-normal">{m.learn_i_height()}</th>
            <th className="font-normal">{m.learn_g_period_word()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
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

/** Height and period together: one figure of energy, and two seas that carry the same. */
export function EnergyDemo() {
  useUnits();
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
      <div className="grid gap-xxs rounded-(--radius-xs) bg-neutral-1 p-m">
        <div
          className="h-3 rounded-full"
          style={{
            backgroundImage: `linear-gradient(90deg, ${WAVE_ENERGY_SCALE.map((stop) => stop.color).join(", ")})`,
          }}
        />
        <div className="relative h-4">
          <span
            className="absolute -top-1 size-3 -translate-x-1/2 rounded-full border-2 border-neutral-1"
            style={{
              left: `${rounded(Math.min(100, (energy / 8000) * 100))}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>
      <Readout
        figure={
          <span style={{ color }}>
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
        onChange={setMeters}
      />
      <Control
        label={m.learn_b_period_title()}
        value={seconds}
        min={5}
        max={18}
        text={formatSeconds(seconds)}
        onChange={setSeconds}
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

/** A storm's wind and fetch, and the swell they make: JONSWAP's figures for a sea still growing. */
function swellOf(knots: number, fetchKm: number) {
  const wind = knots * KNOT_MS;
  const fetch = fetchKm * 1000;
  const meters = 0.0016 * wind * Math.sqrt(fetch / G);
  const seconds = ((0.286 * wind) / G) * Math.cbrt((G * fetch) / wind ** 2);
  // A swell travels at half its wave speed: 0.78 T metres a second.
  const days = (TO_BEACH_KM * 1000) / (0.78 * seconds) / 86400;
  return { meters: rounded(meters), seconds: rounded(seconds), days: rounded(days) };
}

/** A storm to strengthen and to stretch, and the swell it sends to a beach far away. */
export function FetchDemo() {
  useUnits();
  const [knots, setKnots] = useState(30);
  const [fetchKm, setFetchKm] = useState(800);
  const swell = swellOf(knots, fetchKm);
  const width = rounded(40 + (fetchKm / 3000) * 180);
  const color = scaleColor(WIND_SPEED_SCALE, knots);
  return (
    <Demo>
      <Scene viewBox="0 0 320 120">
        <rect x={20} y={40} width={width} height={40} rx={20} fill={color} opacity={0.25} />
        {[0, 1, 2, 3].map((index) => (
          <Arrow
            key={index}
            cx={rounded(40 + (index * (width - 40)) / 3)}
            cy={60}
            fromDegrees={270}
            length={rounded(8 + knots * 0.2)}
            color={color}
          />
        ))}
        <path d="M290 0C280 40 300 80 290 120L320 120L320 0Z" className="fill-neutral-4" />
        <text x={20} y={100} fontSize={10} className="fill-neutral-7">
          {m.learn_i_fetch_storm()}
        </text>
        <text x={300} y={62} fontSize={10} textAnchor="middle" className="fill-neutral-7">
          {m.learn_land()}
        </text>
      </Scene>
      <Readout
        figure={
          <Moving>{`${formatHeight(swell.meters)} · ${formatSeconds(swell.seconds)}`}</Moving>
        }
        verdict={m.learn_i_fetch_arrives({ days: formatNumber(swell.days, 1) })}
      />
      <Control
        label={m.learn_i_fetch_wind()}
        value={knots}
        min={10}
        max={60}
        text={formatWind(knots)}
        onChange={setKnots}
      />
      <Control
        label={m.learn_i_fetch_length()}
        value={fetchKm}
        min={100}
        max={3000}
        step={50}
        text={`${formatNumber(fetchKm, 0)} km`}
        onChange={setFetchKm}
      />
      <Hint>{m.learn_i_fetch_hint({ distance: `${formatNumber(TO_BEACH_KM, 0)} km` })}</Hint>
    </Demo>
  );
}

// Three days of an invented forecast, hour by hour, in UTC: a swell that rises on the second day
// while the wind turns onshore in the afternoons and sleeps at dawn.
const WEEK_START = Date.UTC(2026, 9, 12);
const HOUR_MS = 60 * 60 * 1000;
const WEEK_HOURS = 72;
const OFFSHORE_FROM = 90;

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
  return meters >= 1 && seconds >= 10 && (knots <= 8 || windFrom === OFFSHORE_FROM);
}

/** Three days of forecast, hour by hour, with the hours that make a window marked. */
export function WeekDemo() {
  useUnits();
  const [hour, setHour] = useState(30);
  const at = WEEK[hour]!;
  const time = new Date(WEEK_START + hour * HOUR_MS);
  const barWidth = rounded(320 / WEEK_HOURS);
  return (
    <Demo>
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
            />
          ) : null,
        )}
        {[0, 24, 48].map((start) => (
          <text
            key={start}
            x={rounded(start * barWidth + 2)}
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
      <Readout
        figure={
          <span className="inline-flex flex-wrap items-center gap-xxs">
            <Moving>{`${formatHeight(at.meters)} · ${formatSeconds(at.seconds)} · ${formatWind(at.knots)}`}</Moving>
            <Bearing degrees={at.windFrom} />
          </span>
        }
        verdict={works(at) ? m.learn_i_week_window() : m.learn_i_week_not_yet()}
      />
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

// Two spots on one coast: a beach that faces west, and a cove that faces south behind a headland.
const SPOTS = [
  { name: () => m.learn_i_neighbours_west(), cx: 190, cy: 60, from: 225, to: 315 },
  { name: () => m.learn_i_neighbours_south(), cx: 230, cy: 135, from: 150, to: 215 },
] as const;

/** One swell, two spots a few kilometres apart: each has its own window. */
export function NeighboursDemo() {
  const [degrees, setDegrees] = useState(290);
  const color = scaleColor(WAVE_HEIGHT_SCALE, 0.5);
  return (
    <Demo>
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
        <Arrow cx={70} cy={85} fromDegrees={degrees} length={34} color={color} />
      </Scene>
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
