import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

const KNOTS_PER_MS = 1.943844;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// A formatter is costly to build, and each one is asked for on every render.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(digits: number) {
  const key = `${getLocale()}:${digits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits });
    numberFormats.set(key, format);
  }
  return format;
}

// `zone` is the IANA name of a time zone. Left out, the hours are the browser's.
function dateFormat(name: string, options: Intl.DateTimeFormatOptions, zone?: string) {
  const key = `${getLocale()}:${name}:${zone ?? ""}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(getLocale(), { ...options, timeZone: zone });
    dateFormats.set(key, format);
  }
  return format;
}

export function toKnots(metersPerSecond: number): number;
export function toKnots(metersPerSecond: number | null | undefined): number | null;
export function toKnots(metersPerSecond: number | null | undefined) {
  return metersPerSecond == null ? null : metersPerSecond * KNOTS_PER_MS;
}

export function formatNumber(value: number, digits = 1) {
  return numberFormat(digits).format(value);
}

export function formatSeconds(value: number) {
  return m.unit_seconds({ value: formatNumber(value, 0) });
}

/** The compass point a bearing is nearest to, such as "WNW". */
export function compassPoint(degrees: number) {
  const points = m.compass_points().split(",");
  return points[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16] ?? "";
}

/** "14:30" */
export function formatClock(date: Date, zone?: string) {
  return dateFormat("clock", { hour: "2-digit", minute: "2-digit" }, zone).format(date);
}

/** "Fri 14:30" */
export function formatDayAndClock(date: Date, zone?: string) {
  return dateFormat(
    "dayAndClock",
    { weekday: "short", hour: "2-digit", minute: "2-digit" },
    zone,
  ).format(date);
}

/** "Fri 9" */
export function formatDay(date: Date, zone?: string) {
  return dateFormat("day", { weekday: "short", day: "numeric" }, zone).format(date);
}

/** "Sat 10 Oct", and "Sat 10 Oct 2025" for a day of another year than this one. */
export function formatDate(date: Date, now = Date.now()) {
  const isThisYear = date.getFullYear() === new Date(now).getFullYear();
  return dateFormat(isThisYear ? "date" : "dateAndYear", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(isThisYear ? {} : { year: "numeric" }),
  }).format(date);
}

/** "October 2026" */
export function formatMonth(date: Date) {
  return dateFormat("month", { month: "long", year: "numeric" }).format(date);
}

/** How long something lasted, such as "45 min", "2 h" or "1 h 30". */
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes - hours * 60);
  if (hours === 0) return m.unit_minutes({ value: rest });
  return rest === 0
    ? m.unit_hours({ value: hours })
    : m.unit_hours_minutes({ hours, minutes: String(rest).padStart(2, "0") });
}

/** How long ago a moment was, such as "16 min ago". */
export function formatAgo(date: Date, now: number) {
  const format = new Intl.RelativeTimeFormat(getLocale(), { style: "short", numeric: "always" });
  const minutes = Math.max(0, Math.round((now - date.getTime()) / MINUTE_MS));
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  return hours < 48 ? format.format(-hours, "hour") : format.format(-Math.round(hours / 24), "day");
}

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
