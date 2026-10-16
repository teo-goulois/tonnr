import { ArrowRightIcon, BookBookmarkFillDuoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { LEARN_COLOR } from "@/components/learn/learn-hub";
import { GUIDE_TITLES, LESSON_HEADS, LEVEL_NAMES } from "@/components/learn/lessons";
import { GLOSSARY_PATH, LESSONS, LEVELS, guidePath } from "@/lib/learn";
import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

import {
  SECTIONS,
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

/**
 * The guides that teach how to read a forecast, on the landing: the three levels, each with its
 * lessons named, and the glossary, every one leading to its page. Decision 060.
 */
export function LandingLearn() {
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      aria-labelledby={SECTIONS.learn}
      className={`${column} ${apart} ${under} group/arrival grid`}
    >
      <SectionTitle
        id={SECTIONS.learn}
        title={
          <Woven
            say={m.landing_learn_title}
            words={{
              forecast: (
                <>
                  <Tile color={LEARN_COLOR}>
                    <BookBookmarkFillDuoIcon />
                  </Tile>
                  {m.landing_learn_word()}
                </>
              ),
            }}
          />
        }
        more={m.landing_learn_more()}
        className={cn(arrive, "max-w-4xl")}
      />
      <ol className="grid gap-m sm:grid-cols-3 sm:gap-l">
        {LEVELS.map((level, index) => {
          const heads = LESSON_HEADS[level] as Record<
            string,
            { title: () => string; color: string }
          >;
          return (
            <li key={level} style={order(1 + index)} className={arrive}>
              <a
                href={localizeHref(guidePath(level))}
                className="focus-ring group/open grid h-full content-start gap-m rounded-(--radius-s) bg-neutral-2 p-m transition-[translate] duration-(--motion-duration) ease-theme hover:-translate-y-0.5 sm:p-l motion-reduce:transition-none"
              >
                <div className="grid gap-xxs">
                  <span className="text-s font-medium text-neutral-7">{LEVEL_NAMES[level]()}</span>
                  <h3 className="font-medium text-balance">{GUIDE_TITLES[level]()}</h3>
                </div>
                <ol className="grid gap-xxs text-s text-neutral-7">
                  {LESSONS[level].map((lesson, place) => (
                    <li key={lesson} className="flex items-center gap-xs">
                      <Tile
                        color={heads[lesson]!.color}
                        className="mr-0 shrink-0 rounded-[0.3rem] [--tile:--spacing(4)]"
                      >
                        <span className="text-[0.55rem] font-bold">{place + 1}</span>
                      </Tile>
                      {heads[lesson]!.title()}
                    </li>
                  ))}
                </ol>
                <span className="inline-flex items-center gap-xxs font-medium text-neutral-10">
                  {m.learn_read_guide()}
                  <ArrowRightIcon
                    aria-hidden
                    className="size-4 transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
                  />
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      <p style={order(4)} className={cn(arrive, "text-neutral-7")}>
        <a
          href={localizeHref(GLOSSARY_PATH)}
          className="focus-ring rounded-xs font-medium text-neutral-10 underline decoration-neutral-5 underline-offset-4 transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10"
        >
          {m.learn_glossary_title()}
        </a>{" "}
        {m.landing_learn_glossary()}
      </p>
    </section>
  );
}
