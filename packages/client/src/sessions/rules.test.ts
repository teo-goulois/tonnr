import { describe, expect, it } from "vitest";

import { byMonth, daysBefore, isAhead, usualStart, withinLengths } from "./rules";

describe("when a session that is written now is taken to have begun", () => {
  it("is an hour and a half before, on a round five minutes", () => {
    const now = new Date(2026, 9, 3, 11, 13, 40).getTime();
    expect(usualStart(now).getTime()).toBe(new Date(2026, 9, 3, 9, 40).getTime());
  });

  it("is never later than a quarter of an hour ahead of the clock", () => {
    const now = new Date(2026, 9, 3, 11, 0).getTime();
    expect(isAhead(new Date(2026, 9, 3, 11, 15), now)).toBe(false);
    expect(isAhead(new Date(2026, 9, 3, 11, 20), now)).toBe(true);
  });
});

describe("the day of a session", () => {
  it("is so many days before by the calendar, whatever the hours", () => {
    const now = new Date(2026, 9, 3, 11, 0).getTime();
    expect(daysBefore(new Date(2026, 9, 3, 0, 5), now)).toBe(0);
    expect(daysBefore(new Date(2026, 9, 2, 23, 55), now)).toBe(1);
    expect(daysBefore(new Date(2026, 9, 1, 8, 0), now)).toBe(2);
  });
});

describe("a length of one's own", () => {
  it("is five minutes at a time, from a quarter of an hour to eight hours", () => {
    expect(withinLengths(5)).toBe(15);
    expect(withinLengths(97)).toBe(95);
    expect(withinLengths(600)).toBe(480);
  });
});

describe("the log, month by month", () => {
  const session = (id: string, startedAt: Date) => ({ id, startedAt });
  const monthOf = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}`;

  it("keeps the order of the list, the latest month first", () => {
    const months = byMonth(
      [
        session("c", new Date(2026, 9, 18, 8)),
        session("b", new Date(2026, 9, 2, 8)),
        session("a", new Date(2026, 8, 30, 8)),
      ],
      monthOf,
    );
    expect(months.map((month) => month.name)).toEqual(["2026-10", "2026-9"]);
    expect(months.map((month) => month.sessions.map((one) => one.id))).toEqual([["c", "b"], ["a"]]);
  });

  it("is no month when there is no session", () => {
    expect(byMonth([], monthOf)).toEqual([]);
  });
});
