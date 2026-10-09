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

function dateFormat(name: string, options: Intl.DateTimeFormatOptions) {
  const key = `${getLocale()}:${name}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(getLocale(), options);
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

export function formatMeters(value: number) {
  return m.unit_meters({ value: formatNumber(value) });
}

export function formatSeconds(value: number) {
  return m.unit_seconds({ value: formatNumber(value, 0) });
}

export function formatKnots(value: number) {
  return m.unit_knots({ value: formatNumber(value, 0) });
}

/** The compass point a bearing is nearest to, such as "WNW". */
export function compassPoint(degrees: number) {
  const points = m.compass_points().split(",");
  return points[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16] ?? "";
}

/** "14:30" */
export function formatClock(date: Date) {
  return dateFormat("clock", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** "Fri 14:30" */
export function formatDayAndClock(date: Date) {
  return dateFormat("dayAndClock", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
    date,
  );
}

/** "Fri" */
export function formatWeekday(date: Date) {
  return dateFormat("weekday", { weekday: "short" }).format(date);
}

/** "Fri 9" */
export function formatDay(date: Date) {
  return dateFormat("day", { weekday: "short", day: "numeric" }).format(date);
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
