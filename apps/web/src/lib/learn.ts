import { localizeHref } from "@/paraglide/runtime.js";

// The guides that teach how to read a surf forecast, and their glossary: three levels of five
// lessons each, every lesson reached by its own anchor, every technical word a link to its entry
// of the glossary. Decision 060. This file knows the addresses and the words; the components
// in `components/learn/` draw them.

export const LEARN_ROOT = "/learn";
export const GLOSSARY_PATH = `${LEARN_ROOT}/glossary`;

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

/** The lessons of each guide, in their order: the id of each is its anchor on the page. */
export const LESSONS = {
  beginner: ["height", "period", "swell", "wind", "tide"],
  intermediate: ["swell-and-wind-sea", "energy", "fetch", "week", "neighbours"],
  advanced: ["models", "buoys", "secondary", "shadow", "alert"],
} as const satisfies Record<Level, readonly string[]>;
export type LessonOf<L extends Level> = (typeof LESSONS)[L][number];

/** The path of a guide, before its language. */
export function guidePath(level: Level) {
  return `${LEARN_ROOT}/${level}` as const;
}

/** A lesson's address in the reader's language, for a plain link: `/fr/learn/beginner#period`. */
export function lessonHref<L extends Level>(level: L, lesson: LessonOf<L>) {
  return `${localizeHref(guidePath(level))}#${lesson}`;
}

/**
 * The words of the glossary, by the id each entry answers to. A lesson names a word with
 * `[word](id)` in its message, which `Prose` turns into a `Term`; an id that is not here is left
 * as it was written.
 */
export const TERMS = [
  "swell",
  "wind-sea",
  "period",
  "set",
  "chop",
  "buoy",
  "model",
  "window",
  "sector",
  "offshore",
  "onshore",
  "side-shore",
  "knot",
  "tide",
  "high-water",
  "low-water",
  "mid-tide",
  "rising",
  "falling",
  "spring-tides",
  "reef",
  "beach-break",
  "point-break",
  "take-off",
  "fetch",
  "energy",
  "resolution",
  "run",
  "secondary-swell",
  "shadowing",
  "refraction",
  "exposure",
  "significant-height",
  "lineup",
] as const;
export type Term = (typeof TERMS)[number];

export const isTerm = (value: string): value is Term =>
  (TERMS as readonly string[]).includes(value);

/** A glossary entry's address in the reader's language, for a plain link. */
export function termHref(term: Term) {
  return `${localizeHref(GLOSSARY_PATH)}#${term}`;
}

/**
 * A piece of a paragraph of a guide: its words, a few set in the darker type with `**`, and a
 * technical word that leads to the glossary, written `[word](id)`.
 */
export type ProsePiece =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "term"; term: Term; text: string };

const MARKS = /\[([^\]]+)\]\(([a-z-]+)\)|\*\*([^*]+)\*\*/g;

/** Reads a paragraph as its message writes it. A word marked with an id that is no term stays as text. */
export function parseProse(text: string): ProsePiece[] {
  const pieces: ProsePiece[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKS)) {
    if (match.index > last) pieces.push({ kind: "text", text: text.slice(last, match.index) });
    const [whole, word, id, strong] = match;
    if (strong !== undefined) pieces.push({ kind: "strong", text: strong });
    else if (id !== undefined && isTerm(id)) pieces.push({ kind: "term", term: id, text: word! });
    else pieces.push({ kind: "text", text: word ?? whole });
    last = match.index + whole.length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}
