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
      wave_peak_period: [9.9, 10.05, 10.2] as (number | null)[],
      wave_direction: [311, 312, 313],
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
    const forecast = buildForecast("ecmwf_wam", marine([2.34, 2.48, null]), weather());
    if (forecast instanceof ForecastFormatError) throw forecast;

    expect(forecast.point).toEqual({ latitude: 43.625, longitude: -1.4583282 });
    expect(forecast.model).toBe("ecmwf_wam");
    expect(forecast.hours).toEqual({
      time: times,
      waveHeightMeters: [2.34, 2.48, null],
      wavePeriodSeconds: [7.25, 7.45, 7.5],
      wavePeakPeriodSeconds: [9.9, 10.05, 10.2],
      waveDirectionDegrees: [311, 312, 313],
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

  it("keeps a point with no sea nearby as it was answered, and names no model for it", () => {
    const forecast = buildForecast("ecmwf_wam", marine([null, null, null]), weather());
    if (forecast instanceof ForecastFormatError) throw forecast;

    expect(forecast.hours.waveHeightMeters).toEqual([null, null, null]);
    expect(forecast.model).toBeNull();
  });

  it("keeps the mean period alone of a model that gives no peak", () => {
    const answered = marine([2.34, 2.48, 2.5]);
    answered.hourly.wave_peak_period = [null, null, null];
    const forecast = buildForecast("meteofrance_wave", answered, weather());
    if (forecast instanceof ForecastFormatError) throw forecast;

    expect(forecast.model).toBe("meteofrance_wave");
    expect(forecast.hours.wavePeakPeriodSeconds).toEqual([null, null, null]);
    expect(forecast.hours.wavePeriodSeconds).toEqual([7.25, 7.45, 7.5]);
  });

  it("refuses a kept forecast of the shape before, which named no model", () => {
    const forecast = buildForecast("ecmwf_wam", marine([2.34, 2.48, 2.5]), weather());
    if (forecast instanceof ForecastFormatError) throw forecast;
    const { model: _, ...before } = forecast;

    expect(forecastData.safeParse(before).success).toBe(false);
  });

  it("refuses two answers that do not cover the same hours", () => {
    // The weather was asked after midnight, and starts a day later.
    const later = times.map((time) => time + 24 * 3600);
    expect(buildForecast("ecmwf_wam", marine([2.34, 2.48, 2.5]), weather(later))).toBeInstanceOf(
      ForecastFormatError,
    );

    const shorter = weather();
    for (const series of Object.values(shorter.hourly)) series.pop();
    expect(buildForecast("ecmwf_wam", marine([2.34, 2.48, 2.5]), shorter)).toBeInstanceOf(
      ForecastFormatError,
    );
  });

  it("refuses hours that do not follow one another", () => {
    const gap = [times[0] ?? 0, times[1] ?? 0, (times[2] ?? 0) + 3600];

    expect(buildForecast("ecmwf_wam", marine([2.34, 2.48, 2.5], gap), weather(gap))).toBeInstanceOf(
      ForecastFormatError,
    );
  });

  it("reports series that do not have one value per hour", () => {
    const short = marine([2.34, 2.48, 2.5]);
    short.hourly.wave_period = [];

    expect(buildForecast("ecmwf_wam", short, weather())).toBeInstanceOf(ForecastFormatError);
    expect(buildForecast("ecmwf_wam", marine([]), weather())).toBeInstanceOf(ForecastFormatError);
  });

  it("reports a time that is not a real moment", () => {
    const broken = marine([2.34, 2.48, 2.5], [1e300, times[1] ?? 0, times[2] ?? 0]);

    expect(buildForecast("ecmwf_wam", broken, weather())).toBeInstanceOf(ForecastFormatError);
  });

  it("reports an answer that changed shape", () => {
    const changed = { latitude: 43.6, longitude: -1.4, hourly: { time: times } };

    expect(buildForecast("ecmwf_wam", changed, weather())).toBeInstanceOf(ForecastFormatError);
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
  const sea = marine([2.34, 2.48, 2.5]);
  const land = marine([null, null, null]);

  /**
   * A provider in place of the network: it answers each request with the next of its statuses.
   * `withSea` names the wave models that have a sea at the point: all of them unless told.
   */
  function provider(statuses: { marine?: number[]; weather?: number[] } = {}, withSea?: string[]) {
    const asked: URL[] = [];
    const left = { marine: [...(statuses.marine ?? [])], weather: [...(statuses.weather ?? [])] };
    vi.stubGlobal("fetch", async (address: string) => {
      const url = new URL(address);
      asked.push(url);
      const which = url.host.startsWith("marine") ? "marine" : "weather";
      const status = left[which].shift() ?? 200;
      if (status !== 200) return new Response("no", { status });
      if (which === "weather") return Response.json(weather());
      const model = url.searchParams.get("models") ?? "";
      return Response.json(!withSea || withSea.includes(model) ? sea : land);
    });
    return asked;
  }
  const models = (asked: URL[]) =>
    asked.flatMap((url) => (url.host.startsWith("marine") ? [url.searchParams.get("models")] : []));
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

  it("asks the first wave model alone when it has a sea, for the whole sea and its peak", async () => {
    const asked = provider();

    const result = await run(fetchForecast(cell, counted().spend));

    expect(Result.isSuccess(result) && result.success.model).toBe("ecmwf_wam");
    expect(models(asked)).toEqual(["ecmwf_wam"]);
    const waves = asked.find((url) => url.host.startsWith("marine"));
    expect(waves?.searchParams.get("hourly")).toBe(
      "wave_height,wave_period,wave_peak_period,wave_direction",
    );
    expect(waves?.searchParams.get("cell_selection")).toBe("sea");
  });

  it("asks the next model when the one before has no sea at the point, and counts it", async () => {
    const asked = provider({}, ["meteofrance_wave"]);
    const { seen, spend } = counted();

    const result = await run(fetchForecast(cell, spend));

    expect(Result.isSuccess(result) && result.success.model).toBe("meteofrance_wave");
    expect(models(asked)).toEqual(["ecmwf_wam", "ecmwf_wam025", "meteofrance_wave"]);
    // The wind and the weather were asked once.
    expect([asked.length, seen.spent]).toEqual([4, 4]);
  });

  it("names no model for a point where none has a sea", async () => {
    const asked = provider({}, []);

    const result = await run(fetchForecast(cell, counted().spend));

    expect(Result.isSuccess(result) && result.success.model).toBeNull();
    expect(Result.isSuccess(result) && result.success.hours.waveHeightMeters).toEqual([
      null,
      null,
      null,
    ]);
    expect(models(asked)).toHaveLength(3);
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
