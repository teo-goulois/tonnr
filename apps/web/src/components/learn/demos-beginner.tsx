import { SIZES, SURF_FACES } from "@repo/conditions/sessions/sizes";
import { shoreWind } from "@repo/conditions/shore-wind";
import { SwellWindowIcon } from "@repo/ui/icon";
import { useState } from "react";

import { TideTrend } from "@/components/alerts/tide-trend";
import { SurfSizePicture, sizeName } from "@/components/sessions/surf-size";
import { UnitTabs } from "@/components/shared/units-settings";
import { Bearing } from "@/components/viewer/bearing";
import { waveEnergy } from "@/components/viewer/details/metrics";
import { SHORE_WIND_NAMES } from "@/components/viewer/details/parts";
import { formatClock, formatNumber, formatSeconds } from "@/lib/format";
import {
  TIDE_COLOR,
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
  Coast,
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

// The demos of the beginner's guide, one for each lesson, over invented figures: what the sea's
// sentence writes, under the reader's hand. Every figure is written in the reader's units, and
// the colors are those the map gives the same figure. Decision 060.

/** The surfer every size is drawn against, in metres. */
const SURFER_METERS = 1.75;

/** The size of a session's log whose height of face a height falls in. */
function sizeOf(meters: number) {
  return (
    SIZES.find((size) => {
      const { least, most } = SURF_FACES[size];
      return meters >= least && (most === null || meters < most);
    }) ?? SIZES[0]!
  );
}

/** The height of the swell offshore, against a surfer, in the map's color. */
export function HeightDemo() {
  useUnits();
  const [meters, setMeters] = useState(1);
  const color = scaleColor(WAVE_HEIGHT_SCALE, meters);
  const verdict =
    meters < 0.5
      ? m.learn_b_height_tiny()
      : meters <= 1
        ? m.learn_b_height_start()
        : meters <= 1.5
          ? m.learn_b_height_confirmed()
          : meters <= 2.5
            ? m.learn_b_height_experienced()
            : m.learn_b_height_big();
  return (
    <Demo>
      <div className="relative overflow-hidden rounded-(--radius-xs) bg-neutral-1">
        <SurfSizePicture size={sizeOf(meters)} className="h-36" />
        <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ backgroundColor: color }} />
      </div>
      <Readout
        figure={<Moving>{m.learn_b_height_announced({ height: formatHeight(meters) })}</Moving>}
        verdict={`${verdict} · ${sizeName(sizeOf(meters))}`}
      >
        <UnitTabs measure="height" />
      </Readout>
      <Control
        label={m.learn_b_height_title()}
        value={meters}
        min={0.3}
        max={3}
        step={0.1}
        text={formatHeight(meters)}
        onChange={setMeters}
      />
      <Hint>{m.learn_b_height_hint({ surfer: formatHeight(SURFER_METERS) })}</Hint>
    </Demo>
  );
}

const PERIOD_SCENE = { width: 320, height: 110, base: 64, amplitude: 14 };
// How far apart two crests are drawn, in pixels, for a period in seconds: wider as the period
// grows, from seven waves across the scene at 5 s to three at 18 s. A swell's true length grows
// with the square of its period, which no scene this wide could show at both ends.
const spacing = (seconds: number) => rounded(16 + seconds * 5.5);
// Where the first crest stands, so that the ruler reads from one crest to the next.
const FIRST_CREST = 40;

