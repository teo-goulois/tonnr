import { describe, expect, it } from "vitest";

import { columnAt, dayLengths, gridColumns, homeOffset } from "./grid";

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

  it("counts its days, and marks the first column of each", () => {
    const starts = columns.filter((column) => column.dayStart);
    expect(starts.map((column) => column.day)).toEqual([0, 1, 2]);
    for (const column of starts) {
      if (column.day > 0) expect(new Date(column.time).getHours()).toBe(0);
    }
    const lengths = dayLengths(columns);
    expect([...lengths.values()].reduce((sum, count) => sum + count, 0)).toBe(columns.length);
    expect(lengths.get(1)).toBe(8);
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

describe("where a finger and the table stand", () => {
  const columns = gridColumns({
    start: 0,
    end: 9 * 3 * HOUR,
    now: 4 * 3 * HOUR,
    stepHours: 3,
  });

  it("finds the column under a point, kept within the table", () => {
    expect(columnAt(columns, 0, 34)).toBe(0);
    expect(columnAt(columns, 35, 34)).toBe(1);
    expect(columnAt(columns, -20, 34)).toBe(0);
    expect(columnAt(columns, 10_000, 34)).toBe(columns.length - 1);
    expect(columnAt([], 10, 34)).toBeUndefined();
  });

  it("opens on now, after the columns of the past it keeps", () => {
    const index = columns.findIndex((column) => column.isNow);
    expect(homeOffset(columns, 0, 34)).toBe(index * 34);
    expect(homeOffset(columns, 2, 34)).toBe((index - 2) * 34);
    expect(homeOffset(columns, 99, 34)).toBe(0);
  });
});
