import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  NO_CALLS,
  type UsagePoint,
  fillSeries,
  isRangeName,
  rangeNameOf,
  rangeOf,
  sumOf,
  totalOf,
} from "./usage";

const at = (text: string) => new Date(text);
const calls = (text: string, answered: number): UsagePoint => ({
  ...NO_CALLS,
  at: at(text),
  answered,
});

describe("a range", () => {
  it("ends with the hour under way, and goes back a whole number of hours", () => {
    const range = rangeOf("day", at("2026-10-09T10:20:30Z"));

    expect(range).toEqual({
      from: at("2026-10-08T11:00:00Z"),
      to: at("2026-10-09T11:00:00Z"),
      step: "hour",
    });
    expect(fillSeries([], range)).toHaveLength(24);
    expect(fillSeries([], rangeOf("week", at("2026-10-09T10:20:30Z")))).toHaveLength(168);
  });

  it("by the hour starts on UTC's hours, where the counts are kept", () => {
    // Whatever the reader's clock, 10:20:30 UTC is in the hour that started at 10:00 UTC.
    const { from, to } = rangeOf("day", new Date(Date.UTC(2026, 9, 9, 10, 20, 30)));

    expect([from.getUTCMinutes(), to.getUTCMinutes()]).toEqual([0, 0]);
    expect(to.toISOString()).toBe("2026-10-09T11:00:00.000Z");
  });

  it("by the day starts and ends at the reader's midnight", () => {
    const range = rangeOf("month", new Date(2026, 9, 9, 10, 20));

    expect(range.step).toBe("day");
    expect(range.to).toEqual(new Date(2026, 9, 10));
    expect(range.from).toEqual(new Date(2026, 8, 10));
    expect(fillSeries([], range)).toHaveLength(30);
    expect(fillSeries([], rangeOf("year", new Date(2026, 9, 9, 10, 20)))).toHaveLength(365);
  });
});

describe("a series", () => {
  const range = {
    from: at("2026-10-09T08:00:00Z"),
    to: at("2026-10-09T11:00:00Z"),
    step: "hour",
  } as const;

  it("has every hour of its range, with no call where none was counted", () => {
    const filled = fillSeries([calls("2026-10-09T09:00:00Z", 12)], range);

    expect(filled.map((point) => [point.at.toISOString(), point.answered])).toEqual([
      ["2026-10-09T08:00:00.000Z", 0],
      ["2026-10-09T09:00:00.000Z", 12],
      ["2026-10-09T10:00:00.000Z", 0],
    ]);
  });

  it("leaves out what was counted outside its range", () => {
    const filled = fillSeries(
      [calls("2026-10-09T07:00:00Z", 5), calls("2026-10-09T11:00:00Z", 7)],
      range,
    );

    expect(filled.map((point) => point.answered)).toEqual([0, 0, 0]);
  });

  it("steps from one midnight to the next, whatever the day's length", () => {
    // In a zone that changes its clock, the last Sunday of October lasts 25 hours.
    const from = new Date(2026, 9, 24);
    const to = new Date(2026, 9, 27);

    const days = fillSeries([], { from, to, step: "day" });

    expect(days.map((point) => point.at)).toEqual([
      new Date(2026, 9, 24),
      new Date(2026, 9, 25),
      new Date(2026, 9, 26),
    ]);
  });
});

describe("where the clock is moved at midnight", () => {
  // In Santiago the 6th of September 2026 starts at one o'clock: midnight is skipped.
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Santiago";
  });
  afterAll(() => {
    process.env.TZ = zone;
  });

  it("starts each day where the calendar does, and not an hour after the day before did", () => {
    // The test is worth something only where the process took the zone.
    expect(new Date(2026, 8, 6).getHours()).toBe(1);

    const days = fillSeries([], {
      from: new Date(2026, 8, 5),
      to: new Date(2026, 8, 9),
      step: "day",
    });

    expect(days.map((point) => point.at.toISOString())).toEqual([
      "2026-09-05T04:00:00.000Z",
      "2026-09-06T04:00:00.000Z",
      // Summer time: three hours from UTC, and midnight is midnight again.
      "2026-09-07T03:00:00.000Z",
      "2026-09-08T03:00:00.000Z",
    ]);
  });

  it("ends a range at the midnight after today, summer time or not", () => {
    const range = rangeOf("month", new Date("2026-09-08T15:00:00Z"));

    expect(range.to.toISOString()).toBe("2026-09-09T03:00:00.000Z");
    expect(range.from.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    expect(fillSeries([], range)).toHaveLength(30);
  });
});

