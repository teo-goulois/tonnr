import { UpstreamError } from "@repo/upstream";
import { Effect, Result } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BudgetSpent,
  buildForecast,
  cellOf,
  fetchForecast,
  forecastBudget,
  forecastData,
  ForecastFormatError,
} from "./open-meteo";

// 2026-10-08 00:00, 01:00 and 02:00 UTC.
const times = [1791417600, 1791421200, 1791424800];

function marine(waveHeight: (number | null)[], time = times) {
  return {
    latitude: 43.625,
    longitude: -1.4583282,
    hourly: {
      time: [...time],
      wave_height: waveHeight,
      wave_period: [7.25, 7.45, 7.5],
      wave_direction: [311, 312, 313],
      swell_wave_height: [1.96, 2.16, 2.2],
      swell_wave_period: [6.9, 6.95, 7],
      swell_wave_direction: [301, 305, 306],
      wind_wave_height: [1.2, 1.1, 1],
      wind_wave_period: [4.2, 4.1, 4],
      wind_wave_direction: [325, 327, 328],
    },
  };
}

function weather(time = times) {
  return {
    hourly: {
      time: [...time],
      wind_speed_10m: [14.73, 12.1, null],
      wind_gusts_10m: [16.0, 15.2, null],
      wind_direction_10m: [312, 310, null],
      cloud_cover: [75, 100, null],
      precipitation: [0, 0.4, null],
      temperature_2m: [16.2, 15.8, null],
    },
  };
}

describe("buildForecast", () => {
  it("joins waves, wind and weather hour by hour, on the marine model's grid point", () => {
    const forecast = buildForecast(marine([2.34, 2.48, null]), weather());
    if (forecast instanceof ForecastFormatError) throw forecast;

    expect(forecast.point).toEqual({ latitude: 43.625, longitude: -1.4583282 });
    expect(forecast.hours).toEqual({
      time: times,
      waveHeightMeters: [2.34, 2.48, null],
      wavePeriodSeconds: [7.25, 7.45, 7.5],
      waveDirectionDegrees: [311, 312, 313],
      swellHeightMeters: [1.96, 2.16, 2.2],
      swellPeriodSeconds: [6.9, 6.95, 7],
      swellDirectionDegrees: [301, 305, 306],
      windWaveHeightMeters: [1.2, 1.1, 1],
      windWavePeriodSeconds: [4.2, 4.1, 4],
      windWaveDirectionDegrees: [325, 327, 328],
      windSpeedMetersPerSecond: [14.73, 12.1, null],
      windGustMetersPerSecond: [16, 15.2, null],
      windDirectionDegrees: [312, 310, null],
      cloudCoverPercent: [75, 100, null],
      precipitationMillimeters: [0, 0.4, null],
      airTemperatureCelsius: [16.2, 15.8, null],
    });
    // What is kept is read back through the same shape.
    expect(forecastData.parse(JSON.parse(JSON.stringify(forecast)))).toEqual(forecast);
  });

  it("keeps a point with no sea nearby as it was answered", () => {
    const forecast = buildForecast(marine([null, null, null]), weather());
    if (forecast instanceof ForecastFormatError) throw forecast;

    expect(forecast.hours.waveHeightMeters).toEqual([null, null, null]);
  });

  it("refuses two answers that do not cover the same hours", () => {
    // The weather was asked after midnight, and starts a day later.
    const later = times.map((time) => time + 24 * 3600);
    expect(buildForecast(marine([2.34, 2.48, 2.5]), weather(later))).toBeInstanceOf(
      ForecastFormatError,
    );

    const shorter = weather();
    for (const series of Object.values(shorter.hourly)) series.pop();
    expect(buildForecast(marine([2.34, 2.48, 2.5]), shorter)).toBeInstanceOf(ForecastFormatError);
  });

  it("refuses hours that do not follow one another", () => {
    const gap = [times[0] ?? 0, times[1] ?? 0, (times[2] ?? 0) + 3600];

    expect(buildForecast(marine([2.34, 2.48, 2.5], gap), weather(gap))).toBeInstanceOf(
      ForecastFormatError,
    );
  });

  it("reports series that do not have one value per hour", () => {
    const short = marine([2.34, 2.48, 2.5]);
    short.hourly.wave_period = [];

    expect(buildForecast(short, weather())).toBeInstanceOf(ForecastFormatError);
    expect(buildForecast(marine([]), weather())).toBeInstanceOf(ForecastFormatError);
  });

  it("reports a time that is not a real moment", () => {
    const broken = marine([2.34, 2.48, 2.5], [1e300, times[1] ?? 0, times[2] ?? 0]);

    expect(buildForecast(broken, weather())).toBeInstanceOf(ForecastFormatError);
  });

  it("reports an answer that changed shape", () => {
    const changed = { latitude: 43.6, longitude: -1.4, hourly: { time: times } };

    expect(buildForecast(changed, weather())).toBeInstanceOf(ForecastFormatError);
  });
});

