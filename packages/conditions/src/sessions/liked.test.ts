import { describe, expect, it } from "vitest";

import { sessionFigures } from "./figures";
import { arcOf, likedConditions } from "./liked";

const NONE = sessionFigures(null, new Date("2026-10-10T09:00:00Z"), 90);
const session = (rating: number | null, figures: Partial<typeof NONE>) => ({
  rating,
  figures: { ...NONE, ...figures },
});

describe("the sector that holds bearings", () => {
  it("runs clockwise across north, with a margin on each side", () => {
    expect(arcOf([350, 10, 0])).toEqual({ from: 340, to: 20 });
    expect(arcOf([270, 280, 300])).toEqual({ from: 260, to: 310 });
    expect(arcOf([285, 285, 285])).toEqual({ from: 275, to: 295 });
  });

  it("is none of too few bearings, or of bearings spread too wide", () => {
    expect(arcOf([270, 280])).toBeNull();
    expect(arcOf([0, 90, 180])).toBeNull();
    expect(arcOf([0, 120, 240])).toBeNull();
  });
});

describe("what an account likes at a place", () => {
  it("says nothing while fewer than three sessions were liked", () => {
    const some = [
      session(5, { waveHeightMeters: 1.5 }),
      session(4, { waveHeightMeters: 1.2 }),
      session(3, { waveHeightMeters: 0.6 }),
      session(null, { waveHeightMeters: 2 }),
    ];
    expect(likedConditions(some)).toEqual({ rated: 3, liked: 2, criteria: null });
  });

  it("spans the liked sessions, and leaves the others out", () => {
    const liked = likedConditions([
      session(5, {
        waveHeightMeters: 1.52,
        wavePeakPeriodSeconds: 13.4,
        waveDirectionDegrees: 280,
        windSpeedMetersPerSecond: 4.2,
        windDirectionDegrees: 90,
        tideHeightMeters: 2.44,
        tideTrend: "rising",
      }),
      session(4, {
        waveHeightMeters: 1.18,
        wavePeakPeriodSeconds: 11,
        waveDirectionDegrees: 290,
        windSpeedMetersPerSecond: 6.5,
        windDirectionDegrees: 70,
        tideHeightMeters: 3.1,
        tideTrend: "rising",
      }),
      session(4, {
        waveHeightMeters: 1.9,
        wavePeakPeriodSeconds: 15,
        waveDirectionDegrees: 300,
        // A light wind has no bearing worth reading.
        windSpeedMetersPerSecond: 1,
        windDirectionDegrees: 250,
        tideHeightMeters: 2.8,
        tideTrend: "rising",
      }),
      // Rated low: its small waves and its onshore wind widen nothing.
      session(2, {
        waveHeightMeters: 0.4,
        wavePeakPeriodSeconds: 7,
        waveDirectionDegrees: 200,
        windSpeedMetersPerSecond: 12,
        windDirectionDegrees: 270,
        tideHeightMeters: 5,
        tideTrend: "falling",
      }),
    ]);

    expect(liked).toEqual({
      rated: 4,
      liked: 3,
      criteria: {
        waveHeightMeters: { min: 1.1, max: 1.9 },
        // The shortest period that was liked: a longer one is not one to miss.
        wavePeakPeriodSeconds: { min: 11 },
        waveDirectionDegrees: { from: 270, to: 310 },
        // The strongest wind that was liked, and no sector: two bearings are too few.
        windSpeedMetersPerSecond: { max: 7 },
        tideHeightMeters: { min: 2.4, max: 3.1 },
        tideTrend: "rising",
      },
    });
  });

  it("leaves out what too few liked sessions had, and a tide that went both ways", () => {
    const liked = likedConditions([
      session(5, { waveHeightMeters: 1.5, tideTrend: "rising" }),
      session(5, { waveHeightMeters: 1.5, tideTrend: "falling" }),
      session(4, { waveHeightMeters: 1.5, tideTrend: "rising", wavePeakPeriodSeconds: 12 }),
    ]);
    expect(liked.criteria).toEqual({ waveHeightMeters: { min: 1.5, max: 1.5 } });
    // Liked sessions whose conditions were never read say nothing.
    expect(likedConditions([session(5, {}), session(5, {}), session(5, {})])).toEqual({
      rated: 3,
      liked: 3,
      criteria: null,
    });
  });
});
