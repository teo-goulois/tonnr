import { APP_NAME } from "@repo/config/app";
import {
  BellOnFillDuoIcon,
  EnvelopePhoneFillDuoIcon,
  MoonFillDuoIcon,
  SunriseFillDuoIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { type Arc, rangeWords } from "@/components/alerts/alert-words";
import { TideTrend } from "@/components/alerts/tide-trend";
import { Bearing } from "@/components/viewer/bearing";
import type { AlertCriteria } from "@/components/viewer/types";
import {
  WAVE_HEIGHT_SCALE,
  WAVE_PERIOD_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
} from "@/lib/sea-scales";
import { guidePath } from "@/lib/learn";
import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

import {
  Card,
  SectionTitle,
  Tile,
  Woven,
  apart,
  arrive,
  column,
  order,
  under,
  useArriving,
} from "./landing-parts";

const KNOTS_PER_MS = 1.943844;

// An alert as someone might write it for a beach that faces west. It is said in the words of the
// editor, `AlertEditor`, so that the page reads as the product does.
const EXAMPLE = {
  waveHeightMeters: { min: 1.2, max: 2 },
  wavePeakPeriodSeconds: { min: 10 },
  waveDirectionDegrees: { from: 250, to: 310 },
  windSpeedMetersPerSecond: { max: 12 / KNOTS_PER_MS },
  windDirectionDegrees: { from: 45, to: 135 },
  tideHeightMeters: { min: 2, max: 4 },
  tideTrend: "rising",
} satisfies AlertCriteria;
const SHORTEST_HOURS = 2;
// The green the map gives a sea of a metre and a half: a spot that works.
const WORKS_COLOR = scaleColor(WAVE_HEIGHT_SCALE, 1.5);

// When an alert speaks, and how: the evening before, on the day, the way the reader chose.
const MOMENTS = [
  {
    icon: <MoonFillDuoIcon />,
    color: scaleColor(WAVE_PERIOD_SCALE, 14),
    title: m.landing_alert_evening_title,
    text: m.landing_alert_evening_text,
  },
  {
    icon: <SunriseFillDuoIcon />,
    color: scaleColor(WIND_SPEED_SCALE, 25),
    title: m.landing_alert_day_title,
    text: m.landing_alert_day_text,
  },
  {
    icon: <EnvelopePhoneFillDuoIcon />,
    color: WORKS_COLOR,
    title: m.landing_alert_way_title,
    text: m.landing_alert_way_text,
  },
];

// How the editor underlines a part its writer sets, where it opens what changes it. A direction
// carries its own line, which an arrow interrupts, and draws it darker when its part is pointed at.
const underlined =
  "underline decoration-neutral-5 decoration-dotted decoration-1 underline-offset-[0.25em] transition-[text-decoration-color] duration-(--motion-duration) group-hover/part:decoration-neutral-10";

// As the sentence comes into view, a mark passes over each part in turn, `at` its place, as the
// editor marks what its writer set: `landing-mark` in `index.css`.
const marked =
  "box-decoration-clone bg-no-repeat [background-image:linear-gradient(var(--mark),var(--mark))] [background-size:0%_100%] group-data-[seen]/sentence:motion-safe:animate-landing-mark";

function Part({
  at,
  className,
  children,
}: {
  at: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      style={{ animationDelay: `${300 + at * 110}ms` }}
      className={cn("group/part font-medium text-neutral-10", underlined, marked, className)}
    >
      {children}
    </span>
  );
}

/** Whether an element has been seen, half of it at once: once it has, it stays seen. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry || entry.intersectionRatio < 0.5) return;
        setSeen(true);
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return { ref, "data-seen": seen || undefined };
}

// When each tile of the moments moves, once the sentence has been marked.
const POPS = ["[animation-delay:1100ms]", "[animation-delay:1220ms]", "[animation-delay:1340ms]"];

// A sector, as the editor shows it: an arrow and a name for each of its ends, clockwise, on one
// line.
function Sector({ arc, at }: { arc: Arc; at: number }) {
  return (
    <Part at={at} className="whitespace-nowrap">
      {m.alert_from()} <Bearing degrees={arc.from} className={underlined} />–
      <Bearing degrees={arc.to} className={underlined} />
    </Part>
  );
}

/** What an alert is, shown as the sentence its editor writes. */
export function LandingAlert() {
  const arriving = useArriving<HTMLElement>();
  const sentence = useSeen<HTMLParagraphElement>();
  return (
    <section {...arriving} className={`${column} ${apart} ${under} group/arrival grid`}>
      <SectionTitle
        title={
          <Woven
            say={m.landing_alert_title}
            words={{
              alert: (
                <>
                  <Tile color={WORKS_COLOR}>
                    <BellOnFillDuoIcon />
                  </Tile>
                  {m.landing_alert_word()}
                </>
              ),
            }}
          />
        }
        more={m.landing_alert_more({ name: APP_NAME })}
        className={cn(arrive, "max-w-4xl")}
      />
      <div className="grid gap-l lg:grid-cols-12 lg:gap-x-xl">
        <p
          style={order(2)}
          className={cn(
            arrive,
            "text-l font-medium text-balance text-neutral-10 max-sm:text-[1.25rem] max-sm:leading-[1.3] lg:col-span-4 lg:py-xl",
          )}
        >
          {m.landing_alert_note({ name: APP_NAME })}
        </p>
        <Card
          className={cn(arrive, "self-start max-lg:row-start-1 lg:col-span-8 lg:p-xl")}
          style={order(1)}
        >
          <p
            {...sentence}
            style={
              { "--mark": `color-mix(in oklab, ${WORKS_COLOR} 32%, transparent)` } as CSSProperties
            }
            className="group/sentence text-l text-neutral-7 max-sm:text-[1.0625rem] max-sm:leading-[1.7]"
          >
            {m.alert_says_waves()}{" "}
            <Part at={0}>
              {m.alert_height_of({
                range: rangeWords("waveHeightMeters", EXAMPLE.waveHeightMeters),
              })}
            </Part>
            ,{" "}
            <Part at={1}>
              {m.alert_period_of({
                range: rangeWords("wavePeakPeriodSeconds", EXAMPLE.wavePeakPeriodSeconds),
              })}
            </Part>
            , <Sector at={2} arc={EXAMPLE.waveDirectionDegrees} />, {m.alert_says_wind()}{" "}
            <Part at={3}>
              {m.alert_wind_at({
                range: rangeWords("windSpeedMetersPerSecond", EXAMPLE.windSpeedMetersPerSecond),
              })}
            </Part>
            , <Sector at={4} arc={EXAMPLE.windDirectionDegrees} />, {m.alert_says_tide()}{" "}
            <Part at={5}>
              {m.alert_tide_at({ range: rangeWords("tideHeightMeters", EXAMPLE.tideHeightMeters) })}
            </Part>
            ,{" "}
            <Part at={6}>
              <TideTrend trend={EXAMPLE.tideTrend} className={underlined} />
            </Part>
            , {m.alert_says_for()} <Part at={7}>{m.alert_hours({ count: SHORTEST_HOURS })}</Part>.
          </p>
          {/* The figures of the sentence are the lessons of the beginner's guide: decision 060. */}
          <p className="mt-m text-s text-neutral-7">
            {m.landing_alert_learn()}{" "}
            <a
              href={localizeHref(guidePath("beginner"))}
              className="focus-ring rounded-xs font-medium text-neutral-10 underline decoration-neutral-5 underline-offset-4 transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10"
            >
              {m.landing_alert_learn_link()}
            </a>
          </p>
        </Card>
        <ul
          data-seen={sentence["data-seen"]}
          className="group/moments grid gap-m sm:grid-cols-3 sm:gap-l lg:col-span-12"
        >
          {MOMENTS.map((moment, index) => (
            <li
              key={moment.title()}
              style={order(3 + index)}
              className={cn(arrive, "flex items-start gap-s sm:gap-m")}
            >
              <Tile
                color={moment.color}
                className={cn(
                  "mr-0 shrink-0 rounded-[0.63em] text-l [--tile:2.25em] max-sm:text-m [&_svg]:size-[1.2em] group-data-[seen]/moments:motion-safe:animate-landing-pop",
                  POPS[index],
                )}
              >
                {moment.icon}
              </Tile>
              <p className="text-neutral-7 text-balance">
                <span className="font-medium text-neutral-10">{moment.title()}</span>{" "}
                {moment.text()}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