/** The waves of a swell drawn to its period, at one height, with the energy they carry. */
export function PeriodDemo() {
  useUnits();
  const [seconds, setSeconds] = useState(10);
  const { width, height, base, amplitude } = PERIOD_SCENE;
  const wavelength = spacing(seconds);
  const points: string[] = [];
  for (let x = 0; x <= width; x += 3) {
    const ripple = seconds < 8 ? 1 - 0.25 * Math.sin(x * 1.3) : 1;
    points.push(
      `${x} ${rounded(base - Math.cos(((x - FIRST_CREST) / wavelength) * Math.PI * 2) * amplitude * ripple)}`,
    );
  }
  const energy = waveEnergy(1, seconds) ?? 0;
  const color = scaleColor(WAVE_PERIOD_SCALE, seconds);
  const verdict =
    seconds < 8
      ? m.learn_b_period_chop()
      : seconds <= 11
        ? m.learn_b_period_surfable()
        : m.learn_b_period_real();
  const ruler = { from: FIRST_CREST, to: rounded(FIRST_CREST + wavelength) };
  return (
    <Demo>
      <Scene viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M${points.join("L")}L${width} ${height}L0 ${height}Z`}
          fill={color}
          opacity={0.8}
        />
        <g className="fill-neutral-7 stroke-neutral-7">
          <line x1={ruler.from} y1={32} x2={ruler.to} y2={32} />
          <line x1={ruler.from} y1={27} x2={ruler.from} y2={37} />
          <line x1={ruler.to} y1={27} x2={ruler.to} y2={37} />
          <line
            x1={ruler.from}
            y1={37}
            x2={ruler.from}
            y2={base - amplitude}
            strokeDasharray="2 3"
            opacity={0.5}
          />
          <line
            x1={ruler.to}
            y1={37}
            x2={ruler.to}
            y2={base - amplitude}
            strokeDasharray="2 3"
            opacity={0.5}
          />
          <text
            x={rounded((ruler.from + ruler.to) / 2)}
            y={24}
            fontSize={10}
            textAnchor="middle"
            stroke="none"
          >
            {formatSeconds(seconds)}
          </text>
        </g>
      </Scene>
      <Readout
        figure={
          <Moving>
            {m.learn_b_period_every({ height: formatHeight(1), period: formatSeconds(seconds) })}
          </Moving>
        }
        verdict={verdict}
      />
      <div className="flex items-baseline justify-between gap-s text-s">
        <span className="text-neutral-7">{m.learn_energy()}</span>
        <span
          className="font-medium tabular-nums"
          style={{ color: scaleColor(WAVE_ENERGY_SCALE, energy * 3) }}
        >
          <Moving>{`${formatNumber(energy, 0)} kJ/m`}</Moving>
        </span>
      </div>
      <Control
        label={m.learn_b_period_title()}
        value={seconds}
        min={5}
        max={18}
        text={formatSeconds(seconds)}
        onChange={setSeconds}
      />
      <Hint>{m.learn_b_period_hint()}</Hint>
    </Demo>
  );
}

// The beach of the two scenes faces west: its window of swell, and the wind that blows offshore.
const WINDOW = { from: 225, to: 315 };
const WINDOW_BEARINGS = [225, 247.5, 270, 292.5, 315];
const OFFSHORE_FROM = 90;
const SCENE = { width: 320, height: 170 };
const SHORE = { x: 225, y: 85 };

/** A swell to turn in front of a beach that faces west: it enters the window, or passes offshore. */
export function SwellDemo() {
  const [degrees, setDegrees] = useState(270);
  const enters = within(degrees, WINDOW.from, WINDOW.to);
  const color = enters ? scaleColor(WAVE_HEIGHT_SCALE, 0.5) : "var(--neutral-6)";
  return (
    <Demo>
      <Scene viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}>
        <Coast landWord={m.learn_land()} />
        <circle
          cx={SHORE.x}
          cy={SHORE.y}
          r={60}
          fill="none"
          strokeWidth={6}
          className="stroke-neutral-4"
        />
        <path
          d={arcPath(SHORE.x, SHORE.y, 60, WINDOW.from, WINDOW.to)}
          fill="none"
          stroke={scaleColor(WAVE_HEIGHT_SCALE, 0.5)}
          strokeWidth={6}
          strokeLinecap="round"
        />
        {[0, 1, 2, 3].map((index) => {
          const x = 40 + index * 35;
          return (
            <path
              key={index}
              d={`M${x} 30Q${x + 15} 85 ${x} 140`}
              stroke={color}
              strokeWidth={2}
              fill="none"
              opacity={enters ? 0.55 - index * 0.1 : 0.15}
            />
          );
        })}
        <Arrow cx={110} cy={85} fromDegrees={degrees} length={34} color={color} />
      </Scene>
      <Readout
        figure={
          <span className="inline-flex items-center gap-xxs">
            {m.learn_b_swell_from()} <Bearing degrees={degrees} withDegrees />
          </span>
        }
        verdict={enters ? m.learn_b_swell_in() : m.learn_b_swell_out()}
      >
        <SwellWindowIcon bearings={WINDOW_BEARINGS} className="size-8" />
      </Readout>
      <Control
        label={m.learn_direction()}
        value={degrees}
        min={0}
        max={359}
        text={`${degrees}°`}
        onChange={setDegrees}
      />
      <Hint>{m.learn_b_swell_hint()}</Hint>
    </Demo>
  );
}

// How messy the wave gets under each wind, from a clean offshore one to a full onshore one.
const MESS = {
  offshore: 0,
  cross_offshore: 0.12,
  cross_shore: 0.35,
  cross_onshore: 0.65,
  onshore: 1,
} as const;
const TOO_STRONG_KNOTS = 20;

/** A wind to turn and to strengthen in front of the same beach: it is named from the shore. */
export function WindDemo() {
  useUnits();
  const [degrees, setDegrees] = useState(OFFSHORE_FROM);
  const [knots, setKnots] = useState(8);
  const name = shoreWind(degrees, OFFSHORE_FROM);
  const mess = Math.min(
    1,
    MESS[name] * Math.min(1, knots / 12) + Math.max(0, (knots - TOO_STRONG_KNOTS) / 30) * 0.5,
  );
  const color = scaleColor(WIND_SPEED_SCALE, knots);
  const points: string[] = [];
  for (let x = 20; x <= 215; x += 5) {
    const swell = Math.sin(((x - 20) / 40) * Math.PI) * 22;
    const chop = mess ? Math.sin(x * 2.1) * 7 * mess + Math.sin(x * 0.7) * 5 * mess : 0;
    points.push(`${x} ${rounded(120 - swell - chop)}`);
  }
  const verdict = [
    SHORE_WIND_NAMES[name](),
    knots > TOO_STRONG_KNOTS
      ? m.learn_b_wind_too_strong()
      : knots < 4
        ? m.learn_b_wind_calm()
        : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <Demo>
      <Scene viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}>
        <Coast landWord={m.learn_land()} />
        <path
          d={`M${points.join("L")}`}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
        />
        <Arrow
          cx={110}
          cy={60}
          fromDegrees={degrees}
          length={rounded(22 + knots * 0.6)}
          color={color}
        />
      </Scene>
      <Readout
        figure={
          <span className="inline-flex flex-wrap items-center gap-xxs">
            {m.learn_b_wind_from()} <Bearing degrees={degrees} withDegrees />
            {", "}
            <Moving>{formatWind(knots)}</Moving>
          </span>
        }
        verdict={verdict}
      >
        <UnitTabs measure="windSpeed" />
      </Readout>
      <Control
        label={m.learn_direction()}
        value={degrees}
        min={0}
        max={359}
        text={`${degrees}°`}
        onChange={setDegrees}
      />
      <Control
        label={m.learn_strength()}
        value={knots}
        min={0}
        max={35}
        text={formatWind(knots)}
        onChange={setKnots}
      />
      <Hint>{m.learn_b_wind_hint()}</Hint>
    </Demo>
  );
}

// A day of tide at a spot: a semi-diurnal one, high at 14:10, from a mean of 2.1 m by 1.6 m.
const TIDE = { mean: 2.1, range: 1.6, highAt: 8.17, cycle: 12.42, hours: 12.4 };
const TIDE_SCENE = { width: 320, height: 150, floor: 130, perMeter: 22 };
// The day the demo is drawn on, in UTC, so that the server and the browser write the same hour.
const DAY = Date.UTC(2026, 9, 12, 6);
const HOUR_MS = 60 * 60 * 1000;

const tideAt = (hour: number) =>
  TIDE.mean + TIDE.range * Math.cos(((hour - TIDE.highAt) / TIDE.cycle) * 2 * Math.PI);

/** The tide over a day, rising over the bottom of a spot, with the hour under the reader's hand. */
export function TideDemo() {
  useUnits();
  const [hour, setHour] = useState(3);
  const { width, floor, perMeter } = TIDE_SCENE;
  const meters = tideAt(hour);
  const trend = tideAt(hour + 0.1) - meters > 0 ? "rising" : "falling";
  const level = rounded(floor - meters * perMeter);
  const curve: string[] = [];
  for (let x = 0; x <= width; x += 4) {
    curve.push(`${x} ${rounded(floor - tideAt((x / width) * TIDE.hours) * perMeter)}`);
  }
  const cursorX = rounded((hour / TIDE.hours) * width);
  const stage =
    meters < 1.2 ? m.learn_b_tide_low() : meters > 3 ? m.learn_b_tide_high() : m.learn_b_tide_mid();
  const clock = formatClock(new Date(DAY + hour * HOUR_MS), "UTC");
  return (
    <Demo>
      <Scene viewBox={`0 0 ${width} ${TIDE_SCENE.height}`}>
        <path d={`M${curve.join("L")}`} stroke={TIDE_COLOR} strokeWidth={2} fill="none" />
        <rect
          x={0}
          y={level}
          width={width}
          height={rounded(floor - level)}
          fill={TIDE_COLOR}
          opacity={0.18}
        />
        <path
          d={`M180 ${floor}Q200 ${rounded(floor - 1.4 * perMeter)} 260 ${rounded(floor - 1.9 * perMeter)}T${width} ${rounded(floor - 2.4 * perMeter)}L${width} ${floor}Z`}
          className="fill-neutral-5"
        />
        <line
          x1={cursorX}
          y1={20}
          x2={cursorX}
          y2={floor}
          strokeDasharray="3 3"
          className="stroke-neutral-7"
        />
        <circle cx={cursorX} cy={level} r={4} fill={TIDE_COLOR} />
      </Scene>
      <Readout
        figure={<Moving>{`${clock} · ${formatHeight(meters)}`}</Moving>}
        verdict={
          <span className="inline-flex items-center gap-xxs">
            {stage}, <TideTrend trend={trend} />
          </span>
        }
      />
      <Control
        label={m.learn_hour()}
        value={hour}
        min={0}
        max={TIDE.hours}
        step={0.1}
        text={clock}
        onChange={setHour}
      />
      <Hint>{m.learn_b_tide_hint()}</Hint>
    </Demo>
  );
}
