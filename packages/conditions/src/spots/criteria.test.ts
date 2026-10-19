import { describe, expect, it } from "vitest";

import {
  askedCriteria,
  coefficientAt,
  criteriaSchema,
  findWindows,
  isInArc,
  tideSegmentAt,
  tideTrendAt,
  unmetCriteria,
  type HourConditions,
} from "./criteria";

const hour: HourConditions = {
  time: new Date("2026-10-08T10:00:00Z"),
  waveHeightMeters: 1.6,
  wavePeakPeriodSeconds: 11,
  waveDirectionDegrees: 290,
  // Of that sea of 1.6 m, a swell of 1.1 m from further north.
  primarySwellHeightMeters: 1.1,
  primarySwellDirectionDegrees: 310,
  windSpeedMetersPerSecond: 3,
  windDirectionDegrees: 90,
  tideHeightMeters: 2.4,
  tideTrend: "rising",
  tideSegment: "mid_rising",
  tideCoefficient: 85,
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
      waveHeightMeters: { min: 1, max: 2.5 },
      wavePeakPeriodSeconds: { min: 9 },
      waveDirectionDegrees: { from: 270, to: 330 },
      windSpeedMetersPerSecond: { max: 5 },
      windDirectionDegrees: { from: 45, to: 135 },
      tideHeightMeters: { min: 1.5, max: 3.5 },
      tideTrend: "rising" as const,
    };

    expect(unmetCriteria(hour, criteria)).toEqual([]);
  });

  it("names the criteria that are not met", () => {
    const criteria = {
      waveHeightMeters: { min: 2 },
      windSpeedMetersPerSecond: { max: 2 },
      tideTrend: "falling" as const,
    };

    expect(unmetCriteria(hour, criteria)).toEqual([
      "waveHeightMeters",
      "windSpeedMetersPerSecond",
      "tideTrend",
    ]);
  });

  it("counts a criterion on an unknown value as not met", () => {
    const unknownTide = { ...hour, tideHeightMeters: null, tideTrend: null };

    expect(unmetCriteria(unknownTide, { tideHeightMeters: { min: 0 } })).toEqual([
      "tideHeightMeters",
    ]);
    expect(unmetCriteria(unknownTide, { waveHeightMeters: { min: 1 } })).toEqual([]);
  });

  it("checks the swell apart on its own figures, not on the whole sea's", () => {
    // The whole sea is high enough and from the right side: the swell in it is neither.
    expect(
      unmetCriteria(hour, {
        waveHeightMeters: { min: 1.5 },
        waveDirectionDegrees: { from: 270, to: 300 },
        primarySwellHeightMeters: { min: 1.5 },
        primarySwellDirectionDegrees: { from: 270, to: 300 },
      }),
    ).toEqual(["primarySwellHeightMeters", "primarySwellDirectionDegrees"]);
    expect(
      unmetCriteria(hour, {
        primarySwellHeightMeters: { min: 1 },
        primarySwellDirectionDegrees: { from: 290, to: 330 },
      }),
    ).toEqual([]);
  });

  it("counts a condition on the swell as not met where no model gives a swell apart", () => {
    const without = { ...hour, primarySwellHeightMeters: null, primarySwellDirectionDegrees: null };

    expect(unmetCriteria(without, { primarySwellHeightMeters: { max: 3 } })).toEqual([
      "primarySwellHeightMeters",
    ]);
    expect(unmetCriteria(without, { primarySwellDirectionDegrees: { from: 0, to: 0 } })).toEqual([
      "primarySwellDirectionDegrees",
    ]);
  });

  it("checks nothing when no criterion is set", () => {
    expect(unmetCriteria(hour, {})).toEqual([]);
  });
});

describe("tideTrendAt", () => {
  const extremes = [
    { time: new Date("2026-10-08T08:18:57Z"), type: "low" as const },
    { time: new Date("2026-10-08T14:23:50Z"), type: "high" as const },
  ];

  it("says falling just before low water, even though the tide is higher an hour later", () => {
    expect(tideTrendAt(new Date("2026-10-08T08:00:00Z"), extremes)).toBe("falling");
  });

  it("says rising between low and high water", () => {
    expect(tideTrendAt(new Date("2026-10-08T09:00:00Z"), extremes)).toBe("rising");
  });

  it("is unknown after the last tide it was given", () => {
    expect(tideTrendAt(new Date("2026-10-08T15:00:00Z"), extremes)).toBeNull();
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
    expect(criteriaSchema.safeParse({ waveHeightMeters: { min: 3, max: 1 } }).success).toBe(false);
  });

  it("rejects a criterion it does not know", () => {
    expect(criteriaSchema.safeParse({ crowdLevel: { max: 3 } }).success).toBe(false);
  });
});

