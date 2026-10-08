import { describe, expect, it } from "vitest";

import { mergeReadings } from "./store";

const AT_1000 = new Date("2026-10-08T10:00:00Z");
const AT_1100 = new Date("2026-10-08T11:00:00Z");

describe("mergeReadings", () => {
  it("leaves alone the readings of different stations and moments", () => {
    const readings = [
      { providerStationId: "one", observedAt: AT_1000, significantHeightM: 1 },
      { providerStationId: "one", observedAt: AT_1100, significantHeightM: 2 },
      { providerStationId: "two", observedAt: AT_1000, significantHeightM: 3, validated: true },
    ];

    expect(mergeReadings(readings)).toEqual(readings);
  });

  it("makes one reading of two that complete each other", () => {
    const merged = mergeReadings([
      { providerStationId: "one", observedAt: AT_1000, windSpeedMs: 7, windDirectionDeg: 280 },
      {
        providerStationId: "one",
        observedAt: new Date(AT_1000),
        significantHeightM: 2,
        peakPeriodS: 10,
      },
    ]);

    expect(merged).toEqual([
      {
        providerStationId: "one",
        observedAt: AT_1000,
        windSpeedMs: 7,
        windDirectionDeg: 280,
        significantHeightM: 2,
        peakPeriodS: 10,
        validated: false,
      },
    ]);
  });

  it("keeps the first value when two readings disagree, and fills what the first lacked", () => {
    const merged = mergeReadings([
      { providerStationId: "one", observedAt: AT_1000, significantHeightM: 2, peakPeriodS: null },
      { providerStationId: "one", observedAt: AT_1000, significantHeightM: 8, peakPeriodS: 10 },
    ]);

    expect(merged).toMatchObject([{ significantHeightM: 2, peakPeriodS: 10 }]);
  });

  it("calls the result validated only when every reading it took a value from was", () => {
    const height = { providerStationId: "one", observedAt: AT_1000, significantHeightM: 2 };
    const period = { providerStationId: "one", observedAt: AT_1000, peakPeriodS: 10 };
    const validated = (first: boolean | undefined, second: boolean | undefined) =>
      mergeReadings([
        { ...height, validated: first },
        { ...period, validated: second },
      ])[0]?.validated;

    expect(validated(true, true)).toBe(true);
    expect(validated(true, false)).toBe(false);
    expect(validated(false, true)).toBe(false);
    expect(validated(true, undefined)).toBe(false);
  });

  it("leaves the validated mark alone when the second reading brings nothing", () => {
    const height = { providerStationId: "one", observedAt: AT_1000, significantHeightM: 2 };
    const merged = mergeReadings([
      { ...height, validated: true },
      { ...height, significantHeightM: 8, validated: false },
    ]);

    expect(merged).toEqual([{ ...height, validated: true }]);
  });

  it("does not change the readings it was given", () => {
    const first = { providerStationId: "one", observedAt: AT_1000, significantHeightM: 2 };
    mergeReadings([first, { ...first, peakPeriodS: 10 }]);

    expect(first).toEqual({ providerStationId: "one", observedAt: AT_1000, significantHeightM: 2 });
  });
});
