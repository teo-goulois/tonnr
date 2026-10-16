import { Badge } from "@repo/ui/components/ui/badge";
import { ArrowRightIcon, BookBookmarkFillDuoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { Tile, Woven } from "@/components/landing/landing-parts";
import { GLOSSARY_PATH, LESSONS, LEVELS, type Level, guidePath } from "@/lib/learn";
import { WAVE_PERIOD_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

import { LearnFrame } from "./learn-frame";
import { GUIDE_LEADS, GUIDE_TITLES, LESSON_HEADS, LEVEL_NAMES } from "./lessons";
import { Prose } from "./prose";

// The page that leads to the three guides and to the glossary: each level with its lessons
// named, so that a reader picks theirs. A guide that is not written yet is said to come.
// Decision 060.

export const LEARN_COLOR = scaleColor(WAVE_PERIOD_SCALE, 10);

/** The guides that have a page today. The others are listed, and said to come. */
export const WRITTEN: readonly Level[] = ["beginner"];

const card = "grid content-start gap-m rounded-(--radius-s) bg-neutral-2 p-m sm:p-l";

function Guide({ level }: { level: Level }) {
  const written = WRITTEN.includes(level);
  const heads = LESSON_HEADS[level] as Record<string, { title: () => string; color: string }>;
  return (
    <li className={card}>
      <div className="grid gap-xs">
        <div className="flex items-center justify-between gap-s">
          <span className="text-s font-medium text-neutral-7">{LEVEL_NAMES[level]()}</span>
          {!written && <Badge>{m.learn_coming()}</Badge>}
        </div>
        <h2 className="text-l font-medium text-balance">{GUIDE_TITLES[level]()}</h2>
        <Prose text={GUIDE_LEADS[level]()} />
      </div>
      <ol className="grid gap-xxs text-s">
        {LESSONS[level].map((lesson, index) => (
          <li key={lesson} className="flex items-center gap-s">
            <Tile
              color={heads[lesson]!.color}
              className="mr-0 shrink-0 rounded-[0.35rem] [--tile:--spacing(5)]"
            >
              <span className="text-[0.6rem] font-bold">{index + 1}</span>
            </Tile>
            {heads[lesson]!.title()}
          </li>
        ))}
      </ol>
      {written && (
        <a
          href={localizeHref(guidePath(level))}
          className="focus-ring group/open inline-flex items-center gap-xxs self-start rounded-xs font-medium"
        >
          {m.learn_read_guide()}
          <ArrowRightIcon
            aria-hidden
            className="size-4 transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
          />
        </a>
      )}
    </li>
  );
}

export function LearnHub() {
  return (
    <LearnFrame
      crumbs={[{ name: m.learn_nav(), page: null }]}
      title={
        <Woven
          say={m.learn_title}
          words={{
            forecast: (
              <>
                <Tile color={LEARN_COLOR}>
                  <BookBookmarkFillDuoIcon />
                </Tile>
                {m.learn_title_word()}
              </>
            ),
          }}
        />
      }
      lead={m.learn_more()}
    >
      <ol className="grid gap-m">
        {LEVELS.map((level) => (
          <Guide key={level} level={level} />
        ))}
      </ol>
      <a href={localizeHref(GLOSSARY_PATH)} className={cn(card, "focus-ring group/open")}>
        <div className="grid gap-xs">
          <h2 className="flex items-center gap-xs text-l font-medium">
            {m.learn_glossary_title()}
            <ArrowRightIcon
              aria-hidden
              className="size-4 transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
            />
          </h2>
          <p className="text-neutral-7">{m.learn_glossary_lead()}</p>
        </div>
      </a>
    </LearnFrame>
  );
}