describe("other values of a part", () => {
  it("meets a part when one of its values is met", () => {
    const criteria = {
      waveHeightMeters: { min: 2.5 },
      or: { waveHeightMeters: [{ max: 0.5 }, { min: 1.5, max: 2 }] },
    };

    expect(unmetCriteria(hour, criteria)).toEqual([]);
  });

  it("names a part by its key when none of its values is met", () => {
    const criteria = {
      windDirectionDegrees: { from: 180, to: 270 },
      or: { windDirectionDegrees: [{ from: 300, to: 20 }] },
    };

    expect(unmetCriteria(hour, criteria)).toEqual(["windDirectionDegrees"]);
  });

  it("meets the tide when one of its asks is met whole", () => {
    const criteria = {
      tideCycle: ["low" as const],
      or: { tide: [{ tideCycle: ["mid_rising" as const], tideCoefficients: ["medium" as const] }] },
    };

    expect(unmetCriteria(hour, criteria)).toEqual([]);
    // Half of an ask is not the ask: a mid tide rising of a big tide is neither.
    expect(unmetCriteria({ ...hour, tideCoefficient: 95 }, criteria)).toEqual(["tideCycle"]);
  });
});

describe("the tide's cycle and coefficient", () => {
  it("meets the parts of the cycle and the bands asked for", () => {
    expect(unmetCriteria(hour, { tideCycle: ["mid_rising", "mid_high_rising"] })).toEqual([]);
    expect(unmetCriteria(hour, { tideCycle: ["mid_falling"] })).toEqual(["tideCycle"]);
    expect(unmetCriteria(hour, { tideCoefficients: ["medium"] })).toEqual([]);
    expect(unmetCriteria(hour, { tideCoefficients: ["small", "big"] })).toEqual([
      "tideCoefficients",
    ]);
  });

  it("does not meet them where the tide or its coefficient is unknown", () => {
    const unknown = { ...hour, tideSegment: null, tideCoefficient: null };

    expect(unmetCriteria(unknown, { tideCycle: ["mid_rising"] })).toEqual(["tideCycle"]);
    expect(unmetCriteria(unknown, { tideCoefficients: ["medium"] })).toEqual(["tideCoefficients"]);
  });

  const extremes = [
    { time: new Date("2026-10-08T06:00:00Z"), type: "low" as const, heightMeters: 1 },
    {
      time: new Date("2026-10-08T12:00:00Z"),
      type: "high" as const,
      heightMeters: 4,
      coefficient: 92,
    },
    { time: new Date("2026-10-08T18:00:00Z"), type: "low" as const, heightMeters: 1.2 },
  ];

  it("reads the part of the cycle from the fifth of the tide under way", () => {
    expect(tideSegmentAt(new Date("2026-10-08T07:00:00Z"), 1.2, extremes)).toBe("low");
    expect(tideSegmentAt(new Date("2026-10-08T09:00:00Z"), 2.5, extremes)).toBe("mid_rising");
    expect(tideSegmentAt(new Date("2026-10-08T11:00:00Z"), 3.6, extremes)).toBe("high");
    expect(tideSegmentAt(new Date("2026-10-08T14:00:00Z"), 3, extremes)).toBe("mid_high_falling");
    // Before the first turn it is given, the tide under way is not known.
    expect(tideSegmentAt(new Date("2026-10-08T05:00:00Z"), 1.1, extremes)).toBeNull();
    expect(tideSegmentAt(new Date("2026-10-08T09:00:00Z"), null, extremes)).toBeNull();
  });

  it("gives an hour the coefficient of the nearest high water", () => {
    expect(coefficientAt(new Date("2026-10-08T17:00:00Z"), extremes)).toBe(92);
    expect(coefficientAt(new Date("2026-10-10T17:00:00Z"), extremes)).toBeNull();
    expect(
      coefficientAt(
        new Date("2026-10-08T12:00:00Z"),
        extremes.map((one) => ({ ...one, coefficient: null })),
      ),
    ).toBeNull();
  });
});

describe("askedCriteria", () => {
  it("leaves out what asks nothing, and every word of a set", () => {
    expect(
      askedCriteria({
        waveHeightMeters: {},
        tideCycle: [],
        tideCoefficients: ["small", "medium", "big"],
        windSpeedMetersPerSecond: { max: 5 },
        or: { windSpeedMetersPerSecond: [{}], tide: [{ tideCycle: [] }] },
      }),
    ).toEqual({ windSpeedMetersPerSecond: { max: 5 } });
  });

  it("gives a part whose own value asks nothing its first other value", () => {
    expect(
      askedCriteria({
        waveHeightMeters: {},
        or: { waveHeightMeters: [{ min: 1 }, { min: 3 }], tide: [{ tideCycle: ["high", "low"] }] },
      }),
    ).toEqual({
      waveHeightMeters: { min: 1 },
      tideCycle: ["low", "high"],
      or: { waveHeightMeters: [{ min: 3 }] },
    });
  });
});

describe("criteriaSchema, other values", () => {
  it("takes three other values of a part at most", () => {
    const four = Array.from({ length: 4 }, (_, at) => ({ min: at }));
    expect(criteriaSchema.safeParse({ or: { waveHeightMeters: four } }).success).toBe(false);
    expect(criteriaSchema.safeParse({ or: { waveHeightMeters: four.slice(1) } }).success).toBe(
      true,
    );
  });

  it("refuses a part of the cycle it does not know, or one named twice", () => {
    expect(criteriaSchema.safeParse({ tideCycle: ["slack"] }).success).toBe(false);
    expect(criteriaSchema.safeParse({ tideCycle: ["low", "low"] }).success).toBe(false);
  });
});
