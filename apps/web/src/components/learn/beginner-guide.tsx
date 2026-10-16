import { APP_NAME } from "@repo/config/app";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { TideTrend } from "@/components/alerts/tide-trend";
import { Bearing } from "@/components/viewer/bearing";
import { SHORE_WIND_NAMES } from "@/components/viewer/details/parts";
import { formatClock, formatSeconds } from "@/lib/format";
import { type LessonOf, lessonHref } from "@/lib/learn";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { HeightDemo, PeriodDemo, SwellDemo, TideDemo, WindDemo } from "./demos-beginner";
import { GuidePage } from "./guide-page";

// The beginner's guide: the things the sea's sentence writes and judges, one lesson each.
// The texts are Téo's, as messages; the figures in them are written in the reader's units.
// Decision 060.

// How the sentence of a break's page underlines a part, where it leads to its lesson.
const part =
  "focus-ring rounded-xs font-medium text-neutral-10 underline decoration-neutral-5 decoration-dotted decoration-1 underline-offset-[0.25em] transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10";

function Part({ lesson, children }: { lesson: LessonOf<"beginner">; children: ReactNode }) {
  return (
    <a href={lessonHref("beginner", lesson)} className={cn(part, "whitespace-nowrap")}>
      {children}
    </a>
  );
}

// An example of the sentence, with invented figures: high water at 14:10 in UTC.
const HIGH_WATER = new Date(Date.UTC(2026, 9, 12, 14, 10));

/** The sentence as a break's page writes it, each part leading to the lesson that explains it. */
function SentenceExample() {
  useUnits();
  return (
    <section className="grid gap-s rounded-(--radius-s) bg-neutral-2 p-m sm:p-l">
      <p className="text-s font-medium text-neutral-7">{m.learn_sentence_note()}</p>
      <p className="text-m text-neutral-7 sm:text-l">
        {m.page_now_says_waves()} <Part lesson="height">{formatHeight(1.4)}</Part>,{" "}
        <Part lesson="period">{m.alert_period_of({ range: formatSeconds(12) })}</Part>,{" "}
        <Part lesson="swell">
          {m.alert_from()} <Bearing degrees={290} />
        </Part>
        , {m.page_now_says_wind()} <Part lesson="wind">{formatWind(8)}</Part>,{" "}
        <Part lesson="wind">
          {m.alert_from()} <Bearing degrees={45} />
        </Part>
        , <Part lesson="wind">{SHORE_WIND_NAMES.offshore()}</Part>, {m.page_now_says_tide()}{" "}
        <Part lesson="tide">
          <TideTrend trend="rising" />
        </Part>
        , <Part lesson="tide">{m.page_now_high_at({ time: formatClock(HIGH_WATER, "UTC") })}</Part>.
      </p>
    </section>
  );
}

export function BeginnerGuide() {
  useUnits();
  const name = { name: APP_NAME };
  return (
    <GuidePage
      level="beginner"
      next="intermediate"
      before={<SentenceExample />}
      lessons={[
        {
          id: "height",
          paragraphs: [
            m.learn_b_height_p1(),
            m.learn_b_height_p2({ one: formatHeight(1), more: formatHeight(1.5) }),
            m.learn_b_height_p3({
              from: formatHeight(0.5),
              to: formatHeight(1),
              above: formatHeight(1.5),
            }),
          ],
          demo: <HeightDemo />,
          keep: m.learn_b_height_keep(),
        },
        {
          id: "period",
          paragraphs: [m.learn_b_period_p1(), m.learn_b_period_p2(), m.learn_b_period_p3()],
          demo: <PeriodDemo />,
          keep: m.learn_b_period_keep(),
        },
        {
          id: "swell",
          paragraphs: [
            m.learn_b_swell_p1(name),
            m.learn_b_swell_p2({ height: formatHeight(2) }),
            m.learn_b_swell_p3(),
          ],
          demo: <SwellDemo />,
          keep: m.learn_b_swell_keep({ height: formatHeight(2) }),
        },
        {
          id: "wind",
          paragraphs: [
            m.learn_b_wind_p1(),
            m.learn_b_wind_p2(name),
            m.learn_b_wind_p3({ calm: formatWind(10), strong: formatWind(20) }),
          ],
          demo: <WindDemo />,
          keep: m.learn_b_wind_keep(),
        },
        {
          id: "tide",
          paragraphs: [m.learn_b_tide_p1(), m.learn_b_tide_p2(), m.learn_b_tide_p3()],
          demo: <TideDemo />,
          keep: m.learn_b_tide_keep(),
        },
      ]}
    />
  );
}
