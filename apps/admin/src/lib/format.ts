import { getLocale } from "@/paraglide/runtime.js";

const MINUTE_MS = 60 * 1000;

// A formatter is costly to build, and each one is asked for on every render.
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function dateFormat(name: string, options: Intl.DateTimeFormatOptions) {
  const key = `${getLocale()}:${name}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(getLocale(), options);
    dateFormats.set(key, format);
  }
  return format;
}

/** "1,204" */
export function formatCount(value: number) {
  let format = numberFormats.get(getLocale());
  if (!format) {
    format = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 });
    numberFormats.set(getLocale(), format);
  }
  return format.format(value);
}

/** "9 Oct 2026" */
export function formatDate(date: Date) {
  return dateFormat("date", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** "Fri 9 Oct, 14:00" */
export function formatDayAndHour(date: Date) {
  return dateFormat("dayAndHour", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** "Fri 9 Oct" */
export function formatDay(date: Date) {
  return dateFormat("day", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

/** "14:00" */
export function formatClock(date: Date) {
  return dateFormat("clock", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** "9 Oct" */
export function formatShortDay(date: Date) {
  return dateFormat("shortDay", { day: "numeric", month: "short" }).format(date);
}

/** How long ago a moment was, such as "16 min ago". */
export function formatAgo(date: Date, now: number) {
  const format = new Intl.RelativeTimeFormat(getLocale(), { style: "short", numeric: "always" });
  const minutes = Math.max(0, Math.round((now - date.getTime()) / MINUTE_MS));
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  return hours < 48 ? format.format(-hours, "hour") : format.format(-Math.round(hours / 24), "day");
}

/** "1.4 GB", in the unit that keeps the figure short. */
export function formatBytes(bytes: number) {
  const units = ["kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit: units[unit],
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

/** How long something lasted, such as "42 s" or "3 min". */
export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const [value, unit] = seconds < 90 ? [seconds, "second"] : [Math.round(seconds / 60), "minute"];
  return new Intl.NumberFormat(getLocale(), { style: "unit", unit, unitDisplay: "short" }).format(
    value,
  );
}
