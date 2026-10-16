import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { ArrowRightIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { OpenTheMap } from "@/components/landing/landing-footer";
import { Tile, arrive, order, useArriving } from "@/components/landing/landing-parts";
import { type LessonOf, type Level, guidePath } from "@/lib/learn";
import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

import { GUIDE_LEADS, GUIDE_TITLES, LESSON_HEADS, LEVEL_NAMES } from "./lessons";
import { LearnFrame, learnRoot } from "./learn-frame";
import { Prose } from "./prose";

// A guide: five lessons, each with its paragraphs, its demo and one line to remember, then the
// way to the spots and to the map, and the next guide. Each lesson arrives as the landing's parts
// do once it is reached, its title first: a demo arrives at rest, and moves under the reader's
// hand alone. Decision 060.

export type LessonSpec<L extends Level> = {
  id: LessonOf<L>;
  paragraphs: string[];
  demo: ReactNode;
  keep: string;
};

const anchored = "scroll-mt-[calc(var(--space-xxl)*2)]";

function Lesson<L extends Level>({
  level,
  lesson,
  number,
}: {
  level: L;
  lesson: LessonSpec<L>;
  number: number;
}) {
  const head = LESSON_HEADS[level][lesson.id];
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      id={lesson.id}
      aria-labelledby={`${lesson.id}-title`}
      className={cn("group/arrival grid gap-m", anchored)}
    >
      <h2
        id={`${lesson.id}-title`}
        className={cn(arrive, "group/lively flex items-center gap-s text-l font-medium")}
        style={order(0)}
      >
        <Tile color={head.color} className="mr-0 rounded-[0.5rem] text-s [--tile:--spacing(7)]">
          <span className="text-xs font-bold">{number}</span>
        </Tile>
        {head.title()}
      </h2>
      <div className={cn(arrive, "grid gap-s")} style={order(1)}>
        {lesson.paragraphs.map((text) => (
          <Prose key={text} text={text} />
        ))}
      </div>
      <div className={arrive} style={order(2)}>
        {lesson.demo}
      </div>
      <p
        className={cn(arrive, "rounded-(--radius-xs) bg-neutral-2 px-m py-s text-neutral-10")}
        style={order(3)}
      >
        <span className="font-medium">{m.learn_takeaway()}</span>{" "}
        <Prose inline text={lesson.keep} />
      </p>
    </section>
  );
}

/** The end of a guide: the way to the spots and to the map, and what a guide adds beside them. */
function Closing({ also }: { also?: ReactNode }) {
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      className="group/arrival grid gap-m rounded-(--radius-s) bg-neutral-2 p-m sm:p-l"
    >
      <h2 className={cn(arrive, "text-l font-medium")} style={order(0)}>
        {m.learn_closing_title()}
      </h2>
      <p className={cn(arrive, "text-neutral-7")} style={order(1)}>
        {m.learn_closing_text({ name: APP_NAME })}
      </p>
      <div className={cn(arrive, "flex flex-wrap gap-s")} style={order(2)}>
        <Link to="/spots" className={cn(buttonVariants({ variant: "secondary" }), "group/open")}>
          {m.learn_find_spot()}
          <ArrowRightIcon
            data-slot="icon"
            aria-hidden
            className="transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
        <OpenTheMap />
        {also}
      </div>
    </section>
  );
}

/** The way to the next guide: its level over its title, the whole a link. */
function NextGuide({ level }: { level: Level }) {
  return (
    <a
      href={localizeHref(guidePath(level))}
      className="group/open focus-ring grid gap-xxs justify-self-start rounded-xs"
    >
      <span className="text-s text-neutral-7">
        {m.learn_next()} {LEVEL_NAMES[level]()}
      </span>
      <span className="font-medium text-balance text-neutral-10">
        {GUIDE_TITLES[level]()}
        <ArrowRightIcon
          aria-hidden
          className="ml-xxs inline size-4 align-[-0.15em] transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
        />
      </span>
    </a>
  );
}

export function GuidePage<L extends Level>({
  level,
  before,
  lessons,
  also,
  next,
}: {
  level: L;
  // What stands between the lead and the lessons, such as an example of the sentence.
  before?: ReactNode;
  lessons: LessonSpec<L>[];
  // What stands beside the two ways out of the closing, such as the way to the log of sessions.
  also?: ReactNode;
  next?: Level;
}) {
  return (
    <LearnFrame
      crumbs={[learnRoot(), { name: LEVEL_NAMES[level](), page: null }]}
      title={GUIDE_TITLES[level]()}
      lead={<Prose inline text={GUIDE_LEADS[level]()} />}
    >
      <nav aria-label={m.learn_lessons()} className="grid gap-xs">
        <h2 className="text-s font-medium text-neutral-7">{m.learn_lessons()}</h2>
        <ol className="grid gap-xxs sm:grid-cols-2">
          {lessons.map((lesson, index) => (
            <li key={lesson.id}>
              <a
                href={`#${lesson.id}`}
                className="group/lively focus-ring edge flex items-center gap-s rounded-(--radius-xs) bg-neutral-1 px-s py-xs transition-[translate] duration-(--motion-duration) ease-theme hover:-translate-y-0.5 motion-reduce:transition-none"
              >
                <Tile
                  color={LESSON_HEADS[level][lesson.id].color}
                  className="mr-0 shrink-0 rounded-[0.4rem] text-s [--tile:--spacing(6)]"
                >
                  <span className="text-xs font-bold">{index + 1}</span>
                </Tile>
                <span className="font-medium">{LESSON_HEADS[level][lesson.id].title()}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {before}
      {lessons.map((lesson, index) => (
        <Lesson key={lesson.id} level={level} lesson={lesson} number={index + 1} />
      ))}
      <Closing also={also} />
      {next && <NextGuide level={next} />}
    </LearnFrame>
  );
}
