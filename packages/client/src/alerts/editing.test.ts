import { describe, expect, it } from "vitest";

import type { AlertCriteria, AlertPreview } from "../viewer/types";
import {
  askedFiguresOf,
  hourIn,
  isSetValue,
  longestFitting,
  othersOf,
  pieceFigures,
  tideAt,
  tideLastsOf,
  valueAt,
  weekDays,
  weekStateOf,
  withValue,
} from "./editing";

type Tried = AlertPreview["spots"][number];
type Hour = Tried["hours"][number];

const at = (time: string) => new Date(`2026-10-15T${time}:00Z`);

describe("the values of a part", () => {
  const criteria: AlertCriteria = {
    waveHeightMeters: { min: 1, max: 2 },
    or: { waveHeightMeters: [{ min: 3 }], tide: [{ tideCycle: ["high"] }] },
    tideCycle: ["low"],
  };

  it("reads its own value first, then its others", () => {
    expect(valueAt(criteria, "waveHeightMeters", 0)).toEqual({ min: 1, max: 2 });
    expect(valueAt(criteria, "waveHeightMeters", 1)).toEqual({ min: 3 });
    expect(valueAt(criteria, "waveHeightMeters", 2)).toBeUndefined();
    expect(tideAt(criteria, 0).tideCycle).toEqual(["low"]);
    expect(tideAt(criteria, 1)).toEqual({ tideCycle: ["high"] });
    expect(tideAt(criteria, 2)).toEqual({});
    expect(othersOf(criteria, "waveHeightMeters")).toBe(1);
    expect(othersOf(criteria, "windDirectionDegrees")).toBe(0);
  });

  it("says whether a value asks something", () => {
    expect(isSetValue(criteria, "waveHeightMeters", 0)).toBe(true);
    expect(isSetValue({ waveHeightMeters: {} }, "waveHeightMeters", 0)).toBe(false);
    expect(
      isSetValue({ windDirectionDegrees: { from: 0, to: 90 } }, "windDirectionDegrees", 0),
    ).toBe(true);
    expect(isSetValue(criteria, "tide", 1)).toBe(true);
    expect(isSetValue({}, "tide", 0)).toBe(false);
  });

  it("leaves the whole part asking nothing when its own value is set to nothing", () => {
    const next = withValue(criteria, "waveHeightMeters", 0, undefined);

    expect(next.waveHeightMeters).toBeUndefined();
    expect(next.or?.waveHeightMeters).toBeUndefined();
    expect(next.or?.tide).toEqual([{ tideCycle: ["high"] }]);
  });

  it("keeps a value that is being moved in its place, and its others with it", () => {
    const own = withValue(criteria, "waveHeightMeters", 0, undefined, true);
    expect(own.waveHeightMeters).toBeUndefined();
    expect(own.or?.waveHeightMeters).toEqual([{ min: 3 }]);

    const other = withValue(criteria, "waveHeightMeters", 1, undefined, true);
    expect(other.or?.waveHeightMeters).toEqual([{}]);
  });

  it("takes an other value away, or sets it", () => {
    expect(withValue(criteria, "waveHeightMeters", 1, undefined).or?.waveHeightMeters).toEqual([]);
    expect(withValue(criteria, "waveHeightMeters", 2, { max: 1 }).or?.waveHeightMeters).toEqual([
      { min: 3 },
      { max: 1 },
    ]);
  });

  it("sets the tide's own ask whole, and keeps its others", () => {
    const next = withValue(criteria, "tide", 0, {
      tideCycle: ["mid_rising"],
      tideCoefficients: ["big"],
    });

    expect(next.tideCycle).toEqual(["mid_rising"]);
    expect(next.tideCoefficients).toEqual(["big"]);
    expect(next.or?.tide).toEqual([{ tideCycle: ["high"] }]);
    expect(withValue(criteria, "tide", 0, undefined).tideCycle).toBeUndefined();
  });
});

