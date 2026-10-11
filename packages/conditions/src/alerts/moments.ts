import { addDays, localTime, momentOf } from "./clock";
import { LOOKS_TO_TELL, type SeaWindow, type ToldPiece, WORTH_MINUTES } from "./look";
import type { Interval } from "./open";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MINUTES = 24 * 60;
// Clocks are set forward and back on a quarter of an hour of UTC, and no zone is off it by less.
const QUARTER_MS = 15 * MINUTE_MS;

// A look older than this no longer says that a window is there.
export const LOOK_GOOD_HOURS = 6;

/** A spot of an alert as the lighter pass reads it, between two looks. */
export type Watched = {
  spotId: string;
  // Its sea windows and the hours told of it, as the last look left them.
  windows: SeaWindow[];
  told: ToldPiece[];
  // When a fresh forecast was last read for it. Null while none was.
  lookedAt: Date | null;
  // The open hours that were said to begin, and are not over.
  begun: Interval[];
};

type OpenOf = (spotId: string, sea: Interval) => Interval[];

const byStart = (one: Interval, other: Interval) => one.start.getTime() - other.start.getTime();
const overlaps = (one: Interval, other: Interval) =>
  one.start.getTime() < other.end.getTime() && one.end.getTime() > other.start.getTime();

// Whether the last look at a spot is recent enough for what it found to be believed. A look
// that the clock says is still to come is not.
export function isFresh(spot: Pick<Watched, "lookedAt">, now: Date) {
  if (!spot.lookedAt) return false;
  const age = now.getTime() - spot.lookedAt.getTime();
  return age >= 0 && age <= LOOK_GOOD_HOURS * HOUR_MS;
}

/**
 * The day up to the end of which windows are told, as a moment: today on the account's
 * calendar, and so many days after it. A day is the account's, whatever its length.
 */
export function tellUntil(now: Date, zone: string, horizonDays: number) {
  return momentOf(addDays(localTime(now, zone).date, horizonDays + 1), 0, zone);
}

/**
 * The open hours that begin: for each spot, the piece to say "it is on" of, if there is one.
 * A piece is said once. It is said ahead by the notice the account asked for, and no longer
 * once little of it is left. Its window need not have been told before: the last look found it.
 */
export function beginnings(
  now: Date,
  spots: Watched[],
  context: { open: OpenOf; noticeMinutes: number },
) {
  const due: { spotId: string; piece: Interval }[] = [];
  for (const spot of spots) {
    if (!isFresh(spot, now)) continue;
    const pieces = spot.windows
      .flatMap((window) => context.open(spot.spotId, window.sea))
      .sort(byStart);
    for (const piece of pieces) {
      // Said already, of these hours or of hours they were a part of.
      if (spot.begun.some((said) => overlaps(piece, said))) continue;
      if (piece.start.getTime() - context.noticeMinutes * MINUTE_MS > now.getTime()) break;
      if (piece.end.getTime() - WORTH_MINUTES * MINUTE_MS <= now.getTime()) continue;
      due.push({ spotId: spot.spotId, piece });
      break;
    }
  }
  return due;
}

/**
 * The day an evening message is due for, at a moment: the next day, from the account's evening
 * hour until midnight. Null before that hour, and once that day was listed.
 *
 * `listedUntil` is the end of the day the last evening message listed. A day of which half or
 * more lies before it is the same day, told on another clock: an account that changes its time
 * zone is not sent an evening twice.
 */
export function eveningFor(
  now: Date,
  settings: { zone: string; eveningMinutes: number },
  listedUntil: Date | null,
) {
  const local = localTime(now, settings.zone);
  if (local.minutes < settings.eveningMinutes) return null;
  const day = addDays(local.date, 1);
  if (listedUntil) {
    // Half of the day as long as it is: twenty-five hours when the clock is set back in it.
    const whole = dayOf(day, settings.zone);
    const half = (whole.end.getTime() - whole.start.getTime()) / 2;
    if (whole.start.getTime() + half <= listedUntil.getTime()) return null;
  }
  return day;
}

