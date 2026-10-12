import { m } from "@/paraglide/messages.js";

import type { ListedField } from "../viewer/break-characteristics";
import type { Guide, Rank } from "../viewer/types";
import type { GuideLineName, GuideQuestion } from "./types";

// The lines of a guide that are short texts, with how each reads and what its field suggests.
export type TextLineName = Exclude<GuideLineName, ListedField>;

export const TEXT_LINES: Record<TextLineName, { label: () => string; placeholder: () => string }> =
  {
    access: { label: m.guide_line_access, placeholder: m.guide_access_placeholder },
    entry: { label: m.guide_line_entry, placeholder: m.guide_entry_placeholder },
    hazards: { label: m.guide_line_hazards, placeholder: m.guide_hazards_placeholder },
    rules: { label: m.guide_line_rules, placeholder: m.guide_rules_placeholder },
  };

export const isTextLine = (line: GuideLineName): line is TextLineName => line in TEXT_LINES;

// A text of a guide as the API takes it.
export const TEXT_LEAST = 3;
export const TEXT_MOST = 500;
// A reason as the API takes it.
export const REASON_MOST = 280;

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

// A rank as it is written on a badge, and its name in full: those of surfing's tours.
export const RANKS: Record<Rank, { short: () => string; name: () => string }> = {
  qs: { short: m.rank_qs, name: m.rank_qs_name },
  cs: { short: m.rank_cs, name: m.rank_cs_name },
  ct: { short: m.rank_ct, name: m.rank_ct_name },
};

/** The language a text was written in, said to a reader of another. */
export function writtenIn(language: NonNullable<Guide["lines"][number]["language"]>) {
  return language === "fr" ? m.guide_written_fr() : m.guide_written_en();
}
