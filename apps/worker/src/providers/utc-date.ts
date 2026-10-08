/**
 * Builds a UTC date from its parts, or returns null when they do not name a real moment.
 * `Date.UTC` would turn 31 February into 3 March.
 */
export function utcDate(year: number, month: number, day: number, hour: number, minute: number) {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const isReal =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute;

  return isReal ? date : null;
}
