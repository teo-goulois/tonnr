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

/**
 * Reads a time written as `2026-10-08T07:00:00Z`, with or without a fraction of a second, or
 * returns null when it does not name a moment an observation can have. `Date` alone would read
 * 31 February as 3 March.
 */
export function parseUtcTime(text: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(text)) return null;

  const date = new Date(text);
  const isReal =
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) === text.slice(0, 19);

  return isReal && isObservationTime(date) ? date : null;
}
