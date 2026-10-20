import type { GuideLineName, GuideQuestion } from "@repo/client/guides/types";
import type { Contribution, Guide, Rank } from "@repo/client/viewer/types";

import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { fieldOf, type ListedField, wordsText } from "./characteristic-words";

// The words of a guide that accounts write (decision 041), as the web's
// `apps/web/src/components/guides/guide-words.ts` and `contributions-panel.tsx` say them: its
// lines of text, its three questions, the ranks, and what became of a contribution. A module
// that draws nothing, so that a test reads it.

// The lines of a guide that are short texts, with how each reads and what its field suggests.
export type TextLineName = Exclude<GuideLineName, ListedField>;

export const TEXT_LINES: Record<TextLineName, { label: () => string; placeholder: () => string }> =
  {
    access: { label: m.guide_line_access, placeholder: m.guide_access_placeholder },
    entry: { label: m.guide_line_entry, placeholder: m.guide_entry_placeholder },
    hazards: { label: m.guide_line_hazards, placeholder: m.guide_hazards_placeholder },
    rules: { label: m.guide_line_rules, placeholder: m.guide_rules_placeholder },
    sizeNotes: { label: m.guide_line_size_notes, placeholder: m.guide_size_notes_placeholder },
  };

export const isTextLine = (line: string): line is TextLineName => line in TEXT_LINES;

// A text of a guide as the API takes it. Why the waves run bigger or smaller than the forecast
// is one sentence: decision 062.
export const TEXT_LEAST = 3;
export const TEXT_MOST = 500;
export const SIZE_NOTES_MOST = 140;
export const textMostOf = (line: TextLineName) =>
  line === "sizeNotes" ? SIZE_NOTES_MOST : TEXT_MOST;
// A reason as the API takes it.
export const REASON_MOST = 280;

/** A text as it is sent: on one line, its spaces as one. */
export const saidOf = (text: string) => text.replace(/\s+/g, " ").trim();

/** Whether a text may be sent for a line: long enough, and not what the line says already. */
export function isSendableText(text: string, saved: string) {
  const said = saidOf(text);
  return said.length >= TEXT_LEAST && said !== saved;
}

/** Whether a list of words may be sent for a line: one word at least, and not what it says. */
export function isSendableWords(pressed: readonly string[], saved: readonly string[]) {
  const isSame = pressed.length === saved.length && pressed.every((word) => saved.includes(word));
  return pressed.length > 0 && !isSame;
}

// The three questions of a guide, with the answers each takes and how they read. An answer the
// API gains has to be given its reading here: until then it reads as the API names it.
export const QUESTIONS: Record<
  GuideQuestion,
  { label: () => string; answers: Record<string, () => string> }
> = {
  crowd: {
    label: m.guide_question_crowd,
    answers: {
      quiet: m.guide_crowd_quiet,
      shared: m.guide_crowd_shared,
      busy: m.guide_crowd_busy,
      packed: m.guide_crowd_packed,
    },
  },
  locals: {
    label: m.guide_question_locals,
    answers: {
      friendly: m.guide_locals_friendly,
      reserved: m.guide_locals_reserved,
      heavy: m.guide_locals_heavy,
    },
  },
  level: {
    label: m.guide_question_level,
    answers: {
      beginner: m.break_level_beginner,
      intermediate: m.break_level_intermediate,
      advanced: m.break_level_advanced,
      pro: m.break_level_pro,
    },
  },
};

/** How an answer reads, in the reader's language. */
export function readAnswer(question: GuideQuestion, answer: string) {
  return QUESTIONS[question].answers[answer]?.() ?? answer;
}

/**
 * How the answers to a question spread, said under it: how many answered and, once enough did,
 * how many gave each answer; before then, what the list the break came from says, if it says
 * anything.
 */
