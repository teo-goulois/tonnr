import { fetchJsonOnce, UpstreamError } from "@repo/upstream";
import { Effect, Schedule, Schema } from "effect";
import { z } from "zod";

import {
  isInFineZone,
  type OpenMeteoModelId,
  openMeteoModelIds,
  waveModelIds,
} from "./wave-models";

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

// The name the instance counts its requests under.
export const FORECAST_PROVIDER = "open-meteo";

// What the instance lets itself ask, in requests: four fifths of what the free tier allows,
// which is 10,000 a day, 5,000 an hour and 600 a minute. The day has two shares, one for the
// people who look and one for the alerts, and neither spends the other's. The paid plan has
// other addresses and a key: one who pays changes them with these numbers. Decision 023.
export const FORECAST_BUDGET = {
  // The day has three shares: the people who look, the pages of the listed breaks, whose
  // forecasts the worker keeps once a day, and the alerts. Decisions 023 and 057.
  day: { people: 2500, pages: 3900, alerts: 1600 },
  hour: 4000,
  minute: 480,
} as const;

export type ForecastShare = keyof typeof FORECAST_BUDGET.day;

/** The counts one request adds to, with the limit of each, for the program that has this share. */
export function forecastBudget(share: ForecastShare) {
  return [
    { bucket: `day:${share}`, span: "day", limit: FORECAST_BUDGET.day[share] },
    { bucket: "hour", span: "hour", limit: FORECAST_BUDGET.hour },
    { bucket: "minute", span: "minute", limit: FORECAST_BUDGET.minute },
  ] as const;
}

// Forecasts are kept by cell, so that nearby points share one. A cell is 0.05° wide, about the
// grid of the models asked of Open-Meteo. Where the fine model has its sea a cell is 0.0125°
// wide, no wider than that model's own: a spot is read where it stands. Both are counted in
// steps of 0.0125°, so a cell of either width has one name.
const STEPS_PER_DEGREE = 80;
const WIDE_CELL_STEPS = 4;

/** A cell of the grid that forecasts are kept by, in steps of 0.0125°. */
export type Cell = { latStep: number; lonStep: number };

export function cellOf(point: { latitude: number; longitude: number }): Cell {
  const width = isInFineZone(point) ? 1 : WIDE_CELL_STEPS;
  const steps = (degrees: number) => Math.round((degrees * STEPS_PER_DEGREE) / width) * width;
  return { latStep: steps(point.latitude), lonStep: steps(point.longitude) };
}

/** The centre of a cell, which is the point its forecast is asked for. */
export function pointOf(cell: Cell) {
  return {
    latitude: cell.latStep / STEPS_PER_DEGREE,
    longitude: cell.lonStep / STEPS_PER_DEGREE,
  };
}

// One span for every question: the two days before today, and eight days from today. The API
// gives seven at most, so that a forecast fetched before midnight still answers after it. The
// provider counts ten days of four values as one call, as it does three days.
export const KEPT_PAST_DAYS = 2;
export const KEPT_DAYS = 8;

// How far back the provider is asked for days that are no longer kept. Its weather answers for
// 92 days before today, as seen on 2026-10-13, and its waves for longer: the nearer of the two
// bounds the question, with a margin.
export const PAST_REACH_DAYS = 90;

/** Days of the past that are asked for by themselves, as UTC dates, both included. */
export type PastDays = { start: string; end: string };

export class ForecastFormatError extends Schema.TaggedError<ForecastFormatError>()(
  "ForecastFormatError",
  { message: Schema.String },
) {}

/** The instance has asked the provider all it lets itself ask for now. */
export class BudgetSpent extends Schema.TaggedError<BudgetSpent>()("BudgetSpent", {}) {}

const series = z.array(z.number().nullable());
// Seconds since 1970, between the years 2000 and 2100.
const times = z.array(z.number().int().min(946_684_800).max(4_102_444_800));

const HOUR_SECONDS = 60 * 60;