/** A day of an account, as the stretch of time it is. A day its clock skips is empty. */
export function dayOf(day: string, zone: string): Interval {
  return { start: momentOf(day, 0, zone), end: momentOf(addDays(day, 1), 0, zone) };
}

/**
 * The open hours of a day, spot by spot, for the evening before: those of the windows that two
 * looks have found, and those that were told and that the last look still found. A piece that
 * runs across midnight belongs to both days.
 */
export function hoursOfDay(day: string, zone: string, now: Date, spots: Watched[], open: OpenOf) {
  const whole = dayOf(day, zone);
  if (whole.end.getTime() <= whole.start.getTime()) return [];
  return spots
    .filter((spot) => isFresh(spot, now))
    .map((spot) => {
      // Where the told pieces that the last look found were then.
      const stands = spot.told
        .filter((piece) => piece.missed === 0)
        .map((piece) => piece.last ?? piece);
      const pieces = spot.windows
        .flatMap((window) =>
          open(spot.spotId, window.sea).filter(
            (piece) => window.seen >= LOOKS_TO_TELL || stands.some((told) => overlaps(piece, told)),
          ),
        )
        .filter((piece) => overlaps(piece, whole) && piece.end.getTime() > now.getTime())
        .sort(byStart);
      return { spotId: spot.spotId, pieces };
    })
    .filter((listed) => listed.pieces.length > 0);
}

/**
 * What is left of the hours a message spoke of, when it leaves later than it was written: the
 * open hours of the spot's windows, as the last look left them, that overlap those hours and
 * are not over. None when that look is too old to be believed.
 */
export function stillOpen(now: Date, spot: Watched, open: OpenOf, said: Interval[]) {
  if (!isFresh(spot, now)) return [];
  return spot.windows
    .flatMap((window) => open(spot.spotId, window.sea))
    .filter(
      (piece) => piece.end.getTime() > now.getTime() && said.some((one) => overlaps(piece, one)),
    )
    .sort(byStart);
}

/**
 * What is left of hours that were said to begin, when the message leaves later than it was
 * written. Of the hours that are still open: `due`, those that begin within the account's
 * notice, or have begun, and of which enough is left, and `later`, those that have become
 * later hours. These are not "on": they are said when they begin.
 */
export function rereadBeginning(
  now: Date,
  spot: Watched,
  open: OpenOf,
  said: Interval[],
  noticeMinutes: number,
) {
  const left = stillOpen(now, spot, open, said);
  const isLater = (piece: Interval) =>
    piece.start.getTime() - noticeMinutes * MINUTE_MS > now.getTime();
  return {
    due: left.filter(
      (piece) => !isLater(piece) && piece.end.getTime() - WORTH_MINUTES * MINUTE_MS > now.getTime(),
    ),
    later: left.filter(isLater),
  };
}

/** The hours in which an account is sent nothing, on its own clock. They may run past midnight. */
export type QuietHours = { zone: string; from: number; to: number };

/**
 * When a message made at a moment may leave: at once, or at the first moment from then on that
 * is outside the account's quiet hours. A clock that is set back makes them last longer, and
 * one that is set forward ends them sooner, or opens a gap in them: the moment is one the
 * clock really shows.
 */
export function leavesAt(now: Date, quiet: QuietHours | null) {
  if (!quiet || quiet.from === quiet.to) return now;
  const { zone, from, to } = quiet;
  const minutesAt = (moment: number) => localTime(new Date(moment), zone).minutes;
  const isQuiet = (minutes: number) =>
    from > to ? minutes >= from || minutes < to : minutes >= from && minutes < to;

  // From one quarter of an hour to the next, where a clock may have been set, or straight to
  // the end of the quiet hours when the clock shows it sooner. Two days is longer than any
  // quiet hours last.
  let moment = now.getTime();
  for (let turn = 0; turn < 2 * 24 * 4; turn += 1) {
    const minutes = minutesAt(moment);
    if (!isQuiet(minutes)) break;
    const untilEnd =
      ((to - minutes + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES) * MINUTE_MS -
      (moment % MINUTE_MS);
    const quarter = (Math.floor(moment / QUARTER_MS) + 1) * QUARTER_MS;
    moment = Math.min(moment + untilEnd, quarter);
  }
  return new Date(moment);
}
