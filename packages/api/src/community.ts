import {
  type CONTRIBUTION_LINES,
  GUIDE_TEXT_LINES,
  GUIDE_WORD_LINES,
  RANKS,
} from "@repo/db/schema/community";
import {
  BOARD_TYPES,
  BOTTOM_TYPES,
  BREAK_TYPES,
  COMPASS_POINTS,
  SEASONS,
  TIDE_STAGES,
  WAVE_DIRECTIONS,
} from "@repo/db/schema/spots";

// The rules of what accounts write of a break, as functions that read no clock and no database:
// decision 041. The procedures read and write, and ask these.

export type ContributionLine = (typeof CONTRIBUTION_LINES)[number];
export type WordLine = (typeof GUIDE_WORD_LINES)[number];
export type TextLine = (typeof GUIDE_TEXT_LINES)[number];
/** A line an account may propose: every line but the break itself. */
export type GuideLine = WordLine | TextLine;
export type Rank = (typeof RANKS)[number];

/** The words each line of words is said in: those of the catalogue's column of the same name. */
export const LINE_WORDS = {
  breakTypes: BREAK_TYPES,
  waveDirections: WAVE_DIRECTIONS,
  bottomTypes: BOTTOM_TYPES,
  boardTypes: BOARD_TYPES,
  bestSeasons: SEASONS,
  bestTides: TIDE_STAGES,
  bestSwellDirections: COMPASS_POINTS,
  bestWindDirections: COMPASS_POINTS,
} as const satisfies Record<WordLine, readonly string[]>;

export const isWordLine = (line: string): line is WordLine =>
  (GUIDE_WORD_LINES as readonly string[]).includes(line);
export const isTextLine = (line: string): line is TextLine =>
  (GUIDE_TEXT_LINES as readonly string[]).includes(line);

// A text of a guide is short: a few sentences that a reader takes in at the car park.
export const TEXT_LEAST = 3;
export const TEXT_MOST = 500;

/**
 * A list of words as it is kept: each word once, in the order of its vocabulary, whatever order
 * and however often it was given. Null when nothing of it is a word of the line.
 */
export function keptWords(line: WordLine, given: readonly string[]): string[] | null {
  const words: readonly string[] = LINE_WORDS[line];
  const kept = words.filter((word) => given.includes(word));
  return kept.length > 0 ? kept : null;
}

/** A text as it is kept: on one line, with one space between its words. */
export function keptText(given: string) {
  return given.replace(/\s+/g, " ").trim();
}

/** Whether two values of a line say the same. A line that says nothing is null. */
export function sameValue(one: string[] | string | null, other: string[] | string | null) {
  if (one === null || other === null) return one === other;
  if (typeof one === "string" || typeof other === "string") return one === other;
  return one.length === other.length && one.every((word, index) => word === other[index]);
}

// What a confirmed contribution counts for. A text takes more to write than a list of words,
// and a break added to the catalogue more than either. An account that brought another, which
// then contributed, is counted that too.
export const POINTS = { words: 5, text: 10, place: 20, sponsorship: 15 } as const;

export function pointsOf(line: ContributionLine) {
  if (line === "place") return POINTS.place;
  return isTextLine(line) ? POINTS.text : POINTS.words;
}

// The score each rank is reached at. A break described whole, its eight lines of words and its
// four texts, is 80 points: the first rank is a few lines, the last several breaks.
export const RANK_FROM: Record<Rank, number> = { qs: 20, cs: 150, ct: 600 };

/** The ranks a score has reached, from the first. */
export function ranksAt(score: number): Rank[] {
  return RANKS.filter((rank) => score >= RANK_FROM[rank]);
}

/** The higher of two ranks. Null is no rank. */
export function higherRank(one: Rank | null, other: Rank | null): Rank | null {
  if (one === null || other === null) return one ?? other;
  return RANKS.indexOf(one) >= RANKS.indexOf(other) ? one : other;
}

/** The rank after one, and the score it is reached at. Null after the last. */
export function nextRank(rank: Rank | null) {
  const next = RANKS[rank === null ? 0 : RANKS.indexOf(rank) + 1];
  return next ? { rank: next, from: RANK_FROM[next] } : null;
}

// How many of an account's contributions must be confirmed before its lists of words show at
// once, as waiting to be confirmed. An operator read every one of those: nothing shows of an
// account before.
export const TRUSTED_FROM = 3;
// How many accounts that keep a break must say that a contribution is right for it to be
// confirmed without an operator.
export const CONFIRMATIONS_NEEDED = 2;
// How many accounts must have answered a question before the guide shows how they spread:
// fewer, and a spread would be one account's word.
export const ANSWERS_SHOWN_FROM = 3;
// The contributions an account may have waiting, and what it may send in a day.
export const WAITING_MOST = 30;
export const PROPOSALS_A_DAY = 60;
export const CONTESTS_A_DAY = 20;
// How many contributions a line shows as waiting to be confirmed, the latest first.
export const SHOWN_MOST = 3;

/**
 * Whether an account may say that a contribution of another is right. It keeps the break, its
 * address is checked where the instance checks addresses, and one of its own contributions was
 * confirmed: an account made to confirm another's has first to be read by an operator itself.
 */
export function mayConfirm(
  checksAddresses: boolean,
  account: { keeps: boolean; emailVerified: boolean; confirmed: number },
) {
  return account.keeps && account.confirmed > 0 && (!checksAddresses || account.emailVerified);
}
