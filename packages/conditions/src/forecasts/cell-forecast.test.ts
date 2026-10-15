import { describe, expect, it } from "vitest";

import { layWaves } from "./cell-forecast";
import type { FineWaves, Swell } from "./copernicus-waves";
import type { ForecastData } from "./open-meteo";
import { answer } from "./testing";

const AT = Date.UTC(2026, 9, 12, 9);
const HOUR = 3600;

/** What Open-Meteo answers: the waves of one model, and no swell apart. */
function openMeteo(waves?: (seconds: number) => number | null): ForecastData {
  const data = answer(AT, waves);
  const none = data.hours.time.map(() => null);
  return {
    ...data,
    swellModels: [],
    hours: {
      ...data.hours,
      primarySwellHeightMeters: none,
      primarySwellDirectionDegrees: [...none],
    },
  };
}
// 1.5 m of 11 s from 295° at every hour, from ECMWF's model.
const base = openMeteo();
const [start = 0] = base.hours.time;

/** The fine model over the first hours of the forecast, one value an hour. */
function fine(height: (number | null)[], swellHeight = height, from = start): FineWaves {
  const flat = (value: number) => height.map(() => value);
  return {
    model: "nws_ww3",
    point: { latitude: 48.354, longitude: -4.6297 },
    time: height.map((_, index) => from + index * HOUR),
    height,
    peakPeriod: flat(12.5),
    meanPeriod: flat(9.5),
    direction: flat(250),
    swellHeight,
    swellDirection: flat(260),
  };
}

/** The world's swell, a value every three hours from the forecast's first hour. */
function world(height: (number | null)[], direction = height.map(() => 255)): Swell {
  return {
    model: "mfwam",
    point: { latitude: 48.3333, longitude: -4.6667 },
    time: height.map((_, index) => start + index * 3 * HOUR),
    swellHeight: height,
    swellDirection: direction,
  };
}

describe("the fine model laid over a forecast", () => {
  it("gives its own waves to the hours it has, and leaves the others", () => {
    const laid = layWaves(base, fine([0.8, 0.9, 1]), null);

    expect(laid.hours.waveHeightMeters.slice(0, 4)).toEqual([0.8, 0.9, 1, 1.5]);
    expect(laid.hours.wavePeakPeriodSeconds.slice(0, 4)).toEqual([12.5, 12.5, 12.5, 11]);
    expect(laid.hours.wavePeriodSeconds.slice(0, 4)).toEqual([9.5, 9.5, 9.5, 8]);
    expect(laid.hours.waveDirectionDegrees.slice(0, 4)).toEqual([250, 250, 250, 295]);
    // The wind is not the fine model's.
    expect(laid.hours.windSpeedMetersPerSecond).toEqual(base.hours.windSpeedMetersPerSecond);
    expect(laid.hours.time).toEqual(base.hours.time);
  });

  it("lists the models in the order of the hours, each from its first", () => {
    const laid = layWaves(base, fine([0.8, 0.9, 1]), null);

    expect(laid.models).toEqual([
      { id: "nws_ww3", from: start },
      { id: "ecmwf_wam", from: start + 3 * HOUR },
    ]);
    expect(laid.point).toEqual({ latitude: 48.354, longitude: -4.6297 });
  });

  it("keeps the other model's hour where the fine one has none, and says so", () => {
    const laid = layWaves(base, fine([0.8, null, 1]), null);

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
    const laid = layWaves(
      openMeteo(() => null),
      fine([0.8, 0.9]),
      null,
    );

    expect(laid.models).toEqual([{ id: "nws_ww3", from: start }]);
    expect(laid.hours.waveHeightMeters.slice(0, 3)).toEqual([0.8, 0.9, null]);
  });

  it("changes nothing without a store, or when none of their hours is in the forecast", () => {
    expect(layWaves(base, null, null)).toBe(base);
    expect(layWaves(base, fine([0.8, 0.9], [0.5, 0.5], start - 10 * 24 * HOUR), null)).toBe(base);
    expect(layWaves(base, fine([null, null]), world([null, null]))).toBe(base);
  });
});

