import type { Density } from "@repo/client/density";
import type { ProfileAnswers, SurferProfile } from "@repo/client/viewer/types";

// What the onboarding and the account's answers run on, as functions that read no React and no
// phone, so that a test reads them: decision 063.

export type Level = NonNullable<ProfileAnswers["level"]>;
export type Reading = NonNullable<ProfileAnswers["reading"]>;
export type Board = NonNullable<ProfileAnswers["boards"]>[number];
export type SurfSize = NonNullable<ProfileAnswers["smallestWave"]>;

export const LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const satisfies Level[];
export const READINGS = ["glance", "basics", "everything"] as const satisfies Reading[];
// The boards a surfer is asked about: those of the catalogue one rides in the waves of a break.
// A kite, a tow or a skimboard is for another question.
export const ASKED_BOARDS = [
  "shortboard",
  "fish",
  "funboard",
  "longboard",
  "gun",
  "bodyboard",
  "bodysurf",
  "foil",
  "sup",
] as const satisfies Board[];

/** How much of the forecast a panel shows for what a surfer said of their reading. */
export const DENSITY_OF: Record<Reading, Density> = {
  glance: "essentials",
  basics: "details",
  everything: "everything",
};

export const NO_ANSWERS: ProfileAnswers = {
  level: null,
  smallestWave: null,
  biggestWave: null,
  reading: null,
  boards: null,
};

/** The answers a profile holds, to change them. */
export function answersOf(profile: SurferProfile | null | undefined): ProfileAnswers {
  if (!profile) return NO_ANSWERS;
  const { level, smallestWave, biggestWave, reading, boards } = profile;
  return { level, smallestWave, biggestWave, reading, boards };
}

/**
 * The waves after a press on a size: a first press says the smallest, a second the biggest, if
 * it is no smaller, and a press after that, or on a smaller size, begins again.
 */
export function pickWave(
  sizes: readonly SurfSize[],
  { smallest, biggest }: { smallest: SurfSize | null; biggest: SurfSize | null },
  pressed: SurfSize,
): { smallest: SurfSize | null; biggest: SurfSize | null } {
  const rank = (size: SurfSize) => sizes.indexOf(size);
  if (smallest !== null && biggest === null && rank(pressed) >= rank(smallest)) {
    return { smallest, biggest: pressed };
  }
  return { smallest: pressed, biggest: null };
}

/** The boards after a press on one: it is added, or taken out, and none is null. */
export function toggleBoard(boards: Board[] | null, board: Board): Board[] | null {
  const now = boards ?? [];
  const next = now.includes(board) ? now.filter((one) => one !== board) : [...now, board];
  return next.length > 0 ? next : null;
}

export type Step = "welcome" | "username" | "level" | "waves" | "reading" | "boards";

/** The questions, one a step, with a username first for an account that has none. */
export function stepsOf(asksName: boolean): Exclude<Step, "welcome">[] {
  return [...(asksName ? (["username"] as const) : []), "level", "waves", "reading", "boards"];
}

/** Whether a step was answered, which its button then says by going on rather than skipping. */
export function hasAnswer(step: Step, answers: ProfileAnswers, username: string | null) {
  switch (step) {
    case "username":
      return Boolean(username);
    case "level":
      return answers.level !== null;
    case "waves":
      return answers.biggestWave !== null;
    case "reading":
      return answers.reading !== null;
    default:
      return false;
  }
}

/**
 * Whether a path of the app is a tab's own screen, with nothing over it: the onboarding opens
 * there alone, and waits while a sheet stands over the tabs, as the web's waits for a dialog.
 */
export function isTabPath(path: string) {
  return path === "/" || /^\/(saved|alerts|account)(\/|$)/.test(path);
}
