import { describe, expect, it } from "vitest";

import { brestCoefficients, usesCoefficients } from "./coefficient";
import { predictTideExtremes } from "./tide-prediction";

describe("brestCoefficients", () => {
  it("gives the published coefficients within 2", () => {
    // The tables printed 87 and 91 on 9 October 2026, from a spring tide to come.
    const coefficients = brestCoefficients({
      start: new Date("2026-10-08T22:00:00Z"),
      end: new Date("2026-10-09T22:00:00Z"),
    }).map((tide) => tide.coefficient);

    expect(coefficients).toHaveLength(2);
    for (const [index, published] of [87, 91].entries()) {
      expect(Math.abs((coefficients[index] ?? 0) - published)).toBeLessThanOrEqual(2);
    }
  });
});

describe("usesCoefficients", () => {
  it("keeps the Atlantic and the Channel of France and Spain", () => {
    expect(usesCoefficients({ country: "France", latitude: 43.5, longitude: -1.5 })).toBe(true);
    expect(usesCoefficients({ country: "France", latitude: 51.05, longitude: 2.37 })).toBe(true);
    expect(usesCoefficients({ country: "Spain", latitude: 43.46, longitude: -3.8 })).toBe(true);
    expect(usesCoefficients({ country: "Spain", latitude: 36.5, longitude: -6.3 })).toBe(true);
  });

  it("leaves out the Mediterranean and other countries", () => {
    expect(usesCoefficients({ country: "France", latitude: 43.3, longitude: 5.36 })).toBe(false);
    expect(usesCoefficients({ country: "Spain", latitude: 41.38, longitude: 2.18 })).toBe(false);
    expect(usesCoefficients({ country: "Spain", latitude: 36.7, longitude: -4.4 })).toBe(false);
    expect(usesCoefficients({ country: "Portugal", latitude: 38.7, longitude: -9.1 })).toBe(false);
  });
});

describe("predictTideExtremes", () => {
  const day = { start: new Date("2026-10-08T22:00:00Z"), end: new Date("2026-10-09T22:00:00Z") };

  it("gives a high water in Brittany its coefficient, and a low water none", () => {
    const prediction = predictTideExtremes({ latitude: 48.383, longitude: -4.495, ...day });
    const highs = prediction?.extremes.filter((extreme) => extreme.type === "high") ?? [];

    expect(highs.length).toBe(2);
    for (const high of highs) expect(high.coefficient).toBeGreaterThan(80);
    for (const extreme of prediction?.extremes ?? []) {
      if (extreme.type === "low") expect(extreme.coefficient).toBeNull();
    }
  });

  it("gives no coefficient where the tables print none", () => {
    // Cascais, by Lisbon.
    const prediction = predictTideExtremes({ latitude: 38.7, longitude: -9.1, ...day });

    expect(prediction?.extremes.length).toBeGreaterThan(0);
    for (const extreme of prediction?.extremes ?? []) expect(extreme.coefficient).toBeNull();
  });
});
