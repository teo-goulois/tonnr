// The clock of an account: what day and what time it is for it, in its time zone. A zone is an
// IANA name, such as "Europe/Paris", and the runtime knows its rules.

const MINUTE_MS = 60 * 1000;

// One format for a zone, made once: a look reads the clock for every hour of every spot. The
// names come from accounts' settings, which keep them as the runtime spells them, so the same
// zone is not kept under a hundred spellings. The cap is for whatever else would call.
const FORMATS_KEPT = 600;
const formats = new Map<string, Intl.DateTimeFormat>();
function formatOf(zone: string) {
  let format = formats.get(zone);
  if (!format) {
    if (formats.size >= FORMATS_KEPT) formats.clear();
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formats.set(zone, format);
  }
  return format;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * A time zone's name as the runtime spells it, whatever case it was given in. Null for a name
 * that is no zone.
 */
export function zoneNamed(name: string) {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Whether the runtime knows a time zone by that name. */
export const isZone = (name: string) => zoneNamed(name) !== null;

export type LocalTime = {
  // The day, as "2026-10-11".
  date: string;
  // The day of the week, from 0 for Monday to 6 for Sunday.
  weekday: number;
  // Minutes since midnight.
  minutes: number;
};

/** The day and the time a moment is, in a zone. */
export function localTime(moment: Date, zone: string): LocalTime {
  const parts = Object.fromEntries(
    formatOf(zone)
      .formatToParts(moment)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** The day that comes so many days after another, or before it. */
export function addDays(date: string, days: number) {
  const moment = new Date(`${date}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

// How far a zone's clock is ahead of UTC at a moment, in minutes.
function offsetMinutes(moment: Date, zone: string) {
  const local = localTime(moment, zone);
  const shown = Date.parse(`${local.date}T00:00:00Z`) + local.minutes * MINUTE_MS;
  // The format gives whole minutes: the seconds of the moment are not part of the offset.
  return Math.round((shown - Math.floor(moment.getTime() / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

/**
 * The moment a day's clock shows a time, in a zone. A time the clock shows twice, when it is set
 * back, is the first of the two. A time it skips, when it is set forward, is the moment it
 * would have shown it had it not been.
 */
export function momentOf(date: string, minutes: number, zone: string): Date {
  // The end of a day is the beginning of the next.
  if (minutes >= 24 * 60) return momentOf(addDays(date, 1), minutes - 24 * 60, zone);
  const shown = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE_MS;
  // The offset of the day before and of the day after bracket any change of the clock.
  const offsets = [-1, 1].map((days) => offsetMinutes(new Date(shown + days * 86_400_000), zone));
  const candidates = [...new Set(offsets)]
    .map((offset) => shown - offset * MINUTE_MS)
    .sort((a, b) => a - b);
  const exact = candidates.find((candidate) => {
    const local = localTime(new Date(candidate), zone);
    return local.date === date && local.minutes === minutes;
  });
  return new Date(exact ?? candidates.at(-1)!);
}
