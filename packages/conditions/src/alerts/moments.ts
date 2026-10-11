import { addDays, localTime, momentOf } from "./clock";
import { LOOKS_TO_TELL } from "./look";
import type { Interval } from "./open";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// A look older than this no longer says that a window is there.
export const LOOK_GOOD_HOURS = 6;
// Open hours with less than this left are not worth saying that they begin.
export const WORTH_MINUTES = 30;

/** A window as the lighter pass reads it, between two looks. */
export type Watched = {
  id: string;
  spotId: string;
  sea: Interval;
  seen: number;
  missed: number;
  // When a fresh forecast was last read for its spot.
  lookedAt: Date;
  // The end of the open hours that were last said to begin. Null while none were.
  begunUntil: Date | null;
};

type OpenOf = (spotId: string, sea: Interval) => Interval[];

// Whether the last look found the window, and is recent enough to be believed.
function stands(window: Watched, now: Date) {
  return (
    window.seen >= 1 &&
    window.missed === 0 &&
    now.getTime() - window.lookedAt.getTime() <= LOOK_GOOD_HOURS * HOUR_MS
  );
}

/**
 * The open hours that begin: for each window, the piece to say "it is on" of, if there is one.
 * A piece is said once. It is said ahead by the notice the account asked for, and no longer once
 * little of it is left. The window need not have been told before.
 */
export function beginnings(
  now: Date,
  windows: Watched[],
  context: { open: OpenOf; noticeMinutes: number },
) {
  const due: { windowId: string; spotId: string; piece: Interval }[] = [];
  for (const window of windows) {
    if (!stands(window, now)) continue;
    for (const piece of context.open(window.spotId, window.sea)) {
      // Said already, with the piece it was said of or as a part of it.
      if (window.begunUntil && piece.start.getTime() < window.begunUntil.getTime()) continue;
      if (piece.start.getTime() - context.noticeMinutes * MINUTE_MS > now.getTime()) break;
      if (piece.end.getTime() - WORTH_MINUTES * MINUTE_MS <= now.getTime()) continue;
      due.push({ windowId: window.id, spotId: window.spotId, piece });
      break;
    }
  }
  return due;
}

/**
 * The day an evening message is due for, at a moment: the next day, from the account's evening
 * hour until midnight. Null before that hour, and once the message for that day was made:
 * `lastFor` is the day of the last one.
 */
export function eveningFor(
  now: Date,
  settings: { zone: string; eveningMinutes: number },
  lastFor: string | null,
) {
  const local = localTime(now, settings.zone);
  if (local.minutes < settings.eveningMinutes) return null;
  const day = addDays(local.date, 1);
  return lastFor !== null && lastFor >= day ? null : day;
}

/**
 * The open hours of a day, window by window, for the evening before: those of the windows that
 * two looks have found and that the last one still did. A piece that runs across midnight
 * belongs to both days.
 */
export function hoursOfDay(day: string, zone: string, now: Date, windows: Watched[], open: OpenOf) {
  const from = momentOf(day, 0, zone).getTime();
  const to = momentOf(addDays(day, 1), 0, zone).getTime();
  return windows
    .filter((window) => stands(window, now) && window.seen >= LOOKS_TO_TELL)
    .map((window) => ({
      windowId: window.id,
      spotId: window.spotId,
      pieces: open(window.spotId, window.sea).filter(
        (piece) => piece.start.getTime() < to && piece.end.getTime() > from,
      ),
    }))
    .filter((listed) => listed.pieces.length > 0);
}

/** The hours in which an account is sent nothing, on its own clock. They may run past midnight. */
export type QuietHours = { zone: string; from: number; to: number };

/**
 * When a message made at a moment may leave: at once, or at the end of the quiet hours the
 * moment falls in.
 */
export function leavesAt(now: Date, quiet: QuietHours | null) {
  if (!quiet || quiet.from === quiet.to) return now;
  const local = localTime(now, quiet.zone);
  const pastMidnight = quiet.from > quiet.to;
  const isQuiet = pastMidnight
    ? local.minutes >= quiet.from || local.minutes < quiet.to
    : local.minutes >= quiet.from && local.minutes < quiet.to;
  if (!isQuiet) return now;
  // They end today, unless they began this evening and run into tomorrow.
  const endsTomorrow = pastMidnight && local.minutes >= quiet.from;
  return momentOf(endsTomorrow ? addDays(local.date, 1) : local.date, quiet.to, quiet.zone);
}