describe("what the instance lets itself ask", () => {
  it("is counted by the day for one share, and by the hour and the minute for both", () => {
    expect(forecastBudget("people")).toEqual([
      { bucket: "day:people", span: "day", limit: 5500 },
      { bucket: "hour", span: "hour", limit: 4000 },
      { bucket: "minute", span: "minute", limit: 480 },
    ]);
    expect(forecastBudget("alerts")[0]).toEqual({ bucket: "day:alerts", span: "day", limit: 2500 });
    // Under what the free tier allows: 10,000 a day, 5,000 an hour, 600 a minute.
    const day = forecastBudget("people")[0].limit + forecastBudget("alerts")[0].limit;
    expect(
      [day, 4000, 480].map((limit, index) => limit <= [10_000, 5000, 600][index]! * 0.8),
    ).toEqual([true, true, true]);
  });
});

describe("fetchForecast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cell = cellOf({ latitude: 43.63, longitude: -1.46 });
  const answers = { marine: marine([2.34, 2.48, 2.5]), weather: weather() };

  /** A provider in place of the network: it answers each request with the next of its statuses. */
  function provider(statuses: { marine?: number[]; weather?: number[] } = {}) {
    const asked: URL[] = [];
    const left = { marine: [...(statuses.marine ?? [])], weather: [...(statuses.weather ?? [])] };
    vi.stubGlobal("fetch", async (address: string) => {
      const url = new URL(address);
      asked.push(url);
      const which = url.host.startsWith("marine") ? "marine" : "weather";
      const status = left[which].shift() ?? 200;
      return status === 200 ? Response.json(answers[which]) : new Response("no", { status });
    });
    return asked;
  }
  function counted(budget = Infinity) {
    const seen = { spent: 0 };
    const spend = Effect.suspend(() => {
      if (seen.spent >= budget) return Effect.fail(new BudgetSpent());
      seen.spent += 1;
      return Effect.void;
    });
    return { seen, spend };
  }
  const run = <Value, Failure>(effect: Effect.Effect<Value, Failure>) =>
    Effect.runPromise(Effect.result(effect));

  it("asks for the waves and the wind of the cell, over the span that is kept, and counts both", async () => {
    const asked = provider();
    const { seen, spend } = counted();

    const result = await run(fetchForecast(cell, spend));

    expect(Result.isSuccess(result) && result.success.hours.time).toEqual(times);
    expect(seen.spent).toBe(2);
    expect(asked.map((url) => url.host).sort()).toEqual([
      "api.open-meteo.com",
      "marine-api.open-meteo.com",
    ]);
    for (const url of asked) {
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        latitude: "43.65",
        longitude: "-1.45",
        forecast_days: "8",
        past_days: "2",
        timeformat: "unixtime",
        timezone: "GMT",
      });
    }
  });

  it("tries a request that failed once more, and counts it again", async () => {
    const asked = provider({ marine: [503] });
    const { seen, spend } = counted();

    const result = await run(fetchForecast(cell, spend));

    expect(Result.isSuccess(result)).toBe(true);
    expect([asked.length, seen.spent]).toEqual([3, 3]);
  });

  it("gives up a request that failed twice", async () => {
    const asked = provider({ marine: [503, 502] });
    const { seen, spend } = counted();

    const result = await run(fetchForecast(cell, spend));

    expect(Result.isFailure(result) && result.failure).toMatchObject({
      _tag: "UpstreamError",
      status: 502,
    });
    expect([asked.length, seen.spent]).toEqual([3, 3]);
  });

  it("does not ask again a provider that says the instance asks too much", async () => {
    const asked = provider({ marine: [429], weather: [429] });
    const { seen, spend } = counted();

    const result = await run(fetchForecast(cell, spend));

    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(UpstreamError);
    expect(asked.length).toBeLessThanOrEqual(2);
    expect(seen.spent).toBe(asked.length);
  });

  it("sends nothing that the budget refuses, and does not ask the budget again", async () => {
    const asked = provider();
    const none = counted(0);
    expect(Result.isFailure(await run(fetchForecast(cell, none.spend)))).toBe(true);
    expect(asked).toHaveLength(0);
  });

  it("gives up a second try that the budget refuses", async () => {
    // Both requests are let out, the waves' fails, and its second try is one too many.
    const asked = provider({ marine: [503, 200] });
    const two = counted(2);

    const result = await run(fetchForecast(cell, two.spend));

    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(BudgetSpent);
    expect([asked.length, two.seen.spent]).toEqual([2, 2]);
  });

  it("counts each request once when both fail together", async () => {
    const asked = provider({ marine: [503, 503], weather: [500, 500] });
    const { seen, spend } = counted();

    const result = await run(fetchForecast(cell, spend));

    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(UpstreamError);
    // The first of the two to fail twice ends the other: three or four requests, each counted.
    expect(asked.length).toBeGreaterThanOrEqual(3);
    expect(asked.length).toBeLessThanOrEqual(4);
    expect(seen.spent).toBe(asked.length);
  });
});
