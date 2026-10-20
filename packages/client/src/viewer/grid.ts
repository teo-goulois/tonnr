import { isNight } from "@repo/conditions/sun";

import { HOUR_MS } from "./samples";

// The columns of the week's table of a place's panel, as both apps lay them: one every few hours,
// or every hour once a day or an hour is pressed, each knowing its day and whether it is night.
// The rows beyond the waves, their period, the wind and the weather, are drawn by the density in
// force: decision 061. The web's `ForecastGrid` and the app for phones' read them here.

/** The rows beyond the waves, their period, the wind and the weather, which a density draws. */
export type GridRow = "energy" | "swell" | "gusts" | "model";
export const GRID_ROWS: GridRow[] = ["energy", "swell", "gusts", "model"];

/** The table's step, in hours, while it is not showing every hour. */
export const STEP_HOURS = 3;

/** A column of the table. `day` counts the days from the first one. */
export type Column = { time: number; night: boolean; isNow: boolean; day: number };

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
    if (date !== previousDay) day++;
    list.push({
      time,
      night: place ? isNight(time, place.latitude, place.longitude) : false,
      isNow: Math.abs(time - now) <= step / 2,
      day,
    });
    previousDay = date;
  }
  return list;
}
