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
 * Reads a time written with its zone, as `2026-10-08T07:00:00Z` or `2026-10-08T09:00+02:00`, with
 * or without seconds and a fraction of a second. Returns null when the text names no zone, or
 * no moment an observation can have. `Date` alone would read 31 February as 3 March.
 */
export function parseZonedTime(text: string) {
  // A fraction is one of the seconds, so it is read only when the seconds are written.
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(
    text,
  );
  if (!match) return null;

  const [, written = "", seconds = "00", fraction = "", zone = "Z"] = match;
  const date = new Date(`${written}:${seconds}${fraction}${zone}`);
  if (Number.isNaN(date.getTime())) return null;

  // Read back in the zone it was written in, the moment must give the same day and time.
  const sign = zone.startsWith("-") ? -1 : 1;
  const offsetMinutes =
    zone === "Z" ? 0 : sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const readBack = new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 16);

  return readBack === written && isObservationTime(date) ? date : null;
}
