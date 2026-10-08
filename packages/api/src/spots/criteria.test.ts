import { describe, expect, it } from "vitest";

import {
  criteriaSchema,
  findWindows,
  isInArc,
  unmetCriteria,
  type HourConditions,
} from "./criteria";

const hour: HourConditions = {
  time: new Date("2026-10-08T10:00:00Z"),
  swellHeightMeters: 1.6,
  swellPeriodSeconds: 11,
  swellDirectionDegrees: 290,
  windSpeedMetersPerSecond: 3,
  windDirectionDegrees: 90,
  tideHeightMeters: 2.4,
  tideTrend: "rising",
};

describe("isInArc", () => {
  it("accepts a direction inside a sector", () => {
    expect(isInArc(290, { from: 270, to: 330 })).toBe(true);
    expect(isInArc(260, { from: 270, to: 330 })).toBe(false);
  });

  it("handles a sector that passes through north", () => {
    expect(isInArc(350, { from: 340, to: 20 })).toBe(true);
    expect(isInArc(10, { from: 340, to: 20 })).toBe(true);
    expect(isInArc(180, { from: 340, to: 20 })).toBe(false);
  });

  it("treats 360 and 0 as the same direction", () => {
    expect(isInArc(360, { from: 350, to: 10 })).toBe(true);
    expect(isInArc(0, { from: 0, to: 360 })).toBe(true);
  });
});

describe("unmetCriteria", () => {
  it("returns nothing when every criterion is met", () => {
    const criteria = {
      swellHeightMeters: { min: 1, max: 2.5 },
      swellPeriodSeconds: { min: 9 },
      swellDirectionDegrees: { from: 270, to: 330 },
      windSpeedMetersPerSecond: { max: 5 },
      windDirectionDegrees: { from: 45, to: 135 },
      tideHeightMeters: { min: 1.5, max: 3.5 },
      tideTrend: "rising" as const,
    };

    expect(unmetCriteria(hour, criteria)).toEqual([]);
  });

  it("names the criteria that are not met", () => {
    const criteria = {
      swellHeightMeters: { min: 2 },
      windSpeedMetersPerSecond: { max: 2 },
      tideTrend: "falling" as const,
    };

    expect(unmetCriteria(hour, criteria)).toEqual([
      "swellHeightMeters",
      "windSpeedMetersPerSecond",
      "tideTrend",
    ]);
  });

  it("counts a criterion on an unknown value as not met", () => {
    const unknownTide = { ...hour, tideHeightMeters: null, tideTrend: null };

    expect(unmetCriteria(unknownTide, { tideHeightMeters: { min: 0 } })).toEqual([
      "tideHeightMeters",
    ]);
    expect(unmetCriteria(unknownTide, { swellHeightMeters: { min: 1 } })).toEqual([]);
  });

  it("checks nothing when no criterion is set", () => {
    expect(unmetCriteria(hour, {})).toEqual([]);
  });
});

describe("findWindows", () => {
  const at = (hourOfDay: number, works: boolean) => ({
    time: new Date(Date.UTC(2026, 9, 8, hourOfDay)),
    unmet: works ? [] : (["tideTrend"] as const),
  });

  it("groups consecutive working hours and ends an hour after the last one", () => {
    const windows = findWindows([
      at(6, false),
      at(7, true),
      at(8, true),
      at(9, false),
      at(10, true),
    ]);

    expect(windows).toEqual([
      { start: new Date("2026-10-08T07:00:00Z"), end: new Date("2026-10-08T09:00:00Z") },
      { start: new Date("2026-10-08T10:00:00Z"), end: new Date("2026-10-08T11:00:00Z") },
    ]);
  });

  it("does not join two working hours separated by a gap in the data", () => {
    const windows = findWindows([at(7, true), at(9, true)]);

    expect(windows).toHaveLength(2);
  });

  it("returns nothing when no hour works", () => {
    expect(findWindows([at(7, false), at(8, false)])).toEqual([]);
  });
});

describe("criteriaSchema", () => {
  it("rejects a range whose minimum is above its maximum", () => {
    expect(criteriaSchema.safeParse({ swellHeightMeters: { min: 3, max: 1 } }).success).toBe(false);
  });

  it("rejects a criterion it does not know", () => {
    expect(criteriaSchema.safeParse({ crowdLevel: { max: 3 } }).success).toBe(false);
  });
});
