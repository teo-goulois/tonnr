import { describe, expect, it } from "vitest";

import { overlayWaves } from "./cell-forecast";
import type { FineWaves } from "./copernicus-waves";
import { answer } from "./testing";

const AT = Date.UTC(2026, 9, 12, 9);
// What Open-Meteo answered: 1.5 m of 11 s from 295° at every hour, from ECMWF's model.
const base = answer(AT);
const [start = 0] = base.hours.time;

/** The fine model over the first hours of the forecast, one value an hour. */
function fine(height: (number | null)[], from = start): FineWaves {
  const flat = (value: number) => height.map(() => value);
  return {
    model: "nws_ww3",
    point: { latitude: 48.354, longitude: -4.6297 },
    time: height.map((_, index) => from + index * 3600),
    height,
    peakPeriod: flat(12.5),
    meanPeriod: flat(9.5),
    direction: flat(250),
  };
}

describe("the fine model laid over a forecast", () => {
  it("gives its own waves to the hours it has, and leaves the others", () => {
    const laid = overlayWaves(base, fine([0.8, 0.9, 1]));

    expect(laid.hours.waveHeightMeters.slice(0, 4)).toEqual([0.8, 0.9, 1, 1.5]);
    expect(laid.hours.wavePeakPeriodSeconds.slice(0, 4)).toEqual([12.5, 12.5, 12.5, 11]);
    expect(laid.hours.wavePeriodSeconds.slice(0, 4)).toEqual([9.5, 9.5, 9.5, 8]);
    expect(laid.hours.waveDirectionDegrees.slice(0, 4)).toEqual([250, 250, 250, 295]);
    // The wind is not the fine model's.
    expect(laid.hours.windSpeedMetersPerSecond).toEqual(base.hours.windSpeedMetersPerSecond);
    expect(laid.hours.time).toEqual(base.hours.time);
  });

  it("lists the models in the order of the hours, each from its first", () => {
    const laid = overlayWaves(base, fine([0.8, 0.9, 1]));

    expect(laid.models).toEqual([
      { id: "nws_ww3", from: start },
      { id: "ecmwf_wam", from: start + 3 * 3600 },
    ]);
    expect(laid.point).toEqual({ latitude: 48.354, longitude: -4.6297 });
  });

  it("keeps the other model's hour where the fine one has none, and says so", () => {
    const laid = overlayWaves(base, fine([0.8, null, 1]));

    expect(laid.hours.waveHeightMeters.slice(0, 3)).toEqual([0.8, 1.5, 1]);
    expect(laid.hours.wavePeakPeriodSeconds.slice(0, 3)).toEqual([12.5, 11, 12.5]);
    expect(laid.models.map((model) => model.id)).toEqual([
      "nws_ww3",
      "ecmwf_wam",
      "nws_ww3",
      "ecmwf_wam",
    ]);
  });

  it("is the fine model alone where the other has no sea", () => {
    const land = answer(AT, () => null);
    const laid = overlayWaves(land, fine([0.8, 0.9]));

    expect(laid.models).toEqual([{ id: "nws_ww3", from: start }]);
    expect(laid.hours.waveHeightMeters.slice(0, 3)).toEqual([0.8, 0.9, null]);
  });

  it("changes nothing without the fine model, or when none of its hours is in the forecast", () => {
    expect(overlayWaves(base, null)).toBe(base);
    expect(overlayWaves(base, fine([0.8, 0.9], start - 10 * 24 * 3600))).toBe(base);
    expect(overlayWaves(base, fine([null, null]))).toBe(base);
  });
});
