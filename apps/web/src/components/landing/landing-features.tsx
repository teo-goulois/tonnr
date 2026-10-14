import { ArrowLeftIcon, CircleCheckIcon, LockIcon, PinIcon, ShareIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { RankBadge } from "@/components/guides/rank";
import { RatingStars } from "@/components/sessions/rating";
import { formatNumber } from "@/lib/format";
import {
  TIDE_COLOR,
  WAVE_HEIGHT_SCALE,
  WAVE_PERIOD_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
  scaleInk,
} from "@/lib/sea-scales";
import { formatHeight, formatWind } from "@/lib/units";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { AppName, SECTIONS, SectionTitle, Woven, apart, column } from "./landing-parts";

// Every figure drawn here is an example, in the colors the app gives the same figure: a card
// shows what a feature looks like, not what the sea does.
const heightColor = (meters: number) => scaleColor(WAVE_HEIGHT_SCALE, meters);
const stops = (scale: typeof WAVE_HEIGHT_SCALE) => scale.map((stop) => stop.color).join(", ");

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
  return (
    <li
      className={cn(
        "group/feature flex flex-col justify-between gap-l rounded-(--radius-s) bg-neutral-2 p-l",
        className,
      )}
    >
      <div aria-hidden className="flex min-h-32 flex-1 items-center justify-center">
        {children}
      </div>
      <div className="grid gap-xxs">
        <h3 className="font-medium">{name}</h3>
        <p className="text-neutral-7">{text}</p>
      </div>
    </li>
  );
}

// A buoy as the map writes one: its color, its height and its period.
function Marker({
  meters,
  seconds,
  className,
}: {
  meters: number;
  seconds: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "edge absolute inline-flex items-center gap-xxs rounded-full bg-neutral-1 py-xxs pr-xs pl-xxs text-xs font-medium whitespace-nowrap transition-[translate] duration-(--motion-large-duration) ease-theme group-hover/feature:-translate-y-0.5 motion-reduce:transition-none",
        className,
      )}
    >
      <span className="size-3.5 rounded-full" style={{ backgroundColor: heightColor(meters) }} />
      {formatHeight(meters)}
      <span className="font-normal text-neutral-7">{m.unit_seconds({ value: seconds })}</span>
    </span>
  );
}