// Every series must have one value per hour, or the hours would be paired with the wrong values.
// The hours follow one another without a gap, so that a part of them is a span of time.
function hasOneValuePerHour(hourly: { time: number[] } & Record<string, unknown[]>) {
  const [first = 0] = hourly.time;
  return (
    Object.values(hourly).every((values) => values.length === hourly.time.length) &&
    hourly.time.every((seconds, index) => seconds === first + index * HOUR_SECONDS)
  );
}

// The whole sea, swell and wind sea together, as a buoy measures it: its height, its mean period,
// the period of its peak, and where it comes from. No model of the list gives a swell apart that
// stood against the buoys.
const marineHourly = z.object({
  time: times,
  wave_height: series,
  wave_period: series,
  wave_peak_period: series,
  wave_direction: series,
});

const marineSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: marineHourly.refine(hasOneValuePerHour),
});

// The wind over the sea, and the weather a surfer dresses for: the sky, the rain, the air.
const weatherHourly = z.object({
  time: times,
  wind_speed_10m: series,
  wind_gusts_10m: series,
  wind_direction_10m: series,
  cloud_cover: series,
  precipitation: series,
  temperature_2m: series,
});

const weatherSchema = z.object({
  hourly: weatherHourly.refine(hasOneValuePerHour),
});

const columns = z.object({
  // Seconds since 1970, one for each hour, in order.
  time: times,
  waveHeightMeters: series,
  // The mean period of the whole sea.
  wavePeriodSeconds: series,
  // The period of the waves that carry the most energy: the one a buoy gives as its peak, and
  // the one a surfer reads. Null at every hour when the model gives none.
  wavePeakPeriodSeconds: series,
  waveDirectionDegrees: series,
  // The first swell apart from the wind sea: its height, and where it comes from. Open-Meteo's
  // models give none that stood against the buoys, so these are empty until another source
  // fills them: decision 038.
  primarySwellHeightMeters: series,
  primarySwellDirectionDegrees: series,
  windSpeedMetersPerSecond: series,
  windGustMetersPerSecond: series,
  windDirectionDegrees: series,
  // The share of the sky under cloud, from 0 to 100.
  cloudCoverPercent: series,
  // Rain, showers and snow of the hour before.
  precipitationMillimeters: series,
  airTemperatureCelsius: series,
});

/**
 * A forecast as it is kept: the model's grid point, the wave models that answered, and one
 * column for each value, hour by hour. Each model answers from its `from`, in seconds since
 * 1970, to the next one's, and the list is empty when none has a sea at the point. A row of the
 * database is read through this, so a row written by other code is refused instead of trusted.
 */
export const forecastData = z.object({
  point: z.object({ latitude: z.number(), longitude: z.number() }),
  models: z.array(z.object({ id: z.enum(waveModelIds), from: z.number().int() })),
  // The models the swell apart comes from, listed the same way.
  swellModels: z.array(z.object({ id: z.enum(waveModelIds), from: z.number().int() })),
  // The models the peak period of the whole sea comes from, when it is another's than the
  // waves': ECMWF's, laid over MFWAM's files (decision 058). A row written before has none.
  peakModels: z.array(z.object({ id: z.enum(waveModelIds), from: z.number().int() })).default([]),
  hours: columns.refine(hasOneValuePerHour),
});

export type ForecastData = z.infer<typeof forecastData>;

/**
 * Merges Open-Meteo's marine and weather answers into one forecast, hour by hour. The marine
 * answer is the one of `model`, which is kept with the forecast when it has a sea at the point,
 * as the one that answers from the first hour.
 * Returns an error when an answer has changed shape, and when the two do not cover the same
 * hours: each request starts at the provider's own midnight, and one sent before it with one
 * sent after would leave a day without wind.
 */
