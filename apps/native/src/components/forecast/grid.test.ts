import { describe, expect, it } from "vitest";

import { columnAt, dayLengths, gridColumns, homeOffset } from "./grid";

const HOUR = 60 * 60 * 1000;

describe("the days of the week's table", () => {
  it("counts the columns of each day", () => {
    const start = new Date(2026, 9, 20, 10, 20).getTime();
    const columns = gridColumns({ start, end: start + 2 * 24 * HOUR, now: start, stepHours: 3 });
    const lengths = dayLengths(columns);
    expect([...lengths.values()].reduce((sum, count) => sum + count, 0)).toBe(columns.length);
    expect(lengths.get(1)).toBe(8);
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
