import { APP_NAME } from "@repo/config/app";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip-popup";
import {
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  LockIcon,
  PinIcon,
  ShareIcon,
  SunriseFillDuoIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { ConditionsSummary } from "@/components/alerts/alert-summary";
import { RatingStars } from "@/components/sessions/rating";
import { MorphText } from "@/components/shared/morph-text";
import {
  CHARACTERISTIC_FIELDS,
  type ListedField,
  CharacteristicIcon,
  readCharacteristic,
} from "@/components/viewer/break-characteristics";
import { Bearing } from "@/components/viewer/bearing";
import { LineGlyph } from "@/components/viewer/details/line-glyph";
import {
  cellColors,
  formatGap,
  formatMetric,
  inPalette,
  metrics,
} from "@/components/viewer/details/metrics";
import { BuoyPill, DirectionArrow } from "@/components/viewer/map-markers";
import type { AlertCriteria } from "@/components/viewer/types";
import { formatClock, formatDay } from "@/lib/format";
import {
  TIDE_COLOR,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
  scaleInk,
} from "@/lib/sea-scales";
import { usePalette } from "@/lib/palette";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import {
  type Arrival,
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  arrive as arrives,
  column,
  under,
  useArrivalOf,
  useArriving,
} from "./landing-parts";

// Every figure drawn here is an example, in the colors the app gives the same figure: a card
// shows what a feature looks like, not what the sea does. Each card draws a piece of the app as
// its own components draw it, and moves a little once it comes into view.
const heightColor = (meters: number) => scaleColor(WAVE_HEIGHT_SCALE, meters);
const stops = (scale: typeof WAVE_HEIGHT_SCALE) => scale.map((stop) => stop.color).join(", ");

// 2026-10-12 is a Monday. The examples are dated from it, in UTC, so that the server and the
// browser write the same hours.
const MONDAY = Date.UTC(2026, 9, 12);
const HOUR_MS = 60 * 60 * 1000;
const at = (hours: number) => new Date(MONDAY + hours * HOUR_MS);

// The arrival of a card, as every part of the landing arrives, and whether its own motion may play.
const ArrivalContext = createContext<Arrival>({ stage: "still", moving: false });

/** The arrival of the card being drawn, and whether its own motion may play now. */
function useArrival() {
  return useContext(ArrivalContext);
}

// What comes in as a card arrives: a rise and a fade on the theme's large easing. The delay of each
// part is its `style`, so that the most important comes first, and a card that arrives beside
// another on its row waits for it by its `--card-delay`.
const arrive =
  "transition-[opacity,translate] duration-700 ease-theme-large group-data-[stage=wait]/feature:translate-y-2 group-data-[stage=wait]/feature:opacity-0";
// What is drawn from left to right as a card arrives, as a chart is.
const unveil =
  "transition-[clip-path] duration-[1400ms] ease-theme-large [clip-path:inset(0_0_0_0)] group-data-[stage=wait]/feature:[clip-path:inset(0_100%_0_0)]";
const after = (ms: number): CSSProperties => ({
  transitionDelay: `calc(var(--card-delay, 0ms) + ${ms}ms)`,
});

// A piece of a panel of the app, on the page's color, as it stands in the app.
const panel = "edge w-full rounded-(--radius-xs) bg-neutral-1";

/** One thing the product does: what it looks like, its name, and a line. */
function Feature({
  name,
  text,
  className,
  children,
}: {
  name: string;
  text: string;
  className?: string;
  children: ReactNode;
}) {
  const element = useRef<HTMLLIElement>(null);
  const arrival = useArrivalOf(element);
  return (
    <li
      ref={element}
      data-stage={arrival.stage === "still" ? undefined : arrival.stage}
      className={cn(
        "group/feature flex flex-col justify-between gap-m overflow-hidden rounded-(--radius-s) bg-neutral-2 p-m sm:gap-l sm:p-l",
        className,
      )}
    >
      <div aria-hidden className="flex min-h-32 flex-1 items-center justify-center">
        <ArrivalContext value={arrival}>{children}</ArrivalContext>
      </div>
      <div className="grid gap-xxs">
        <h3 className="font-medium">{name}</h3>
        <p className="text-neutral-7">{text}</p>
      </div>
    </li>
  );
}

// The buoys the sea's card puts on its map, as the map draws them. Their place is in percent.
const PILLS = [
  { meters: 3.4, seconds: 10, from: 285, top: 16, left: 8 },
  { meters: 2.3, seconds: 11, from: 300, top: 54, left: 36 },
  { meters: 1.2, seconds: 9, from: 270, top: 22, left: 66 },
];

function Sea() {
  const { stage, moving } = useArrival();
  // The map selects one buoy after the other, as a reader would.
  const [selected, setSelected] = useState(1);
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => setSelected((one) => (one + 1) % PILLS.length), 2600);
    return () => clearInterval(timer);
  }, [moving]);

  return (
    <div className="grid w-full gap-s">
      <div className="relative h-32 overflow-hidden rounded-(--radius-xs) sm:h-40">
        {/* The field is wider than the card, and drifts slowly while the card is in view. */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[125%]",
            moving && "motion-safe:animate-landing-drift",
          )}
          style={{
            backgroundImage: `linear-gradient(118deg, ${[4, 3.4, 3, 2.5, 2, 1.5, 1.2, 1, 0.5]
              .map(heightColor)
              .join(", ")})`,
          }}
        />
        {PILLS.map((pill, index) => (
          <span
            key={pill.meters}
            className={cn("absolute", arrive)}
            style={{ top: `${pill.top}%`, left: `${pill.left}%`, ...after(200 + index * 90) }}
          >
            <BuoyPill
              tabIndex={-1}
              heightMeters={pill.meters}
              periodSeconds={pill.seconds}
              directionDegrees={pill.from}
              freshness={index === 2 ? "aging" : "fresh"}
              selected={stage !== "wait" && selected === index}
              className="pointer-events-none text-xs"
            />
          </span>
        ))}
      </div>
      <div className="grid gap-xxs">
        <div
          className="h-1.5 rounded-full"
          style={{
            backgroundImage: `linear-gradient(90deg, ${stops(WAVE_HEIGHT_SCALE.slice(0, 11))})`,
          }}
        />
        <div className="flex justify-between text-xs text-neutral-7 tabular-nums">
          {[0, 1, 2, 3, 5, 8].map((meters) => (
            <span key={meters}>{meters}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// A buoy's waves over a day and a half, and the model's over two: the buoy's end where it is now.
const CHART = { width: 300, height: 104, left: 18, top: 6, bottom: 96, min: 0.8, max: 3.2 };
const NOW = 0.62;
// A coordinate written in the page is rounded: the server and the browser compute its last
// digits differently, and the page would not match what the server sent.
const rounded = (value: number) => Math.round(value * 100) / 100;
const chartX = (share: number) => rounded(CHART.left + share * (CHART.width - CHART.left));
const chartY = (meters: number) =>
  rounded(
    CHART.bottom - ((meters - CHART.min) / (CHART.max - CHART.min)) * (CHART.bottom - CHART.top),
  );
const modelAt = (share: number) => 2 + 0.6 * Math.cos(3.9 * share) + 0.15 * Math.sin(9 * share);
// A buoy reads the sea with its noise, the same each time it is drawn.
const noise = (index: number) => {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return value - Math.floor(value) - 0.5;
};
const BUOY = Array.from({ length: 42 }, (_, index) => {
  const share = (index / 41) * NOW;
  return [
    share,
    modelAt(share) + 0.32 * (share / NOW) + 0.1 * Math.sin(index * 1.7) + 0.16 * noise(index),
  ] as const;
});
const BUOY_NOW = BUOY.at(-1)![1];
const line = (points: readonly (readonly [number, number])[]) =>
  points
    .map(
      ([share, meters], index) =>
        `${index ? "L" : "M"}${chartX(share).toFixed(1)} ${chartY(meters).toFixed(1)}`,
    )
    .join(" ");
const MODEL_LINE = line(
  Array.from({ length: 61 }, (_, index) => [index / 60, modelAt(index / 60)]),
);
const BUOY_LINE = line(BUOY);
// The buoy's reading at a share of the chart, between two of its points.
const buoyAt = (share: number) => {
  const place = Math.min(Math.max(share / NOW, 0), 1) * (BUOY.length - 1);
  const index = Math.min(Math.floor(place), BUOY.length - 2);
  const [, from] = BUOY[index]!;
  const [, to] = BUOY[index + 1]!;
  return from + (to - from) * (place - index);
};

// How a reader's pointer goes over the chart while the card is in view: it rests on now, goes
// back over the day the buoy measured, rests there, and comes back. Each step lasts `ms`.
const SCRUB = [
  { ms: 1800, to: NOW },
  { ms: 2400, to: 0.14 },
  { ms: 900, to: 0.14 },
  { ms: 1600, to: 0.36 },
  { ms: 700, to: 0.36 },
  { ms: 1600, to: NOW },
];
const SCRUB_MS = SCRUB.reduce((sum, step) => sum + step.ms, 0);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
function scrubAt(elapsed: number) {
  let time = elapsed % SCRUB_MS;
  let from = SCRUB.at(-1)!.to;
  for (const step of SCRUB) {
    if (time < step.ms) return from + (step.to - from) * easeInOut(time / step.ms);
    time -= step.ms;
    from = step.to;
  }
  return from;
}

function Buoys() {
  useUnits();
  const { moving } = useArrival();
  const height = metrics().height;
  const color = heightColor(BUOY_NOW);
  const cursor = useRef<SVGGElement>(null);
  const buoyDot = useRef<SVGCircleElement>(null);
  const modelDot = useRef<SVGCircleElement>(null);
  // What the head of the lane reads: the figures under the pointer, as the panel's head does.
  const [read, setRead] = useState(NOW);

  // While the card is in view, the pointer is moved in place at each frame, and the figures are
  // written again when the point they read changes.
  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    const start = performance.now();
    const scrub = (time: number) => {
      const share = scrubAt(time - start);
      const x = chartX(share);
      cursor.current?.setAttribute("transform", `translate(${(x - chartX(NOW)).toFixed(2)} 0)`);
      buoyDot.current?.setAttribute("cy", chartY(buoyAt(share)).toFixed(2));
      modelDot.current?.setAttribute("cy", chartY(modelAt(share)).toFixed(2));
      setRead((Math.round((share / NOW) * (BUOY.length - 1)) / (BUOY.length - 1)) * NOW);
      frame = requestAnimationFrame(scrub);
    };
    frame = requestAnimationFrame(scrub);
    return () => {
      cancelAnimationFrame(frame);
      setRead(NOW);
    };
  }, [moving]);

  const buoyRead = buoyAt(read);
  const modelRead = modelAt(read);
  return (
    <div className={cn(panel, "grid gap-xs p-s")}>
      {/* The head of a lane of the panel's chart: its name, the buoy's figure, the model's, and
          the gap between them. */}
      <div className="flex items-center justify-between gap-s text-xs">
        <span className="inline-flex items-center gap-xxs text-neutral-7">
          {height.label}
          <span className="text-neutral-6">{height.unit}</span>
          <DirectionArrow fromDegrees={285} className="size-3 text-neutral-10" />
        </span>
        <span className="inline-flex items-center gap-s tabular-nums">
          <span className="inline-flex items-center gap-xxs font-medium">
            <LineGlyph color={color} />
            <MorphText>{formatMetric(height, buoyRead, false)}</MorphText>
          </span>
          <span className="inline-flex items-center gap-xxs text-neutral-7">
            <LineGlyph dashed color={color} />
            <MorphText>{formatMetric(height, modelRead, false)}</MorphText>
          </span>
          <span
            className={cn("rounded-full bg-neutral-2 px-xs py-px font-medium", arrive)}
            style={after(1300)}
          >
            <MorphText>{formatGap(height, buoyRead, modelRead, false)}</MorphText>
          </span>
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="h-auto w-full overflow-visible"
          fill="none"
        >
          {[1, 2, 3].map((meters) => (
            <g key={meters}>
              <line
                x1={CHART.left}
                x2={CHART.width}
                y1={chartY(meters)}
                y2={chartY(meters)}
                className="stroke-neutral-3"
                strokeDasharray={meters === 2 ? undefined : "2 3"}
              />
              <text
                x={0}
                y={chartY(meters) + 3.5}
                fontSize={10}
                className="fill-neutral-7 tabular-nums"
              >
                {meters}
              </text>
            </g>
          ))}
          <line
            x1={chartX(NOW)}
            x2={chartX(NOW)}
            y1={0}
            y2={CHART.bottom}
            strokeDasharray="3 3"
            className="stroke-neutral-8"
          />
        </svg>
        {/* The model's line and the buoy's are drawn from the left as the card arrives, the
            buoy's first: what was measured, then what was forecast after it. */}
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className={cn("absolute inset-0 h-auto w-full overflow-visible", unveil)}
          style={after(500)}
          fill="none"
        >
          <path
            d={MODEL_LINE}
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        </svg>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className={cn("absolute inset-0 h-auto w-full overflow-visible", unveil)}
          style={after(150)}
          fill="none"
        >
          <path
            d={BUOY_LINE}
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* The buoy's last reading, beating as the panel's fresh dot does. */}
          <circle cx={chartX(NOW)} cy={chartY(BUOY_NOW)} r="3.5" fill={color} />
          <circle
            cx={chartX(NOW)}
            cy={chartY(BUOY_NOW)}
            r="3.5"
            fill={color}
            className="origin-center [transform-box:fill-box] motion-safe:animate-ping"
          />
        </svg>
        {/* The pointer, on the point the head reads: a line, the buoy's dot and the model's. It
            shows once the lines are drawn, and only while it moves. */}
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className={cn(
            "absolute inset-0 h-auto w-full overflow-visible transition-opacity duration-300",
            moving ? "opacity-100 delay-[1600ms]" : "opacity-0",
          )}
          fill="none"
        >
          <g ref={cursor}>
            <line
              x1={chartX(NOW)}
              x2={chartX(NOW)}
              y1={0}
              y2={CHART.bottom}
              className="stroke-neutral-10"
              strokeOpacity={0.5}
            />
            <circle
              ref={modelDot}
              cx={chartX(NOW)}
              cy={chartY(modelAt(NOW))}
              r="3"
              stroke={color}
              strokeWidth="1.5"
              className="fill-neutral-1"
            />
            <circle
              ref={buoyDot}
              cx={chartX(NOW)}
              cy={chartY(BUOY_NOW)}
              r="3.5"
              fill={color}
              strokeWidth="2"
              className="stroke-neutral-1"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

// Twelve columns of three hours from Monday 06:00, as the forecast's grid draws them.
const COLUMNS = [
  { meters: 1.2, seconds: 9, knots: 6, from: 95 },
  { meters: 1.4, seconds: 10, knots: 5, from: 90 },
  { meters: 1.6, seconds: 10, knots: 8, from: 80 },
  { meters: 1.8, seconds: 11, knots: 12, from: 60 },
  { meters: 1.9, seconds: 12, knots: 14, from: 300 },
  { meters: 2.1, seconds: 12, knots: 10, from: 290 },
  { meters: 2.3, seconds: 13, knots: 7, from: 100 },
  { meters: 2.4, seconds: 14, knots: 6, from: 110 },
  { meters: 2.2, seconds: 13, knots: 9, from: 90 },
  { meters: 2, seconds: 13, knots: 13, from: 250 },
  { meters: 1.7, seconds: 12, knots: 18, from: 270 },
  { meters: 1.5, seconds: 11, knots: 16, from: 280 },
].map((column, index) => ({ ...column, hour: 6 + index * 3 }));
// The columns of a day after the first begin with a hair of the page's color, as in the app.
const DAY_RULE = "shadow-[inset_1.5px_0_0_var(--neutral-1)]";

function GridRow({ label, unit }: { label: string; unit?: string }) {
  return (
    <div className="flex h-[26px] items-center text-xs whitespace-nowrap">
      {label}
      {unit && <span className="ml-1 text-neutral-6">{unit}</span>}
    </div>
  );
}

function Forecasts() {
  useUnits();
  // In the colors the app's table is read in, which are Windguru's until the reader chooses.
  const palette = usePalette();
  const all = metrics();
  const rows = [
    { metric: all.height, value: (column: (typeof COLUMNS)[number]) => column.meters },
    { metric: all.period, value: (column: (typeof COLUMNS)[number]) => column.seconds },
    { metric: all.wind, value: (column: (typeof COLUMNS)[number]) => column.knots },
  ];
  const cell = "grid h-[26px] w-[34px] shrink-0 place-items-center tabular-nums";
  const newDay = (hour: number) => hour % 24 === 0;
  const firstDay = COLUMNS.filter((column) => column.hour < 24).length;

  return (
    <div className={cn(panel, "flex overflow-hidden py-xs")}>
      {/* The names of the rows stay, as they do in the app, while the hours scroll under the
          pointer. */}
      <div className="z-10 shrink-0 bg-neutral-1 pr-xs pl-s">
        <div className="h-5" />
        <div className="h-5" />
        {rows.map(({ metric }) => (
          <GridRow key={metric.key} label={metric.label} unit={metric.unit} />
        ))}
        <GridRow label={m.details_direction()} />
      </div>
      <div className={cn("min-w-0 flex-1 overflow-hidden", unveil)} style={after(150)}>
        <div className="w-max text-xs transition-[translate] duration-[900ms] ease-in-out group-hover/feature:-translate-x-[102px] motion-reduce:transition-none">
          <div className="flex h-5 items-center font-medium">
            <span style={{ width: firstDay * 34 }} className="pl-xxs">
              {formatDay(at(0), "UTC")}
            </span>
            <span className="pl-xs">{formatDay(at(24), "UTC")}</span>
          </div>
          <div className="flex h-5 items-center text-neutral-7">
            {COLUMNS.map((column) => (
              <span key={column.hour} className={cn(cell, "h-5")}>
                {String(column.hour % 24).padStart(2, "0")}
              </span>
            ))}
          </div>
          {rows.map(({ metric, value }) => (
            <div key={metric.key} className="flex">
              {COLUMNS.map((column) => (
                <span
                  key={column.hour}
                  className={cn(cell, newDay(column.hour) && DAY_RULE)}
                  style={cellColors(inPalette(metric, palette), value(column))}
                >
                  {formatMetric(metric, value(column), false)}
                </span>
              ))}
            </div>
          ))}
          <div className="flex text-neutral-9">
            {COLUMNS.map((column) => (
              <span key={column.hour} className={cell}>
                <DirectionArrow fromDegrees={column.from} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// A day of tide from Monday 06:00, of the shape the sea gives a coast of the Atlantic.
const TIDE = { mean: 2.7, range: 1.9, high: 4.2, period: 12.42, hours: 24 };
const TIDE_BOX = { width: 300, height: 150, top: 34, bottom: 116, max: 5 };
const tideAt = (hours: number) =>
  TIDE.mean + TIDE.range * Math.cos((2 * Math.PI * (hours - TIDE.high)) / TIDE.period);
const tideRising = (hours: number) =>
  Math.sin((2 * Math.PI * (hours - TIDE.high)) / TIDE.period) < 0;
const tideX = (hours: number) => rounded((hours / TIDE.hours) * TIDE_BOX.width);
const tideY = (meters: number) =>
  rounded(TIDE_BOX.bottom - (meters / TIDE_BOX.max) * (TIDE_BOX.bottom - TIDE_BOX.top));
const TIDE_LINE = Array.from({ length: 97 }, (_, index) => {
  const hours = (index / 96) * TIDE.hours;
  return `${index ? "L" : "M"}${tideX(hours).toFixed(1)} ${tideY(tideAt(hours)).toFixed(1)}`;
}).join(" ");
const EXTREMES = [0, 1, 2, 3]
  .map((half) => ({ hours: TIDE.high + (half * TIDE.period) / 2, high: half % 2 === 0 }))
  .filter(({ hours }) => hours < TIDE.hours - 1);
// Where the line of now stands before the card moves it, and the hours it walks through.
const TIDE_NOW = 8;
const TIDE_WALK = { from: 1, to: 23, ms: 16000 };

// A figure on the tide's chart, as `TideChart` writes one: on a halo of the page's color.
function Mark({
  x,
  y,
  strong,
  children,
}: {
  x: number;
  y: number;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={11}
      strokeWidth={3}
      strokeLinejoin="round"
      className={cn(
        "stroke-neutral-1 tabular-nums [paint-order:stroke]",
        strong ? "fill-neutral-10 font-medium" : "fill-neutral-7",
      )}
    >
      {children}
    </text>
  );
}

function Tides() {
  useUnits();
  const { moving } = useArrival();
  const nowLine = useRef<SVGLineElement>(null);
  const nowDot = useRef<SVGCircleElement>(null);
  const [now, setNow] = useState(TIDE_NOW);

  // While the card is in view, now walks along the day: the line and its dot are moved in place
  // at each frame, and the figure is written again when what it says changes.
  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    const start = performance.now();
    const walk = (time: number) => {
      const share =
        ((time - start) / TIDE_WALK.ms +
          (TIDE_NOW - TIDE_WALK.from) / (TIDE_WALK.to - TIDE_WALK.from)) %
        1;
      const hours = TIDE_WALK.from + share * (TIDE_WALK.to - TIDE_WALK.from);
      const x = String(tideX(hours));
      nowLine.current?.setAttribute("x1", x);
      nowLine.current?.setAttribute("x2", x);
      nowDot.current?.setAttribute("cx", x);
      nowDot.current?.setAttribute("cy", String(tideY(tideAt(hours))));
      setNow(Math.round(hours * 4) / 4);
      frame = requestAnimationFrame(walk);
    };
    frame = requestAnimationFrame(walk);
    return () => cancelAnimationFrame(frame);
  }, [moving]);

  return (
    <div className={cn(panel, "grid gap-xs p-s")}>
      <div className="flex items-center justify-between gap-s text-xs">
        <span className="font-medium">{m.tide_title()}</span>
        <span className="inline-flex items-center gap-xxs text-neutral-7 tabular-nums">
          <MorphText>{formatClock(at(now), "UTC")}</MorphText>·
          <MorphText className="font-medium text-neutral-10">
            {`${formatHeight(tideAt(now))} ${tideRising(now) ? m.alert_trend_rising() : m.alert_trend_falling()}`}
          </MorphText>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${TIDE_BOX.width} ${TIDE_BOX.height}`}
        className="h-auto w-full"
        fill="none"
      >
        {/* The night of Monday, gray as the chart grays every other day. */}
        <rect
          x={tideX(18)}
          width={TIDE_BOX.width - tideX(18)}
          y={0}
          height={TIDE_BOX.height}
          className="fill-neutral-2"
        />
        <g className={unveil} style={after(150)}>
          <path
            d={`${TIDE_LINE} L${TIDE_BOX.width} ${TIDE_BOX.height} L0 ${TIDE_BOX.height} Z`}
            fill={TIDE_COLOR}
            fillOpacity="0.14"
          />
          <path d={TIDE_LINE} stroke={TIDE_COLOR} strokeWidth="2" strokeLinecap="round" />
        </g>
        {EXTREMES.map(({ hours, high }, index) => {
          const x = tideX(hours);
          const y = tideY(tideAt(hours));
          const label = high ? y - 20 : y + 16;
          // Kept whole near an edge, as the chart keeps its figures.
          const half = (formatClock(at(hours), "UTC").length * 6.5) / 2;
          const tx = Math.min(TIDE_BOX.width - half, Math.max(half, x));
          return (
            <g key={hours} className={arrive} style={after(700 + index * 120)}>
              <line
                x1={x}
                x2={x}
                y1={y}
                y2={TIDE_BOX.height}
                stroke={TIDE_COLOR}
                strokeOpacity={0.4}
              />
              <Mark x={tx} y={label} strong>
                {formatClock(at(hours), "UTC")}
              </Mark>
              <Mark x={tx} y={label + 12}>
                {formatHeight(tideAt(hours))}
              </Mark>
            </g>
          );
        })}
        <line
          ref={nowLine}
          x1={tideX(TIDE_NOW)}
          x2={tideX(TIDE_NOW)}
          y1={0}
          y2={TIDE_BOX.height}
          strokeDasharray="3 3"
          className="stroke-neutral-7"
        />
        <circle
          ref={nowDot}
          cx={tideX(TIDE_NOW)}
          cy={tideY(tideAt(TIDE_NOW))}
          r={4}
          fill={TIDE_COLOR}
          className="stroke-neutral-1"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

// The streaks of the wind's card: where each one starts, how long it is, and when it blows.
const GUSTS = [
  { top: 18, left: 70, width: 34, delay: 0 },
  { top: 34, left: 82, width: 22, delay: 900 },
  { top: 52, left: 74, width: 40, delay: 400 },
  { top: 68, left: 86, width: 26, delay: 1500 },
  { top: 82, left: 72, width: 30, delay: 1100 },
];

function Wind() {
  useUnits();
  const { moving } = useArrival();
  const knots = 12;
  const from = 90;
  return (
    <div className="grid w-full justify-items-center gap-s">
      {/* A beach that faces west, the sea on the left and the land on the right, and a wind from
          the east that blows off the shore. */}
      <div className="relative h-28 w-full overflow-hidden rounded-(--radius-xs) bg-neutral-1">
        <svg
          viewBox="0 0 200 112"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <rect width="200" height="112" fill={heightColor(1.2)} fillOpacity="0.16" />
          <path
            d="M128 0 C120 28 140 50 130 74 S136 104 142 112 L200 112 L200 0 Z"
            className="fill-neutral-3"
          />
          <path
            d="M128 0 C120 28 140 50 130 74 S136 104 142 112"
            className={cn("stroke-white/80", moving && "motion-safe:animate-landing-foam")}
            strokeWidth="3"
            strokeDasharray="6 4"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        {GUSTS.map((gust) => (
          <span
            key={gust.top}
            className={cn(
              "absolute h-[1.5px] rounded-full bg-neutral-10/35",
              moving ? "motion-safe:animate-landing-gust" : "opacity-0 motion-reduce:opacity-100",
            )}
            style={{
              top: `${gust.top}%`,
              left: `${gust.left}%`,
              width: gust.width,
              animationDelay: `${gust.delay}ms`,
            }}
          />
        ))}
        <span
          className={cn(
            "absolute top-1/2 left-[42%] grid size-11 -translate-1/2 place-items-center rounded-full",
            moving && "motion-safe:animate-landing-sway",
          )}
          style={{
            backgroundColor: scaleColor(WIND_SPEED_SCALE, knots),
            color: scaleInk(WIND_SPEED_SCALE, knots),
          }}
        >
          <DirectionArrow fromDegrees={from} className="size-5" />
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-xs gap-y-xxs text-s">
        <span className="font-medium tabular-nums">{formatWind(knots)}</span>
        <Bearing degrees={from} />
        <Badge>{m.wind_offshore()}</Badge>
      </div>
    </div>
  );
}

// An icon or a few words that give way to others, as the app's icons do: a fade, a scale from a
// quarter, and a blur of 4 px. Both are kept, one over the other, so that each has its exit.
const swap =
  "col-start-1 row-start-1 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]";
const swapOut = "scale-25 opacity-0 blur-[4px]";

function Spots() {
  const { moving } = useArrival();
  // Now and then the shared list's link is copied, as its owner would.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!moving) return;
    let reset: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setCopied(true);
      reset = setTimeout(() => setCopied(false), 1600);
    }, 4200);
    return () => {
      clearInterval(timer);
      clearTimeout(reset);
      setCopied(false);
    };
  }, [moving]);

  const row =
    "flex items-center justify-between gap-m rounded-(--radius-xs) bg-neutral-1 px-s py-xs edge";
  return (
    <div className="grid w-full gap-xs text-s">
      <div className={cn(row, arrive)} style={after(150)}>
        <span className="inline-flex items-center gap-xs font-medium">
          <PinIcon className="size-4" />
          {m.landing_spots_example()}
        </span>
        <span className="inline-flex items-center gap-xxs text-neutral-7">
          <LockIcon className="size-3.5" />
          {m.landing_spots_private()}
        </span>
      </div>
      <div className={cn(row, arrive)} style={after(260)}>
        <span className="inline-flex items-center gap-xs font-medium">
          <PinIcon className="size-4" />
          La Torche
        </span>
        <span className="grid justify-items-end text-neutral-7">
          <span className={cn(swap, "inline-flex items-center gap-xxs", copied && swapOut)}>
            <ShareIcon className="size-3.5" />
            {m.landing_spots_shared()}
          </span>
          <span
            className={cn(
              swap,
              "inline-flex items-center gap-xxs text-neutral-10",
              !copied && swapOut,
            )}
          >
            <CheckIcon className="size-3.5" />
            {m.landing_copied()}
          </span>
        </span>
      </div>
    </div>
  );
}

// What an account likes at a break, as it reads from its best sessions there.
const LIKED = {
  waveHeightMeters: { min: 1.4, max: 1.9 },
  wavePeakPeriodSeconds: { min: 11 },
  windDirectionDegrees: { from: 45, to: 135 },
} satisfies AlertCriteria;

function Sessions() {
  useUnits();
  return (
    <div className="grid w-full gap-xs text-s">
      {[{ rating: 4.5, meters: 1.6, seconds: 12, day: 0 }].map((session, index) => (
        <div
          key={session.rating}
          className={cn(
            "edge flex items-center justify-between gap-m rounded-(--radius-xs) bg-neutral-1 px-s py-xs",
            arrive,
          )}
          style={after(150 + index * 110)}
        >
          <span className="grid gap-0.5">
            <RatingStars rating={session.rating} />
            <span className="text-xs text-neutral-7">
              {formatDay(at(-24 * session.day), "UTC")}
            </span>
          </span>
          <span className="inline-flex items-center gap-xs text-neutral-7 tabular-nums">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: heightColor(session.meters) }}
            />
            {formatHeight(session.meters)} · {m.unit_seconds({ value: session.seconds })}
          </span>
        </div>
      ))}
      {/* What the log learns, once the sessions are in. */}
      <div
        className={cn("grid gap-0.5 rounded-(--radius-xs) px-s py-xs text-xs", arrive)}
        style={after(400)}
      >
        <span className="font-medium">{m.sessions_liked_title()}</span>
        <span className="text-neutral-7">
          <ConditionsSummary criteria={LIKED} />
        </span>
      </div>
    </div>
  );
}

// A break's guide as the card shows it: a reef that peels right, over rock, for a swell from the
// west, in autumn and winter.
const GUIDE: { field: ListedField; given: string[] }[] = [
  { field: "breakTypes", given: ["reef"] },
  { field: "waveDirections", given: ["right"] },
  { field: "bottomTypes", given: ["rock"] },
  { field: "bestSwellDirections", given: ["W", "WNW", "NW"] },
  { field: "bestSeasons", given: ["autumn", "winter"] },
];

function Community() {
  const { stage } = useArrival();
  // As the card arrives, the line waits for a local, then is confirmed: the ranks light up after.
  const [confirmed, setConfirmed] = useState(true);
  useEffect(() => {
    if (stage === "wait") setConfirmed(false);
    if (stage !== "go") return;
    const timer = setTimeout(() => setConfirmed(true), 1400);
    return () => clearTimeout(timer);
  }, [stage]);

  return (
    <div className="grid w-full gap-m text-s">
      <div
        className={cn(
          "edge grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-s rounded-(--radius-xs) bg-neutral-1 px-s py-xs",
          arrive,
        )}
        style={after(150)}
      >
        <span aria-hidden className="flex size-10">
          <CharacteristicIcon field="bestTides" given={["mid"]} />
        </span>
        <span className="grid gap-0.5">
          <span className="font-medium">{m.landing_community_line()}</span>
          <span className="grid text-xs text-neutral-7">
            <span className={cn(swap, "inline-flex items-center gap-xxs", confirmed && swapOut)}>
              <ClockIcon className="size-3" />
              {m.guide_confirmed_by_one()}
            </span>
            <span
              className={cn(
                swap,
                "inline-flex items-center gap-xxs text-neutral-10",
                !confirmed && swapOut,
              )}
            >
              <CircleCheckIcon className="size-3" />
              {m.landing_community_confirmed()}
            </span>
          </span>
        </span>
      </div>
      {/* The rest of the guide, which each confirmed line completes: each glyph says its line. */}
      <TooltipProvider delay={0}>
        <div className="flex items-center justify-center gap-m">
          {GUIDE.map((line, index) => {
            const label = CHARACTERISTIC_FIELDS.find((one) => one.key === line.field)?.label();
            return (
              <Tooltip key={line.field}>
                <TooltipTrigger
                  render={<span />}
                  tabIndex={0}
                  aria-label={label}
                  className={cn(
                    "flex rounded-full transition-[opacity,scale] duration-500 ease-theme-large focus-visible:outline-(--focus-ring-outline)",
                    !confirmed && "scale-95 opacity-30",
                  )}
                  style={after(confirmed ? 200 + index * 120 : 0)}
                >
                  <CharacteristicIcon field={line.field} given={line.given} />
                </TooltipTrigger>
                <TooltipPopup>
                  <span className="grid text-center">
                    <span className="text-neutral-7">{label}</span>
                    <span>{readCharacteristic(line.field, line.given)}</span>
                  </span>
                </TooltipPopup>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}

function Open() {
  const chip = "edge rounded-full bg-neutral-1 px-s py-xxs text-s font-medium";
  return (
    <div className="flex flex-wrap items-center justify-center gap-xs lg:flex-nowrap lg:whitespace-nowrap">
      <span className={chip}>AGPL-3.0</span>
      <span className={chip}>API & MCP</span>
      <span className={chip}>{m.landing_open_data()}</span>
    </div>
  );
}

/** What the product does, drawn: a card for each thing, in the colors the app gives it. */
export function LandingFeatures() {
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      aria-labelledby={SECTIONS.features}
      className={`${column} ${apart} ${under} group/arrival grid`}
    >
      <SectionTitle
        id={SECTIONS.features}
        title={
          <Woven
            say={m.landing_features_title}
            words={{
              moment: (
                <>
                  <Tile color={scaleColor(WIND_SPEED_SCALE, 25)}>
                    <SunriseFillDuoIcon />
                  </Tile>
                  {m.landing_features_moment()}
                </>
              ),
            }}
          />
        }
        more={m.landing_features_more()}
        className={cn(arrives, "max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]")}
      />
      <ul className="grid gap-m lg:grid-cols-12">
        <Feature name={m.landing_sea_name()} text={m.landing_sea_text()} className="lg:col-span-7">
          <Sea />
        </Feature>
        <Feature
          name={m.landing_buoys_name()}
          text={m.landing_buoys_text()}
          className="lg:col-span-5 lg:[--card-delay:100ms]"
        >
          <Buoys />
        </Feature>
        <Feature
          name={m.landing_forecasts_name()}
          text={m.landing_forecasts_text()}
          className="lg:col-span-5"
        >
          <Forecasts />
        </Feature>
        <Feature
          name={m.landing_tides_name()}
          text={m.landing_tides_text()}
          className="lg:col-span-4 lg:[--card-delay:100ms]"
        >
          <Tides />
        </Feature>
        <Feature
          name={m.landing_wind_name()}
          text={m.landing_wind_text()}
          className="lg:col-span-3 lg:[--card-delay:200ms]"
        >
          <Wind />
        </Feature>
        <Feature
          name={m.landing_spots_name()}
          text={m.landing_spots_text()}
          className="lg:col-span-4"
        >
          <Spots />
        </Feature>
        <Feature
          name={m.landing_sessions_name()}
          text={m.landing_sessions_text({ name: APP_NAME })}
          className="lg:col-span-4 lg:[--card-delay:100ms]"
        >
          <Sessions />
        </Feature>
        <Feature
          name={m.landing_community_name()}
          text={m.landing_community_text()}
          className="lg:col-span-4 lg:[--card-delay:200ms]"
        >
          <Community />
        </Feature>
        <Feature
          name={m.landing_open_name()}
          text={m.landing_open_text()}
          className="lg:col-span-12 lg:flex-row lg:items-center [&>div:first-child]:min-h-0 lg:[&>div:first-child]:order-2 lg:[&>div:first-child]:justify-end"
        >
          <Open />
        </Feature>
      </ul>
    </section>
  );
}
