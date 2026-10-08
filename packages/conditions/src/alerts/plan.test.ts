import { describe, expect, it } from "vitest";

import { planNotifications } from "./plan";

const now = new Date("2026-10-08T06:00:00Z");
const at = (iso: string) => new Date(iso);

const morning = { start: at("2026-10-09T07:00:00Z"), end: at("2026-10-09T10:00:00Z") };
const announced = {
  kind: "window_found" as const,
  day: "2026-10-09",
  windowStart: morning.start,
  windowEnd: morning.end,
  missedRuns: 0,
};

describe("planNotifications", () => {
  it("announces a window of at least two hours", () => {
    expect(planNotifications(now, [morning], [])).toEqual({
      create: [
        {
          kind: "window_found",
          day: "2026-10-09",
          windowStart: morning.start,
          windowEnd: morning.end,
        },
      ],
      update: [],
    });
  });

  it("ignores a window that is too short or already over", () => {
    const short = { start: at("2026-10-09T07:00:00Z"), end: at("2026-10-09T08:00:00Z") };
    const past = { start: at("2026-10-08T01:00:00Z"), end: at("2026-10-08T05:00:00Z") };

    expect(planNotifications(now, [short, past], [])).toEqual({ create: [], update: [] });
  });

  it("announces one window a day, the longest", () => {
    const evening = { start: at("2026-10-09T15:00:00Z"), end: at("2026-10-09T20:00:00Z") };
    const { create } = planNotifications(now, [morning, evening], []);

    expect(create).toHaveLength(1);
    expect(create[0]).toMatchObject({ windowStart: evening.start, windowEnd: evening.end });
  });

  it("keeps an announced window up to date without announcing it again", () => {
    const shifted = { start: at("2026-10-09T08:00:00Z"), end: at("2026-10-09T11:00:00Z") };

    expect(planNotifications(now, [shifted], [{ ...announced, missedRuns: 1 }])).toEqual({
      create: [],
      update: [
        { day: "2026-10-09", windowStart: shifted.start, windowEnd: shifted.end, missedRuns: 0 },
      ],
    });
  });

  it("recognises a window that runs on from the day before, and does not announce it again", () => {
    // Announced on the 8th as lasting until the 11th. Evaluated just after midnight on the 9th,
    // when the forecast starts at the 9th and reaches the 12th.
    const longWindow = {
      kind: "window_found" as const,
      day: "2026-10-08",
      windowStart: at("2026-10-08T00:00:00Z"),
      windowEnd: at("2026-10-11T00:00:00Z"),
      missedRuns: 0,
    };
    const seenToday = { start: at("2026-10-09T00:00:00Z"), end: at("2026-10-12T00:00:00Z") };

    expect(planNotifications(at("2026-10-09T00:20:00Z"), [seenToday], [longWindow])).toEqual({
      create: [],
      update: [
        {
          day: "2026-10-08",
          windowStart: longWindow.windowStart,
          windowEnd: seenToday.end,
          missedRuns: 0,
        },
      ],
    });
  });

  it("counts a missed run for a window that began the day before and is still ahead", () => {
    const overnight = {
      kind: "window_found" as const,
      day: "2026-10-07",
      windowStart: at("2026-10-07T23:00:00Z"),
      windowEnd: at("2026-10-08T10:00:00Z"),
      missedRuns: 1,
    };

    expect(planNotifications(now, [], [overnight]).create).toEqual([
      {
        kind: "window_cancelled",
        day: "2026-10-07",
        windowStart: overnight.windowStart,
        windowEnd: overnight.windowEnd,
      },
    ]);
  });

  it("announces a second, separate window of an announced day no more than once", () => {
    const evening = { start: at("2026-10-09T15:00:00Z"), end: at("2026-10-09T18:00:00Z") };
    const plan = planNotifications(now, [morning, evening], [announced]);

    expect(plan.create).toEqual([]);
    expect(plan.update).toHaveLength(1);
  });

  it("waits for a second evaluation before calling a window off", () => {
    const first = planNotifications(now, [], [announced]);
    expect(first.create).toEqual([]);
    expect(first.update).toEqual([
      { day: "2026-10-09", windowStart: morning.start, windowEnd: morning.end, missedRuns: 1 },
    ]);

    const second = planNotifications(now, [], [{ ...announced, missedRuns: 1 }]);
    expect(second.create).toEqual([
      {
        kind: "window_cancelled",
        day: "2026-10-09",
        windowStart: morning.start,
        windowEnd: morning.end,
      },
    ]);
  });

  it("calls a window off only once", () => {
    const cancelled = { ...announced, kind: "window_cancelled" as const };
    const plan = planNotifications(now, [], [{ ...announced, missedRuns: 2 }, cancelled]);

    expect(plan).toEqual({ create: [], update: [] });
  });

  it("says nothing about an announced window that has passed", () => {
    const later = new Date("2026-10-09T12:00:00Z");

    expect(planNotifications(later, [], [announced])).toEqual({ create: [], update: [] });
  });
});
