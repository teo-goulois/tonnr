import type { Session } from "../viewer/types";

// What a session is taken to be until its surfer says, and what it may be, on the web and on a
// phone alike: when one written now began, how long it lasted, how many days ago its day was,
// and the log month by month. Decision 043.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A session is written once it has begun: a clock that runs a little ahead is forgiven. */
export const AHEAD_MS = 15 * MINUTE_MS;

/** Whether a session would begin later than it may be written. */
export const isAhead = (startedAt: Date, now: number) => startedAt.getTime() > now + AHEAD_MS;

/** How long a session is taken to last until its surfer says. */
export const USUAL_MINUTES = 90;
/** What a session's length is chosen among at a press. */
export const USUAL_LENGTHS: readonly number[] = [30, 60, USUAL_MINUTES, 120, 180];
/** A length of one's own: from a quarter of an hour to eight hours, five minutes at a time. */
export const LEAST_MINUTES = 15;
export const MOST_MINUTES = 480;
export const STEP_MINUTES = 5;

/** A length of one's own, on the five minutes nearest and within what is taken. */
export const withinLengths = (minutes: number) =>
  Math.min(
    MOST_MINUTES,
    Math.max(LEAST_MINUTES, Math.round(minutes / STEP_MINUTES) * STEP_MINUTES),
  );

/**
 * When a session that is written now is taken to have begun: as long ago as it usually lasts,
 * on a round five minutes. It is nearly always written on the way out of the water.
 */
export function usualStart(now: number) {
  const step = 5 * MINUTE_MS;
  return new Date(Math.floor((now - USUAL_MINUTES * MINUTE_MS) / step) * step);
}

/**
 * How many days before `now` a day is, by the calendar of the device's clock and whatever the
 * hours: 0 today, 1 yesterday, which a day is said as beside its hour.
 */
export function daysBefore(day: Date, now: number) {
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((midnight(new Date(now)).getTime() - midnight(day).getTime()) / DAY_MS);
}

/** The sessions of a month, the latest first, as the list gives them. */
export type Month<Item = Session> = { name: string; sessions: Item[] };

/**
 * The sessions month by month, the latest month first, from a list the latest first: `monthOf`
 * names the month of a moment, in the reader's language.
 */
export function byMonth<Item extends Pick<Session, "startedAt">>(
  sessions: readonly Item[],
  monthOf: (date: Date) => string,
): Month<Item>[] {
  const months: Month<Item>[] = [];
  for (const session of sessions) {
    const name = monthOf(session.startedAt);
    const last = months.at(-1);
    if (last?.name === name) last.sessions.push(session);
    else months.push({ name, sessions: [session] });
  }
  return months;
}
