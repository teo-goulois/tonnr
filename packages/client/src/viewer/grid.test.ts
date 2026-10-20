import { describe, expect, it } from "vitest";

import { gridColumns } from "./grid";

const HOUR = 60 * 60 * 1000;

describe("the columns of the week's table", () => {
  const start = new Date(2026, 9, 20, 10, 20).getTime();
  const columns = gridColumns({
    start,
    end: start + 2 * 24 * HOUR,
    now: start + 50 * 60 * 1000,
    stepHours: 3,
  });

  it("starts at the first round step at or after its start, and goes every step", () => {
    expect(new Date(columns[0]!.time).getHours()).toBe(12);
    expect(columns[1]!.time - columns[0]!.time).toBe(3 * HOUR);
  });

  it("knows the column of now, within half a step of it", () => {
    expect(columns.filter((column) => column.isNow)).toHaveLength(1);
    expect(columns[0]!.isNow).toBe(true);
  });

  it("counts its days from the first, each from the reader's midnight", () => {
    expect([...new Set(columns.map((column) => column.day))]).toEqual([0, 1, 2]);
    for (const [index, column] of columns.entries()) {
      if (index > 0 && column.day !== columns[index - 1]!.day) {
        expect(new Date(column.time).getHours()).toBe(0);
      }
    }
  });

  it("shows every hour when asked", () => {
    const hourly = gridColumns({ start, end: start + 6 * HOUR, now: start, stepHours: 1 });
    expect(new Date(hourly[0]!.time).getHours()).toBe(11);
    expect(hourly).toHaveLength(6);
  });

  it("tells night from day where it knows the place", () => {
    const atNight = gridColumns({
      start: new Date(Date.UTC(2026, 5, 21, 0)).getTime(),
      end: new Date(Date.UTC(2026, 5, 21, 23)).getTime(),
      now: 0,
      stepHours: 3,
      place: { latitude: 43.5, longitude: -1.5 },
    });
    expect(atNight.some((column) => column.night)).toBe(true);
    expect(atNight.some((column) => !column.night)).toBe(true);
  });
});
