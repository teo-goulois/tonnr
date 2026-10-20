import { HOUR_MS, isNight } from "./metrics";

// The columns of the week's table, as the web's `ForecastGrid` lays them: one every few hours, or
// every hour once a day or an hour is pressed, each knowing its day and whether it is night.
// Pure, so that a test reads it.

/** The rows beyond the waves, their period, the wind and the weather, which a density draws. */
export type GridRow = "energy" | "swell" | "gusts" | "model";
export const GRID_ROWS: GridRow[] = ["energy", "swell", "gusts", "model"];

/** A column of the table. `day` counts the days from the first one, `dayStart` marks its first. */
export type Column = {
  time: number;
  night: boolean;
  isNow: boolean;
  day: number;
  dayStart: boolean;
};

/** The table's step, in hours, while it is not showing every hour. */
export const STEP_HOURS = 3;

/**
 * The columns between two moments, every `stepHours` from a round hour, the first at or after
 * `start`. A column within half a step of now is now's. Days are the reader's own.
 */
export function gridColumns({
  start,
  end,
  now,
  stepHours,
  place,
}: {
  start: number;
  end: number;
  now: number;
  stepHours: number;
  place?: { latitude: number; longitude: number };
}): Column[] {
  const step = stepHours * HOUR_MS;
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  first.setHours(Math.ceil(first.getHours() / stepHours) * stepHours);
  if (first.getTime() < start) first.setTime(first.getTime() + step);
  const list: Column[] = [];
  let previousDay = "";
  let day = -1;
  for (let time = first.getTime(); time <= end; time += step) {
    const date = new Date(time).toDateString();
    const dayStart = date !== previousDay;
    if (dayStart) day++;
    list.push({
      time,
      night: place ? isNight(time, place.latitude, place.longitude) : false,
      isNow: Math.abs(time - now) <= step / 2,
      day,
      dayStart,
    });
    previousDay = date;
  }
  return list;
}

/** How many columns each day of the table holds, from the first column of each. */
export function dayLengths(columns: Column[]) {
  const lengths = new Map<number, number>();
  for (const column of columns) lengths.set(column.day, (lengths.get(column.day) ?? 0) + 1);
  return lengths;
}

/** The column under a point of the table, `x` from the start of the first column. */
export function columnAt(columns: Column[], x: number, width: number) {
  if (columns.length === 0) return undefined;
  return Math.min(columns.length - 1, Math.max(0, Math.floor(x / width)));
}

/**
 * Where the table opens: now at its left, after the columns of the past it is asked to keep.
 * Zero when now is not among its columns.
 */
export function homeOffset(columns: Column[], lead: number, width: number) {
  const index = columns.findIndex((column) => column.isNow);
  return index < 0 ? 0 : Math.max(0, (index - lead) * width);
}