describe("the swell apart laid over a forecast", () => {
  // A whole sea of 3 m, above every swell of these tests.
  const tall = openMeteo(() => 3);

  it("is the fine model's during its hours, and the world's after", () => {
    const laid = layWaves(tall, fine([0.8, 0.9, 1], [0.5, 0.6, 0.7]), world([2, 2.3, 2.6]));

    // Three hours of the fine model, then the world's: 2.3 m at the fourth hour, and a third of
    // the way to 2.6 m at the fifth.
    expect(laid.hours.primarySwellHeightMeters.slice(0, 5)).toEqual([0.5, 0.6, 0.7, 2.3, 2.4]);
    expect(laid.hours.primarySwellDirectionDegrees.slice(0, 5)).toEqual([260, 260, 260, 255, 255]);
    expect(laid.swellModels).toEqual([
      { id: "nws_ww3", from: start },
      { id: "mfwam", from: start + 3 * HOUR },
    ]);
    // The waves of those later hours stay the other model's.
    expect(laid.hours.waveHeightMeters[3]).toBe(3);
  });

  it("is empty where the fine model has waves and no swell: the world's does not fill in", () => {
    const laid = layWaves(tall, fine([0.8, 0.9, 1], [null, 0.6, null]), world([2, 2.3]));

    expect(laid.hours.primarySwellHeightMeters.slice(0, 4)).toEqual([null, 0.6, null, 2.3]);
    expect(laid.swellModels).toEqual([
      { id: "nws_ww3", from: start + HOUR },
      { id: "mfwam", from: start + 3 * HOUR },
    ]);
  });

  it("goes from one value to the next between two fields, with the bearing of the nearer", () => {
    const laid = layWaves(tall, null, world([1, 1.6, 1.6], [200, 290, 290]));

    expect(laid.hours.primarySwellHeightMeters.slice(0, 4)).toEqual([1, 1.2, 1.4, 1.6]);
    expect(laid.hours.primarySwellDirectionDegrees.slice(0, 4)).toEqual([200, 200, 290, 290]);
    // Nothing else moved: the waves, their model and the grid point are Open-Meteo's.
    expect(laid.hours.waveHeightMeters).toEqual(tall.hours.waveHeightMeters);
    expect(laid.models).toEqual(tall.models);
    expect(laid.point).toEqual(tall.point);
    expect(laid.swellModels).toEqual([{ id: "mfwam", from: start }]);
  });

  it("is empty after the world's last field, and between two fields when one is missing", () => {
    const laid = layWaves(tall, null, world([1, null, 1.6]));

    // The first field, nothing up to the third, the third, and nothing after it.
    expect(laid.hours.primarySwellHeightMeters.slice(0, 8)).toEqual([
      1,
      null,
      null,
      null,
      null,
      null,
      1.6,
      null,
    ]);
  });

  it("is never given above the whole sea of its hour, which is another model's", () => {
    // Waves of 1.5 m from one model, and a swell of 2 m from the other.
    const laid = layWaves(base, null, world([2, 1.2]));

    expect(laid.hours.primarySwellHeightMeters.slice(0, 4)).toEqual([1.5, 1.5, 1.47, 1.2]);
    expect(laid.hours.waveHeightMeters.slice(0, 4)).toEqual([1.5, 1.5, 1.5, 1.5]);
  });
});

describe("a forecast that came with its swell from the files", () => {
  // MFWAM's swell of 1.2 m at every hour, as the files give it, with ECMWF's peak period.
  const withSwell: ForecastData = {
    ...answer(AT),
    peakModels: [{ id: "ecmwf_wam025", from: start }],
  };

  it("keeps that swell where the fine model does not answer, and names its models", () => {
    const laid = layWaves(withSwell, fine([0.8, 0.9], [0.5, 0.6]), null);
    expect(laid.hours.primarySwellHeightMeters.slice(0, 3)).toEqual([0.5, 0.6, 1.2]);
    expect(laid.hours.primarySwellDirectionDegrees.slice(0, 3)).toEqual([260, 260, 290]);
    expect(laid.swellModels).toEqual([
      { id: "nws_ww3", from: start },
      { id: "mfwam", from: start + 2 * HOUR },
    ]);
    // The peak period is the fine model's in its hours, and ECMWF's after.
    expect(laid.hours.wavePeakPeriodSeconds.slice(0, 3)).toEqual([12.5, 12.5, 11]);
    expect(laid.peakModels).toEqual([
      { id: "nws_ww3", from: start },
      { id: "ecmwf_wam025", from: start + 2 * HOUR },
    ]);
  });
});
