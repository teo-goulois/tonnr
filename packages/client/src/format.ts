// How a figure, a bearing, a moment and a length of time are written, in the reader's language.
// Each app gives its language and its messages to `formatting`, which reads them each time it
// writes: the language may change while the app is open.

export const KNOTS_PER_MS = 1.943844;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** The messages of an app that `formatting` writes with, as Paraglide compiles them. */
export type FormatMessages = {
  unit_seconds: (inputs: { value: string }) => string;
  unit_minutes: (inputs: { value: number }) => string;
  unit_hours: (inputs: { value: number }) => string;
  unit_hours_minutes: (inputs: { hours: number; minutes: string }) => string;
  // The sixteen points of the compass, from the north and separated by commas.
  compass_points: () => string;
  compass_names: () => string;
};

// A formatter is costly to build, and each one is asked for on every render.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(locale: string, digits: number) {
  const key = `${locale}:${digits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
    numberFormats.set(key, format);
  }
  return format;
}

// `zone` is the IANA name of a time zone. Left out, the hours are the device's.
function dateFormat(
  locale: string,
  name: string,
  options: Intl.DateTimeFormatOptions,
  zone?: string,
) {
  const key = `${locale}:${name}:${zone ?? ""}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone });
    dateFormats.set(key, format);
  }
  return format;
}

export function toKnots(metersPerSecond: number): number;
export function toKnots(metersPerSecond: number | null | undefined): number | null;
export function toKnots(metersPerSecond: number | null | undefined) {
  return metersPerSecond == null ? null : metersPerSecond * KNOTS_PER_MS;
}

function pointOf(degrees: number, points: string) {
  return points.split(",")[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16] ?? "";
}

/**
 * What writes a figure, a bearing, a moment and a length of time, in the language `locale`
 * answers when each is written.
 */
export function formatting({ locale, m }: { locale: () => string; m: FormatMessages }) {
  function formatNumber(value: number, digits = 1) {
    return numberFormat(locale(), digits).format(value);
  }

  function formatSeconds(value: number) {
    return m.unit_seconds({ value: formatNumber(value, 0) });
  }

  /** The compass point a bearing is nearest to, such as "WNW". */
  function compassPoint(degrees: number) {
    return pointOf(degrees, m.compass_points());
  }

  /** The compass point a bearing is nearest to, by its full name, such as "west-northwest". */
  function compassName(degrees: number) {
    return pointOf(degrees, m.compass_names());
  }

  /** "14:30" */
  function formatClock(date: Date, zone?: string) {
    return dateFormat(locale(), "clock", { hour: "2-digit", minute: "2-digit" }, zone).format(date);
  }

  /** "Fri 14:30" */
  function formatDayAndClock(date: Date, zone?: string) {
    return dateFormat(
      locale(),
      "dayAndClock",
      { weekday: "short", hour: "2-digit", minute: "2-digit" },
      zone,
    ).format(date);
  }

  /** "Fri 9" */
  function formatDay(date: Date, zone?: string) {
    return dateFormat(locale(), "day", { weekday: "short", day: "numeric" }, zone).format(date);
  }

  /** "Sat 10 Oct", and "Sat 10 Oct 2025" for a day of another year than this one. */
  function formatDate(date: Date, now = Date.now()) {
    const isThisYear = date.getFullYear() === new Date(now).getFullYear();
    return dateFormat(locale(), isThisYear ? "date" : "dateAndYear", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(isThisYear ? {} : { year: "numeric" }),
    }).format(date);
  }

  /** "October 2026" */
  function formatMonth(date: Date) {
    return dateFormat(locale(), "month", { month: "long", year: "numeric" }).format(date);
  }

  /** How long something lasted, such as "45 min", "2 h" or "1 h 30". */
  function formatDuration(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes - hours * 60);
    if (hours === 0) return m.unit_minutes({ value: rest });
    return rest === 0
      ? m.unit_hours({ value: hours })
      : m.unit_hours_minutes({ hours, minutes: String(rest).padStart(2, "0") });
  }

  /** How long ago a moment was, such as "16 min ago". */
  function formatAgo(date: Date, now: number) {
    const format = new Intl.RelativeTimeFormat(locale(), { style: "short", numeric: "always" });
    const minutes = Math.max(0, Math.round((now - date.getTime()) / MINUTE_MS));
    if (minutes < 60) return format.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    return hours < 48
      ? format.format(-hours, "hour")
      : format.format(-Math.round(hours / 24), "day");
  }

  return {
    formatNumber,
    formatSeconds,
    compassPoint,
    compassName,
    formatClock,
    formatDayAndClock,
    formatDay,
    formatDate,
    formatMonth,
    formatDuration,
    formatAgo,
  };
}

export type Formatting = ReturnType<typeof formatting>;

/** How much a reading can still be trusted to describe the sea now. */
export type Freshness = "fresh" | "aging" | "old" | "none";

// Most buoys report every half hour or every hour, and some networks pass their readings on an
// hour or two late.
const FRESH_MS = 1.5 * HOUR_MS;
const AGING_MS = 3 * HOUR_MS;
// Past this age a reading is no longer shown on the map.
export const STALE_MS = 6 * HOUR_MS;

export function freshnessOf(observedAt: Date | null | undefined, now: number): Freshness {
  if (!observedAt) return "none";
  const age = now - observedAt.getTime();
  if (age < FRESH_MS) return "fresh";
  if (age < AGING_MS) return "aging";
  return age < STALE_MS ? "old" : "none";
}