export function spreadText(spread: Guide["answers"][number], listed?: string) {
  const { question, total, counts } = spread;
  if (counts) {
    const shares = Object.keys(QUESTIONS[question].answers).flatMap((answer) => {
      const count = counts[answer] ?? 0;
      return count > 0
        ? [m.guide_answer_share({ answer: readAnswer(question, answer), count })]
        : [];
    });
    return [m.guide_answers_some({ count: total }), ...shares].join(" · ");
  }
  if (total === 0) return listed ?? m.guide_answers_none();
  return total === 1 ? m.guide_answers_one() : m.guide_answers_few({ count: total });
}

/** The answer an account gives once it pressed one: none when it pressed the one it had. */
export const answerAfter = (mine: string | undefined, pressed: string) =>
  mine === pressed ? null : pressed;

// A rank as it is written on a badge, and its name in full: those of surfing's tours.
export const RANKS: Record<Rank, { short: () => string; name: () => string }> = {
  qs: { short: m.rank_qs, name: m.rank_qs_name },
  cs: { short: m.rank_cs, name: m.rank_cs_name },
  ct: { short: m.rank_ct, name: m.rank_ct_name },
};

type Language = NonNullable<Guide["lines"][number]["language"]>;

const WRITTEN_IN = {
  en: m.guide_written_en,
  fr: m.guide_written_fr,
  es: m.guide_written_es,
  pt: m.guide_written_pt,
} satisfies Record<Language, () => string>;

/** The language a text was written in, said to a reader of another; nothing to a reader of it. */
export function writtenIn(language: Language | null) {
  return language && language !== getLocale() ? WRITTEN_IN[language]() : undefined;
}

/** How an author reads: `@name`, or a contributor's for one that is gone, nameless or blocked. */
export const authorName = (by: { username: string } | null) =>
  by ? `@${by.username}` : m.guide_by_nobody();

/**
 * What a reader says of a line someone else wrote: the author's own lines open no menu, and a
 * line whose author is gone, nameless or blocked has nobody to block. Decision 071.
 */
export const mayBlockAuthor = (by: { username: string } | null, own: string | null | undefined) =>
  by !== null && (own == null || by.username !== own);

// What became of a contribution, as its author reads it, and the tone that says so beside the
// words.
export type ContributionTone = "neutral" | "success" | "warning" | "error";
export const STATES: Record<
  Contribution["status"],
  { label: () => string; tone: ContributionTone }
> = {
  pending: { label: m.contribution_pending, tone: "warning" },
  shown: { label: m.contribution_shown, tone: "warning" },
  confirmed: { label: m.contribution_confirmed, tone: "success" },
  refused: { label: m.contribution_refused, tone: "error" },
  superseded: { label: m.contribution_superseded, tone: "neutral" },
  withdrawn: { label: m.contribution_withdrawn, tone: "neutral" },
};

/**
 * A number of points, as it is written. Each language says which numbers are one: French says
 * it of none as well.
 */
export function points(count: number) {
  return new Intl.PluralRules(getLocale()).select(count) === "one"
    ? m.contributions_point_one({ count })
    : m.contributions_points({ count });
}

/** The line a contribution is of, and what it says, as they read. */
export function readContribution(one: { line: string; value: string[] | string | null }) {
  if (one.line === "place") return { label: m.contribution_place(), value: null };
  if (isTextLine(one.line)) {
    return {
      label: TEXT_LINES[one.line].label(),
      value: typeof one.value === "string" ? one.value : null,
    };
  }
  const field = fieldOf(one.line);
  return {
    label: field?.label() ?? one.line,
    value: field && Array.isArray(one.value) ? wordsText(field.key, one.value) : null,
  };
}

/** How far an account stands from its next rank: a share from 0 to 1, and the points it lacks. */
export function progressOf(score: number, next: { from: number } | null) {
  if (!next || next.from <= 0) return null;
  return {
    share: Math.min(1, Math.max(0, score / next.from)),
    lacking: Math.max(0, next.from - score),
  };
}
