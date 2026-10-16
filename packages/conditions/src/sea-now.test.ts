import { describe, expect, it } from "vitest";

import {
  type SeaHour,
  nearPoints,
  tideNowOf,
  tideStageOf,
  verdictOf,
  windAtShoreOf,
} from "./sea-now";

// The hour laid against a break's own words: decision 059.

const HOUR: SeaHour = {
  time: new Date(Date.UTC(2026, 9, 16, 9)),
  waveHeightMeters: 1.4,
  wavePeriodSeconds: 9,
  wavePeakPeriodSeconds: 12,
  waveDirectionDegrees: 300,
  primarySwellHeightMeters: 1.1,
  primarySwellDirectionDegrees: 305,
  windSpeedMetersPerSecond: 4,
  windGustMetersPerSecond: 6,
  windDirectionDegrees: 190,
  cloudCoverPercent: 20,
  precipitationMillimeters: 0,
  airTemperatureCelsius: 15,
};

// Mundaka, as the catalogue says it: a left that likes a swell from the north-west, a wind from
// the south-west, a low tide, and waves from 1.8 to 4.6 m.
const MUNDAKA = {
  breakTypes: ["rivermouth" as const],
  waveDirections: ["left" as const],
  bottomTypes: ["sand" as const],
  abilityLevels: ["advanced" as const],
  boardTypes: ["shortboard" as const],
  bestSeasons: ["autumn" as const],
  bestTides: ["low" as const, "mid_low" as const],
  bestSwellDirections: ["WNW" as const, "NW" as const],
  bestWindDirections: ["S" as const, "SSW" as const, "SW" as const],
  offshoreDirectionDegrees: 225,
  waveSizeMeters: { min: 1.8, max: 4.6 },
};

const EXTREMES = [
  { type: "low" as const, heightMeters: 1.2 },
  { type: "high" as const, heightMeters: 3.6 },
];

describe("a bearing near the points a break names", () => {
  it("is within one point of the sixteen, round the north", () => {
    expect(nearPoints(300, ["NW"])).toBe(true);
    expect(nearPoints(290, ["NW"])).toBe(true);
    expect(nearPoints(270, ["NW"])).toBe(false);
    expect(nearPoints(5, ["NNW"])).toBe(true);
    expect(nearPoints(350, ["NNE"])).toBe(true);
    expect(nearPoints(90, ["nowhere"])).toBe(false);
  });
});

describe("the stage of the tide", () => {
  it("is a fifth of the way from the next low to the next high water", () => {
    expect(tideStageOf(1.2, EXTREMES)).toBe("low");
    expect(tideStageOf(1.6, EXTREMES)).toBe("low");
    expect(tideStageOf(2.0, EXTREMES)).toBe("mid_low");
    expect(tideStageOf(2.4, EXTREMES)).toBe("mid");
    expect(tideStageOf(3.0, EXTREMES)).toBe("mid_high");
    expect(tideStageOf(3.6, EXTREMES)).toBe("high");
    expect(tideStageOf(5, EXTREMES)).toBe("high");
  });

  it("is unknown without both extremes", () => {
    expect(tideStageOf(2, [EXTREMES[0]!])).toBeNull();
    expect(tideStageOf(2, [])).toBeNull();
  });
});

describe("the wind at the shore", () => {
  it("is read from the break's offshore direction", () => {
    expect(windAtShoreOf(HOUR, MUNDAKA)).toBe("cross_offshore");
    expect(windAtShoreOf({ ...HOUR, windDirectionDegrees: 225 }, MUNDAKA)).toBe("offshore");
    expect(windAtShoreOf(HOUR, { ...MUNDAKA, offshoreDirectionDegrees: null })).toBeNull();
  });
});

describe("the verdict", () => {
  it("names what fits the break and what does not, in order", () => {
    const tide = { now: { heightMeters: 1.5, trend: "rising" as const }, extremes: EXTREMES };
    expect(verdictOf(MUNDAKA, HOUR, tide)).toEqual({
      fits: ["swell", "wind", "tide"],
      off: ["size"],
    });
    expect(
      verdictOf(
        MUNDAKA,
        { ...HOUR, waveHeightMeters: 2.5, waveDirectionDegrees: 20, windDirectionDegrees: 40 },
        { now: { heightMeters: 3.5, trend: "falling" }, extremes: EXTREMES },
      ),
    ).toEqual({ fits: ["size"], off: ["swell", "wind", "tide"] });
  });

  it("judges a wind by the shore alone when the break names no wind, and by its name alone when it knows no shore", () => {
    const bare = { ...MUNDAKA, bestWindDirections: null };
    expect(verdictOf(bare, { ...HOUR, windDirectionDegrees: 225 }, null).fits).toContain("wind");
    const blind = { ...MUNDAKA, offshoreDirectionDegrees: null };
    expect(verdictOf(blind, { ...HOUR, windDirectionDegrees: 190 }, null).fits).toContain("wind");
    const deaf = verdictOf({ ...bare, offshoreDirectionDegrees: null }, HOUR, null);
    expect(deaf.fits).not.toContain("wind");
    expect(deaf.off).not.toContain("wind");
  });

  it("judges nothing the break says nothing of, nor what the hour has no figure for", () => {
    const silent = {
      ...MUNDAKA,
      bestTides: null,
      bestSwellDirections: null,
      bestWindDirections: null,
      offshoreDirectionDegrees: null,
      waveSizeMeters: null,
    };
    expect(verdictOf(silent, HOUR, null)).toEqual({ fits: [], off: [] });
    expect(
      verdictOf(MUNDAKA, { ...HOUR, waveHeightMeters: null, waveDirectionDegrees: null }, null),
    ).toEqual({ fits: ["wind"], off: [] });
  });
});

describe("the tide now, from its timeline", () => {
  const at = (hour: number, heightMeters: number) => ({
    time: new Date(Date.UTC(2026, 9, 16, hour)),
    heightMeters,
  });
  const timeline = [at(8, 2), at(9, 3), at(10, 3.5), at(11, 3)];

  it("is read between the two heights around the moment, and says which way it goes", () => {
    const now = Date.UTC(2026, 9, 16, 9, 30);
    expect(tideNowOf(timeline, now)).toEqual({ heightMeters: 3.25, trend: "rising" });
    expect(tideNowOf(timeline, Date.UTC(2026, 9, 16, 10, 15))).toEqual({
      heightMeters: 3.375,
      trend: "falling",
    });
  });

  it("is unknown where the timeline does not reach", () => {
    expect(tideNowOf(timeline, Date.UTC(2026, 9, 16, 7))).toBeNull();
    expect(tideNowOf(timeline, Date.UTC(2026, 9, 16, 12))).toBeNull();
    expect(tideNowOf([at(6, 1), at(12, 4)], Date.UTC(2026, 9, 16, 9))).toBeNull();
    expect(tideNowOf([], Date.UTC(2026, 9, 16, 9))).toBeNull();
  });
});