describe("how long the tide asked lasts", () => {
  // A tide from low water at 00:00 to high at 06:00 and low again at 12:00, read every half hour.
  const extremes = [
    { time: at("00:00"), type: "low" as const, heightMeters: 0 },
    { time: at("06:00"), type: "high" as const, heightMeters: 4 },
    { time: at("12:00"), type: "low" as const, heightMeters: 0 },
    { time: at("18:00"), type: "high" as const, heightMeters: 4 },
  ];
  const tide = Array.from({ length: 36 }, (_, step) => {
    const minutes = step * 30;
    const time = new Date(at("00:00").getTime() + minutes * 60_000);
    const value = 2 - 2 * Math.cos((Math.PI * minutes) / 360);
    return { time, value };
  });

  it("is the longest run of the parts asked, to the quarter hour", () => {
    const lasts = tideLastsOf([{ tideCycle: ["high"] }], tide, extremes);

    expect(lasts).not.toBeNull();
    expect(lasts! % 15).toBe(0);
    expect(lasts!).toBeGreaterThan(60);
    expect(lasts!).toBeLessThan(4 * 60);
  });

  it("is nothing without a part of the cycle, or without a curve", () => {
    expect(tideLastsOf([{ tideCoefficients: ["big"] }], tide, extremes)).toBeNull();
    expect(tideLastsOf([{ tideCycle: ["high"] }], tide.slice(0, 1), extremes)).toBeNull();
  });

  it("offers the longest shortest window that fits", () => {
    expect(longestFitting(150)).toBe(2);
    expect(longestFitting(400)).toBe(6);
    expect(longestFitting(30)).toBeUndefined();
    expect(longestFitting(null)).toBeUndefined();
  });
});

describe("what the week is said in", () => {
  it("names the figures the conditions ask", () => {
    expect(
      askedFiguresOf({
        waveHeightMeters: { min: 1 },
        or: { windSpeedMetersPerSecond: [{ max: 5 }], tide: [{ tideCoefficients: ["big"] }] },
      }),
    ).toEqual({
      waves: true,
      period: false,
      swell: false,
      wind: true,
      tide: false,
      coefficient: true,
    });
  });

  it("says where the week stands", () => {
    const tried = (hasSea: boolean) => ({ hasSea }) as Tried;

    expect(weekStateOf({ asksSomething: false, failed: true, tried: [] })).toBe("nothing");
    expect(weekStateOf({ asksSomething: true, failed: true, tried: [] })).toBe("failed");
    expect(weekStateOf({ asksSomething: true, failed: false, tried: [] })).toBe("pending");
    expect(weekStateOf({ asksSomething: true, failed: false, tried: [tried(false)] })).toBe(
      "noSea",
    );
    expect(weekStateOf({ asksSomething: true, failed: false, tried: [tried(true)] })).toBe("ready");
  });

  it("reads the hour of a moment in a zone", () => {
    expect(hourIn(at("10:30"), "UTC")).toBe(10.5);
    expect(hourIn(at("10:30"), "Europe/Paris")).toBe(12.5);
  });

  it("puts each window on the day it starts", () => {
    const dayOf = (time: Date) => time.toISOString().slice(0, 10);
    const days = weekDays(
      [{ start: at("08:00") }, { start: new Date("2026-10-17T07:00:00Z") }],
      at("06:00").getTime(),
      "UTC",
      dayOf,
    );

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.pieces.length)).toEqual([1, 0, 1, 0, 0, 0, 0]);
  });

  it("writes a window in the figures asked, from the least to the most", () => {
    const hour = (time: string, waves: number): Hour =>
      ({
        time: at(time),
        waveHeightMeters: waves,
        wavePeakPeriodSeconds: 11,
        windSpeedMetersPerSecond: 3,
        primarySwellHeightMeters: null,
        tideSegment: "high",
        tideCoefficient: 95,
      }) as Hour;
    const piece = {
      start: at("08:00"),
      end: at("10:00"),
      spotId: "one",
      hours: [hour("07:00", 3), hour("08:00", 1.2), hour("09:00", 1.6), hour("10:00", 3)],
    };
    const write = {
      height: (meters: number) => `${meters} m`,
      seconds: (seconds: number) => `${seconds} s`,
      swell: (meters: number) => `swell ${meters} m`,
      wind: (speed: number) => `${speed} m/s`,
      segment: (segment: string) => segment,
      coefficient: (value: number) => `coef ${value}`,
    };

    expect(
      pieceFigures(
        piece,
        { waves: true, period: true, swell: true, wind: false, tide: true, coefficient: true },
        write,
      ),
    ).toEqual(["1.2 m → 1.6 m", "11 s", "high", "coef 95"]);
  });
});
