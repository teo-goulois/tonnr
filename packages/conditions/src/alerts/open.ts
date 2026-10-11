import { sunAltitude } from "../sun";
import { localTime } from "./clock";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// Clocks are set forward and back on a quarter of an hour of UTC, and no zone is off it by less.
const QUARTER_MS = 15 * MINUTE_MS;
// Day, to a surfer, is from first light to last: the sun no more than this far under the
// horizon, which is when civil twilight begins and ends. About half an hour before sunrise
// and after sunset on most coasts.
const FIRST_LIGHT_DEGREES = -6;

/** A stretch of time, from its first moment to the moment it ends. */
export type Interval = { start: Date; end: Date };

/** Hours of a day, in minutes since midnight: from the first to the one they end at. */
export type DayHours = { from: number; to: number }[];

/** When an account can go: decision 031, "The settings of an account". */
export type Availability = {
  // The time zone its days and its hours are read in.
  zone: string;
  // Only the hours between first light and last at the spot.
  daylightOnly: boolean;
  // Its hours for each day of the week, Monday first. Null for any hour of any day. A day with
  // no hours is a day off.
  week: DayHours[] | null;
  // The account is away until then: no hour before it is open.
  awayUntil: Date | null;
};

/** An account that can go at any hour of the day and the night. */
export const ALWAYS: Availability = {
  zone: "UTC",
  daylightOnly: false,
  week: null,
  awayUntil: null,
};

// How long it is light between two moments, at most half an hour apart: the sun crosses first
// light once in that time at most, and the crossing is found to the second.
function lightBetween(from: number, to: number, isLight: (moment: number) => boolean) {
  const [atFirst, atLast] = [isLight(from), isLight(to)];
  if (atFirst === atLast) return atFirst ? to - from : 0;
  let [same, other] = [from, to];
  while (other - same > 1000) {
    const middle = (same + other) / 2;
    if (isLight(middle) === atFirst) same = middle;
    else other = middle;
  }
  return atFirst ? same - from : to - other;
}

// Whether most of the hour that begins at a moment is day, at a place. Near the poles first
// light and last can both fall within one hour, so its two halves are measured apart.
function isMostlyDay(hour: number, place: { latitude: number; longitude: number }) {
  const isLight = (moment: number) =>
    sunAltitude(moment, place.latitude, place.longitude) >= FIRST_LIGHT_DEGREES;
  const middle = hour + HOUR_MS / 2;
  const light = lightBetween(hour, middle, isLight) + lightBetween(middle, hour + HOUR_MS, isLight);
  return light > HOUR_MS / 2;
}

// Whether the account's hours cover the whole of the hour that begins at a moment. The hour is
// followed on the account's clock, from one of its ranges to the next and from one quarter of
// an hour to the next: an hour may begin on one day and end on another, in a zone that is half
// an hour from the forecast's, and a clock that is set forward within it may leave its hours.
function isWithinHours(hour: number, zone: string, week: DayHours[]) {
  const end = hour + HOUR_MS;
  let moment = hour;
  while (moment < end) {
    const local = localTime(new Date(moment), zone);
    const within = (week[local.weekday] ?? []).find(
      ({ from, to }) => local.minutes >= from && local.minutes < to,
    );
    if (!within) return false;
    // To the end of that range as time that passes, and no further than the next quarter,
    // where the clock is read again.
    const quarter = (Math.floor(moment / QUARTER_MS) + 1) * QUARTER_MS;
    moment = Math.min(moment + (within.to - local.minutes) * MINUTE_MS, quarter);
  }
  return true;
}

// Whether the hour that begins at a moment is one the account can use, at a place.
function isOpen(
  hour: number,
  place: { latitude: number; longitude: number },
  availability: Availability,
) {
  const { zone, daylightOnly, week, awayUntil } = availability;
  // Back within the hour, the account has not the whole of it: an hour is open whole.
  if (awayUntil && hour < awayUntil.getTime()) return false;
  if (daylightOnly && !isMostlyDay(hour, place)) return false;
  return !week || isWithinHours(hour, zone, week);
}

/**
 * The open hours of a sea window: the pieces of it an account can use, each at least as long as
 * the alert's shortest window. A sea window is a run of the forecast's hours, and so are its
 * pieces: an hour is open whole, or not at all.
 */
export function openHours(
  sea: Interval,
  place: { latitude: number; longitude: number },
  availability: Availability,
  shortestMinutes: number,
): Interval[] {
  const pieces: Interval[] = [];
  let from: number | undefined;
  const close = (end: number) => {
    if (from !== undefined && end - from >= shortestMinutes * MINUTE_MS) {
      pieces.push({ start: new Date(from), end: new Date(end) });
    }
    from = undefined;
  };

  for (let hour = sea.start.getTime(); hour + HOUR_MS <= sea.end.getTime(); hour += HOUR_MS) {
    if (isOpen(hour, place, availability)) from ??= hour;
    else close(hour);
  }
  // What is left of a sea window that is not a whole number of hours is not an hour.
  close(
    sea.start.getTime() + Math.floor((sea.end.getTime() - sea.start.getTime()) / HOUR_MS) * HOUR_MS,
  );
  return pieces;
}
