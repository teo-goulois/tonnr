import { describe, expect, it } from "vitest";

import type { Forecast, Reading } from "../types";
import { modelSamples, periodKindOf, waveEnergy } from "./metrics";

const hour = (peak: number | null): Forecast["hours"][number] => ({
  time: new Date("2026-10-12T12:00:00Z"),
  waveHeightMeters: 2,
  wavePeriodSeconds: 9,
  wavePeakPeriodSeconds: peak,
  waveDirectionDegrees: 280,
  windSpeedMetersPerSecond: 5,
  windGustMetersPerSecond: 8,
  windDirectionDegrees: 90,
  cloudCoverPercent: 40,
  precipitationMillimeters: 0,
  airTemperatureCelsius: 16,
});

const buoy = (periods: Partial<Reading>) =>
  ({
    peakPeriodSeconds: null,
    significantPeriodSeconds: null,
    meanPeriodSeconds: null,
    ...periods,
  }) as Reading;

describe("the energy of a wave", () => {
  it("is the figure surf forecasts print for a height and a peak period", () => {
    expect(waveEnergy(1, 10)).toBeCloseTo(196.1, 1);
    expect(waveEnergy(2, 14)).toBeCloseTo(1537.6, 1);
    expect(waveEnergy(null, 10)).toBeNull();
    expect(waveEnergy(1, null)).toBeNull();
  });
});

describe("the model's samples", () => {
  it("read the period of the peak, and count the energy with it", () => {
    const [sample] = modelSamples([hour(12)]);

    expect(sample).toMatchObject({ height: 2, period: 12, waveDirection: 280 });
    expect(sample?.energy).toBeCloseTo(waveEnergy(2, 12) ?? 0);
  });

  it("read the mean period beside a buoy that gives no peak", () => {
    const [sample] = modelSamples([hour(12)], "mean");

    expect(sample?.period).toBe(9);
    expect(sample?.energy).toBeCloseTo(waveEnergy(2, 9) ?? 0);
  });

  it("read the mean period of a model that has no peak", () => {
    expect(modelSamples([hour(null)])[0]?.period).toBe(9);
  });
});

describe("the kind of a buoy's period", () => {
  it("is the peak when the buoy gives it, and where there is no buoy", () => {
    expect(periodKindOf(buoy({ peakPeriodSeconds: 11, meanPeriodSeconds: 7 }))).toBe("peak");
    expect(periodKindOf(undefined)).toBe("peak");
    expect(periodKindOf(buoy({}))).toBe("peak");
  });

  it("is the mean for a buoy that gives a significant or a mean period alone", () => {
    expect(periodKindOf(buoy({ significantPeriodSeconds: 9 }))).toBe("mean");
    expect(periodKindOf(buoy({ meanPeriodSeconds: 6 }))).toBe("mean");
  });
});
