import { ArrowRightIcon, BookBookmarkFillDuoIcon, ChatFillDuoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { Tile, Woven, arrive, order, useArriving } from "@/components/landing/landing-parts";
import { GLOSSARY_PATH, LESSONS, LEVELS, type Level, guidePath, lessonHref } from "@/lib/learn";
import { WAVE_HEIGHT_SCALE, WAVE_PERIOD_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

import { LearnFrame } from "./learn-frame";
import { GUIDE_LEADS, GUIDE_TITLES, LESSON_HEADS, LEVEL_NAMES } from "./lessons";
import { Prose } from "./prose";

// The page that leads to the three guides and to the glossary: each level with its lessons
// named, so that a reader picks theirs. Each card arrives as the landing's parts do. Decision 060.

export const LEARN_COLOR = scaleColor(WAVE_PERIOD_SCALE, 10);
const GLOSSARY_COLOR = scaleColor(WAVE_HEIGHT_SCALE, 0.5);

const card = "group/arrival grid content-start gap-m rounded-(--radius-s) bg-neutral-2 p-m sm:p-l";

const nudge =
  "transition-[translate] duration-(--motion-duration) ease-theme motion-reduce:transition-none";

function Guide({ level }: { level: Level }) {
  const arriving = useArriving<HTMLLIElement>();
  const heads = LESSON_HEADS[level] as Record<string, { title: () => string; color: string }>;
  return (
    <li {...arriving} className={card}>
      <div className={cn(arrive, "grid gap-xs")} style={order(0)}>
        <span className="text-s font-medium text-neutral-7">{LEVEL_NAMES[level]()}</span>
        <h2 className="text-l font-medium text-balance">{GUIDE_TITLES[level]()}</h2>
        <Prose text={GUIDE_LEADS[level]()} />
      </div>
      <ol className={cn(arrive, "grid text-s")} style={order(1)}>
        {LESSONS[level].map((lesson, index) => (
          <li key={lesson}>
            <a
              href={lessonHref(level, lesson)}
              className="group/lively focus-ring -mx-xs flex items-center gap-s rounded-xs px-xs py-xxs decoration-neutral-5 underline-offset-4 hover:underline"
            >
              <Tile
                color={heads[lesson]!.color}
                className="mr-0 shrink-0 rounded-[0.35rem] [--tile:--spacing(5)]"
              >
                <span className="text-[0.6rem] font-bold">{index + 1}</span>
              </Tile>
              {heads[lesson]!.title()}
            </a>
          </li>
        ))}
      </ol>
      <a
        href={localizeHref(guidePath(level))}
        className={cn(
          arrive,
          "focus-ring group/open inline-flex items-center gap-xxs self-start rounded-xs font-medium",
        )}
        style={order(2)}
      >
        {m.learn_read_guide()}
        <ArrowRightIcon
          aria-hidden
          className={cn("size-4 group-hover/open:translate-x-0.5", nudge)}
        />
      </a>
    </li>
  );
}

function GlossaryCard() {
  const arriving = useArriving<HTMLAnchorElement>();
  return (
    <a
      {...arriving}
      href={localizeHref(GLOSSARY_PATH)}
      className={cn(card, "focus-ring group/lively")}
    >
      <div className={cn(arrive, "grid gap-xs")} style={order(0)}>
        <h2 className="text-l font-medium text-balance">
          <Tile color={GLOSSARY_COLOR}>
            <ChatFillDuoIcon />
          </Tile>
          {m.learn_glossary_title()}
          <ArrowRightIcon
            aria-hidden
            className={cn(
              "ml-xxs inline size-4 align-[-0.1em] group-hover/lively:translate-x-0.5",
              nudge,
            )}
          />
        </h2>
        <p className="text-neutral-7">{m.learn_glossary_lead()}</p>
      </div>
    </a>
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
      <GlossaryCard />
    </LearnFrame>
  );
}
