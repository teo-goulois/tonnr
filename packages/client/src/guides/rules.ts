// What a line of a guide and the reason of a contest take, on the web and on a phone alike: how
// long a text may be, as the API takes it, and why what was written cannot be sent yet, in the
// words each app gives. Decisions 041 and 062.

/** The fewest characters a text of a guide, or the reason of a contest, says. */
export const TEXT_LEAST = 3;
/** The most characters a text of a guide says. */
export const TEXT_MOST = 500;
/** Why the waves run bigger or smaller than the forecast is one sentence: decision 062. */
export const SIZE_NOTES_MOST = 140;
/** The most characters the text of a line says. */
export const textMostOf = (line: string) => (line === "sizeNotes" ? SIZE_NOTES_MOST : TEXT_MOST);
/** The most characters the reason of a contest says. */
export const REASON_MOST = 280;

/** A text as it is sent: on one line, its spaces as one. */
export const saidOf = (text: string) => text.replace(/\s+/g, " ").trim();

/** Why what was written cannot be sent, in the reader's language: each app gives its messages. */
export type GuideFaults = {
  /** Too short: fewer than `TEXT_LEAST` characters. */
  tooShort: () => string;
  /** What the line says already. */
  same: () => string;
  /** No word pressed. */
  wordsNone: () => string;
};

/**
 * Why a text cannot be sent for a line, said under its field once it is sent: too short, or what
 * the line says already. Nothing once it can be sent.
 */
export function textFault(text: string, saved: string, faults: Omit<GuideFaults, "wordsNone">) {
  const said = saidOf(text);
  if (said.length < TEXT_LEAST) return faults.tooShort();
  return said === saved ? faults.same() : undefined;
}

/** Whether two lists say the same words, in whatever order. */
export const sameWords = (one: readonly string[], other: readonly string[]) =>
  one.length === other.length && one.every((word) => other.includes(word));

/**
 * Why a list of words cannot be sent for a line: no word pressed, or the words the line says
 * already, in whatever order. Nothing once it can be sent.
 */
export function wordsFault(
  pressed: readonly string[],
  saved: readonly string[],
  faults: Omit<GuideFaults, "tooShort">,
) {
  if (pressed.length === 0) return faults.wordsNone();
  return sameWords(pressed, saved) ? faults.same() : undefined;
}

/** Why the reason of a contest cannot be sent: too short. Nothing once it can be sent. */
export const reasonFault = (reason: string, faults: Pick<GuideFaults, "tooShort">) =>
  reason.trim().length < TEXT_LEAST ? faults.tooShort() : undefined;