function Sea() {
  return (
    <div className="grid w-full gap-s">
      <div
        className="relative h-36 overflow-hidden rounded-(--radius-xs)"
        style={{
          backgroundImage: `linear-gradient(118deg, ${[4, 3, 2.5, 2, 1.5, 1, 0.5]
            .map(heightColor)
            .join(", ")})`,
        }}
      >
        <Marker meters={3.4} seconds={10} className="top-[18%] left-[9%]" />
        <Marker meters={2.3} seconds={11} className="top-[52%] left-[38%]" />
        <Marker meters={1.2} seconds={9} className="top-[24%] left-[68%]" />
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

function Buoys() {
  const color = heightColor(1.9);
  return (
    <div className="grid w-full gap-s">
      <svg viewBox="0 0 240 80" className="h-24 w-full overflow-visible" fill="none">
        <path
          d="M0 22 C20 26 30 30 48 32 S78 38 96 44 S126 54 150 56"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M0 28 C30 30 60 38 96 48 S150 42 176 36 S214 34 240 38"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 4"
          strokeLinecap="round"
        />
        <line x1="150" y1="0" x2="150" y2="80" strokeDasharray="2 3" className="stroke-neutral-6" />
      </svg>
      <div className="flex gap-m text-xs text-neutral-7">
        <span className="inline-flex items-center gap-xs">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />
          {m.landing_buoys_measured()}
        </span>
        <span className="inline-flex items-center gap-xs">
          <span className="w-4 border-t-2 border-dotted" style={{ borderColor: color }} />
          {m.landing_buoys_model()}
        </span>
      </div>
    </div>
  );
}

// A week as the forecast's table colors it: the height of the waves, their period and the wind.
const WEEK = [
  { meters: 0.9, seconds: 8, knots: 14 },
  { meters: 1.2, seconds: 9, knots: 10 },
  { meters: 1.8, seconds: 12, knots: 6 },
  { meters: 2.4, seconds: 14, knots: 8 },
  { meters: 2.1, seconds: 13, knots: 16 },
  { meters: 1.5, seconds: 11, knots: 22 },
  { meters: 1.1, seconds: 9, knots: 12 },
];

function Cell({ color, ink, children }: { color: string; ink: string; children: ReactNode }) {
  return (
    <span
      className="grid h-7 place-items-center rounded-[6px] text-xs font-medium tabular-nums"
      style={{ backgroundColor: color, color: ink }}
    >
      {children}
    </span>
  );
}

function Forecasts() {
  const day = new Intl.DateTimeFormat(getLocale(), { weekday: "narrow", timeZone: "UTC" });
  return (
    <div className="grid w-full grid-cols-7 gap-xxs">
      {WEEK.map((hour, index) => (
        <div key={index} className="grid gap-xxs">
          <span className="text-center text-xs text-neutral-7">
            {/* 2026-10-12 is a Monday. */}
            {day.format(Date.UTC(2026, 9, 12 + index))}
          </span>
          <Cell
            color={scaleColor(WAVE_HEIGHT_SCALE, hour.meters)}
            ink={scaleInk(WAVE_HEIGHT_SCALE, hour.meters)}
          >
            {formatNumber(hour.meters, 1)}
          </Cell>
          <Cell
            color={scaleColor(WAVE_PERIOD_SCALE, hour.seconds)}
            ink={scaleInk(WAVE_PERIOD_SCALE, hour.seconds)}
          >
            {hour.seconds}
          </Cell>
          <Cell
            color={scaleColor(WIND_SPEED_SCALE, hour.knots)}
            ink={scaleInk(WIND_SPEED_SCALE, hour.knots)}
          >
            {hour.knots}
          </Cell>
        </div>
      ))}
    </div>
  );
}

function Tides() {
  return (
    <svg viewBox="0 0 240 90" className="h-28 w-full overflow-visible" fill="none">
      <path
        d="M0 62 C30 62 40 18 70 18 S110 72 140 72 S180 22 210 22 S234 36 240 42 L240 90 L0 90 Z"
        fill={TIDE_COLOR}
        fillOpacity="0.14"
      />
      <path
        d="M0 62 C30 62 40 18 70 18 S110 72 140 72 S180 22 210 22 S234 36 240 42"
        stroke={TIDE_COLOR}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {[
        [70, 18],
        [140, 72],
        [210, 22],
      ].map(([x, y]) => (
        <circle
          key={x}
          cx={x}
          cy={y}
          r="4"
          fill={TIDE_COLOR}
          className="stroke-neutral-2"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

function Wind() {
  const knots = 8;
  return (
    <div className="grid justify-items-center gap-s">
      <span
        className="grid size-20 place-items-center rounded-full text-l transition-[rotate] duration-(--motion-large-duration) ease-theme group-hover/feature:rotate-12 motion-reduce:transition-none"
        style={{
          backgroundColor: scaleColor(WIND_SPEED_SCALE, knots),
          color: scaleInk(WIND_SPEED_SCALE, knots),
        }}
      >
        <ArrowLeftIcon className="size-8" />
      </span>
      <span className="text-s font-medium">
        {formatWind(knots)} · {m.wind_offshore()}
      </span>
    </div>
  );
}

function Spots() {
  const row =
    "flex items-center justify-between gap-m rounded-(--radius-xs) bg-neutral-1 px-s py-xs";
  return (
    <div className="grid w-full gap-xs text-s">
      <div className={row}>
        <span className="inline-flex items-center gap-xs font-medium">
          <PinIcon className="size-4" />
          {m.landing_spots_example()}
        </span>
        <span className="inline-flex items-center gap-xxs text-neutral-7">
          <LockIcon className="size-3.5" />
          {m.landing_spots_private()}
        </span>
      </div>
      <div className={row}>
        <span className="inline-flex items-center gap-xs font-medium">
          <PinIcon className="size-4" />
          La Torche
        </span>
        <span className="inline-flex items-center gap-xxs text-neutral-7">
          <ShareIcon className="size-3.5" />
          {m.landing_spots_shared()}
        </span>
      </div>
    </div>
  );
}

function Sessions() {
  return (
    <div className="grid w-full gap-xs text-s">
      {[
        { rating: 4.5, meters: 1.6, seconds: 12 },
        { rating: 3, meters: 1.1, seconds: 9 },
      ].map((session) => (
        <div
          key={session.rating}
          className="flex items-center justify-between gap-m rounded-(--radius-xs) bg-neutral-1 px-s py-xs"
        >
          <RatingStars rating={session.rating} />
          <span className="inline-flex items-center gap-xs text-neutral-7 tabular-nums">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: heightColor(session.meters) }}
            />
            {formatHeight(session.meters)} · {m.unit_seconds({ value: session.seconds })}
          </span>
        </div>
      ))}
    </div>
  );
}

function Community() {
  return (
    <div className="grid w-full gap-s text-s">
      <div className="flex items-center justify-between gap-m rounded-(--radius-xs) bg-neutral-1 px-s py-xs">
        <span className="font-medium">{m.landing_community_line()}</span>
        <span className="inline-flex items-center gap-xxs text-neutral-7">
          <CircleCheckIcon className="size-3.5" />
          {m.landing_community_confirmed()}
        </span>
      </div>
      <div className="flex items-center gap-xs">
        <RankBadge rank="qs" />
        <RankBadge rank="cs" />
        <RankBadge rank="ct" />
      </div>
    </div>
  );
}

function Open() {
  const chip = "edge rounded-full bg-neutral-1 px-s py-xxs text-s font-medium";
  return (
    <div className="flex flex-wrap items-center justify-center gap-xs">
      <span className={chip}>AGPL-3.0</span>
      <span className={chip}>Docker</span>
      <span className={chip}>{m.landing_open_data()}</span>
    </div>
  );
}

/** What the product does, drawn: a card for each thing, in the colors the app gives it. */
export function LandingFeatures() {
  return (
    <section aria-labelledby={SECTIONS.features} className={`${column} ${apart} grid gap-xl`}>
      <SectionTitle
        id={SECTIONS.features}
        title={<Woven say={m.landing_features_title} words={{ name: <AppName /> }} />}
        more={m.landing_features_more()}
        className="max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]"
      />
      <ul className="grid gap-m lg:grid-cols-12">
        <Feature name={m.landing_sea_name()} text={m.landing_sea_text()} className="lg:col-span-7">
          <Sea />
        </Feature>
        <Feature
          name={m.landing_buoys_name()}
          text={m.landing_buoys_text()}
          className="lg:col-span-5"
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
          className="lg:col-span-4"
        >
          <Tides />
        </Feature>
        <Feature
          name={m.landing_wind_name()}
          text={m.landing_wind_text()}
          className="lg:col-span-3"
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
          text={m.landing_sessions_text()}
          className="lg:col-span-4"
        >
          <Sessions />
        </Feature>
        <Feature
          name={m.landing_community_name()}
          text={m.landing_community_text()}
          className="lg:col-span-4"
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
