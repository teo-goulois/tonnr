import { isNight } from "../sun";
import { localTime } from "./clock";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** A stretch of time, from its first moment to the moment it ends. */
export type Interval = { start: Date; end: Date };

/** Hours of a day, in minutes since midnight: from the first to the one it ends at. */
export type DayHours = { from: number; to: number }[];

/** When an account can go: decision 031, "The settings of an account". */
export type Availability = {
  // The time zone its days and its hours are read in.
  zone: string;
  // Only the hours between dawn and dusk at the spot.
  daylightOnly: boolean;
  // Its hours for each day of the week, Monday first. Null for any hour of any day. A day with
  // no hours is a day off.
  week: DayHours[] | null;
  // Until then, no hour is open.
  pausedUntil: Date | null;
};

/** An account that can go at any hour of the day and the night. */
export const ALWAYS: Availability = {
  zone: "UTC",
  daylightOnly: false,
  week: null,
  pausedUntil: null,
};

// Whether the hour that begins at a moment is one the account can use, at a place.
function isOpen(
  hour: number,
  place: { latitude: number; longitude: number },
  availability: Availability,
) {
  const { zone, daylightOnly, week, pausedUntil } = availability;
  if (pausedUntil && hour < pausedUntil.getTime()) return false;
  // The sun is judged at the middle of the hour: an hour that dawn cuts in two is day or night
  // by its larger half.
  if (daylightOnly && isNight(hour + HOUR_MS / 2, place.latitude, place.longitude)) return false;
  if (!week) return true;

  // The hour is read on the account's clock, where it begins. An hour the clock skips is never
  // read, and one it shows twice is read twice.
  const local = localTime(new Date(hour), zone);
  return (week[local.weekday] ?? []).some(
    ({ from, to }) => local.minutes >= from && local.minutes + 60 <= to,
  );
}

/**
 * The open hours of a sea window: the pieces of it an account can use, each at least as long as
 * the alert's shortest window. A sea window is a run of whole hours, and so are its pieces.
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

  for (let hour = sea.start.getTime(); hour < sea.end.getTime(); hour += HOUR_MS) {
    if (isOpen(hour, place, availability)) from ??= hour;
    else close(hour);
  }
  close(sea.end.getTime());
  return pieces;
}
