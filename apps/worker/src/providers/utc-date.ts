const EARLIEST = Date.UTC(1900, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a moment is one an observation can have: after 1900 and not past tomorrow. */
export function isObservationTime(date: Date) {
  // A day of margin for a provider whose clock runs ahead.
  return date.getTime() >= EARLIEST && date.getTime() <= Date.now() + DAY_MS;
}

/**
 * Builds the UTC date of an observation from its parts, or returns null when they do not name a
 * moment an observation can have. `Date.UTC` would turn 31 February into 3 March, and the
 * database cannot store the year 10000.
 */
export function utcDate(year: number, month: number, day: number, hour: number, minute: number) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const isReal =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute;

  return isReal && isObservationTime(date) ? date : null;
}