export function buildForecast(model: OpenMeteoModelId, marineJson: unknown, weatherJson: unknown) {
  const marine = marineSchema.safeParse(marineJson);
  const weather = weatherSchema.safeParse(weatherJson);
  if (!marine.success || !weather.success) {
    return new ForecastFormatError({
      message: `Open-Meteo changed its ${marine.success ? "weather" : "marine"} answer`,
    });
  }

  const waves = marine.data.hourly;
  const wind = weather.data.hourly;
  if (wind.time.length !== waves.time.length || wind.time[0] !== waves.time[0]) {
    return new ForecastFormatError({
      message: "Open-Meteo's marine and weather answers do not cover the same hours",
    });
  }

  const data: ForecastData = {
    point: { latitude: marine.data.latitude, longitude: marine.data.longitude },
    models: waves.wave_height.some((height) => height !== null)
      ? [{ id: model, from: waves.time[0] ?? 0 }]
      : [],
    swellModels: [],
    peakModels: [],
    hours: {
      time: waves.time,
      waveHeightMeters: waves.wave_height,
      wavePeriodSeconds: waves.wave_period,
      wavePeakPeriodSeconds: waves.wave_peak_period,
      waveDirectionDegrees: waves.wave_direction,
      primarySwellHeightMeters: waves.time.map(() => null),
      primarySwellDirectionDegrees: waves.time.map(() => null),
      windSpeedMetersPerSecond: wind.wind_speed_10m,
      windGustMetersPerSecond: wind.wind_gusts_10m,
      windDirectionDegrees: wind.wind_direction_10m,
      cloudCoverPercent: wind.cloud_cover,
      precipitationMillimeters: wind.precipitation,
      airTemperatureCelsius: wind.temperature_2m,
    },
  };
  return data;
}

function url(base: string, cell: Cell, parameters: Record<string, string>, days?: PastDays) {
  const search = new URLSearchParams({
    latitude: String(pointOf(cell).latitude),
    longitude: String(pointOf(cell).longitude),
    ...(days
      ? { start_date: days.start, end_date: days.end }
      : { forecast_days: String(KEPT_DAYS), past_days: String(KEPT_PAST_DAYS) }),
    timeformat: "unixtime",
    timezone: "GMT",
    ...parameters,
  });
  return `${base}?${search}`;
}

// A request that fails is tried once more, half a second later. Not when the provider says the
// instance asks too much: asking again is what it refuses.
const oneMoreTry = {
  times: 1,
  schedule: Schedule.spaced("500 millis"),
  while: (error: unknown) =>
    error instanceof UpstreamError && error.retryable && error.status !== 429,
};

/**
 * Asks Open-Meteo for the forecast of a cell: one request for the wind and the weather, and one
 * for the waves of the first model. A later model is asked only when the one before has no sea
 * at the point, so nearly every cell costs two requests.
 * `spend` counts a request before it is sent, and fails when the instance may send no more.
 * With `days`, it asks for those days of the past in place of the span that is kept: what the
 * models last computed of them, at the same price.
 */
export const fetchForecast = <E>(
  cell: Cell,
  spend: Effect.Effect<void, BudgetSpent | E>,
  days?: PastDays,
) => {
  const ask = (address: string) =>
    spend.pipe(
      Effect.flatMap(() => fetchJsonOnce(address)),
      Effect.retry(oneMoreTry),
    );
  const askWaves = (model: OpenMeteoModelId) =>
    ask(
      url(
        MARINE_URL,
        cell,
        {
          hourly: Object.keys(marineHourly.shape)
            .filter((name) => name !== "time")
            .join(","),
          models: model,
          // Take the nearest sea cell: a spot on the shore would otherwise fall on land.
          cell_selection: "sea",
        },
        days,
      ),
    );

  return Effect.gen(function* () {
    const [first, ...others] = openMeteoModelIds;
    const [firstJson, weatherJson] = yield* Effect.all(
      [
        askWaves(first),
        ask(
          url(
            WEATHER_URL,
            cell,
            {
              hourly: Object.keys(weatherHourly.shape)
                .filter((name) => name !== "time")
                .join(","),
              wind_speed_unit: "ms",
            },
            days,
          ),
        ),
      ],
      { concurrency: 2 },
    );

    let data = buildForecast(first, firstJson, weatherJson);
    for (const model of others) {
      if (data instanceof ForecastFormatError) return yield* data;
      if (data.models.length > 0) return data;
      data = buildForecast(model, yield* askWaves(model), weatherJson);
    }
    if (data instanceof ForecastFormatError) return yield* data;
    return data;
  });
};