describe("where the clock goes back at midnight", () => {
  // In Havana the 1st of November 2026 has two midnights: at one o'clock it is midnight again.
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Havana";
  });
  afterAll(() => {
    process.env.TZ = zone;
  });

  it("finds the day's calls, whichever of its two midnights the API counted them under", () => {
    const first = new Date("2026-11-01T04:00:00Z");
    const second = new Date("2026-11-01T05:00:00Z");
    // The test is worth something only where the process took the zone.
    expect([first.getHours(), second.getHours(), second.getDate()]).toEqual([0, 0, 1]);
    const range = { from: new Date(2026, 9, 31), to: new Date(2026, 10, 3), step: "day" } as const;

    for (const at of [first, second]) {
      const days = fillSeries([{ ...NO_CALLS, at, answered: 12 }], range);

      expect(days.map((point) => point.answered)).toEqual([0, 12, 0]);
      expect(days.map((point) => point.at.getDate())).toEqual([31, 1, 2]);
    }
  });
});

describe("where the clock is half an hour from UTC", () => {
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Asia/Kolkata";
  });
  afterAll(() => {
    process.env.TZ = zone;
  });

  it("counts the day that has just started there, while UTC is still in the day before", () => {
    // Ten past midnight on the 10th in Kolkata is 18:40 on the 9th, UTC's.
    const range = rangeOf("month", new Date("2026-10-09T18:40:00Z"));

    expect(new Date("2026-10-09T18:40:00Z").getDate()).toBe(10);
    expect(range.to.toISOString()).toBe("2026-10-10T18:30:00.000Z");
    expect(fillSeries([], range).at(-1)?.at.toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });

  it("keeps the hours on UTC's hours, where the counts are", () => {
    const range = rangeOf("day", new Date("2026-10-09T18:40:00Z"));

    expect(range.to.toISOString()).toBe("2026-10-09T19:00:00.000Z");
    expect(fillSeries([], range).every((point) => point.at.getUTCMinutes() === 0)).toBe(true);
  });
});

describe("a span that is no span", () => {
  it("draws nothing for ever", () => {
    const never = new Date(Number.NaN);
    const from = new Date(2026, 9, 1);

    expect(fillSeries([], { from, to: never, step: "day" })).toEqual([]);
    expect(fillSeries([], { from: never, to: from, step: "day" })).toEqual([]);
    expect(fillSeries([], { from, to: new Date(2100, 0, 1), step: "day" })).toHaveLength(400);
    expect(fillSeries([], { from, to: never, step: "hour" })).toEqual([]);
  });
});

describe("the name of a range", () => {
  it("is the day for an address that names none it knows", () => {
    expect(rangeNameOf("month")).toBe("month");
    for (const name of ["bogus", "toString", undefined, 30]) expect(rangeNameOf(name)).toBe("day");
  });

  it("is one of the four, and nothing an object has without being given it", () => {
    expect(["day", "week", "month", "year"].every(isRangeName)).toBe(true);
    for (const name of ["toString", "constructor", "__proto__", "", "days", 7, null, undefined]) {
      expect(isRangeName(name)).toBe(false);
    }
  });
});

describe("counts", () => {
  it("add up outcome by outcome, and all together", () => {
    const sum = sumOf([
      { ...NO_CALLS, answered: 3, refused: 1 },
      { ...NO_CALLS, answered: 2, limited: 4 },
    ]);

    expect(sum).toEqual({ answered: 5, invalid: 0, refused: 1, limited: 4, failed: 0 });
    expect(totalOf(sum)).toBe(10);
  });
});
