import { fetchJsonOnce, UpstreamError } from "@repo/upstream";
import { Effect, Schedule, Schema } from "effect";
import { z } from "zod";

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export const FORECAST_SOURCE = {
  name: "Open-Meteo",
  url: "https://open-meteo.com/",
  // Open-Meteo asks for a credit to DWD beside its own, for the wave forecast.
  attribution: "Weather data by Open-Meteo.com. Wave forecast from the German Weather Service DWD.",
  // The data is CC BY 4.0. The free API that serves it is for non-commercial use only.
  license: {
    type: "cc-by-4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    commercialUse: false,
  },
};

// The name the instance counts its requests under.
export const FORECAST_PROVIDER = "open-meteo";

// What the instance lets itself ask, in requests: four fifths of what the free tier allows,
// which is 10,000 a day, 5,000 an hour and 600 a minute. The day has two shares, one for the
// people who look and one for the alerts, and neither spends the other's. The paid plan has
// other addresses and a key: one who pays changes them with these numbers. Decision 023.
export const FORECAST_BUDGET = {
  day: { people: 5500, alerts: 2500 },
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

// Wave models are about 5 km wide at best, so nearby points share a forecast.
const GRID_STEPS_PER_DEGREE = 20;

/** A cell of the grid that forecasts are kept by, in steps of 0.05°. */
export type Cell = { latStep: number; lonStep: number };

export function cellOf(point: { latitude: number; longitude: number }): Cell {
  return {
    latStep: Math.round(point.latitude * GRID_STEPS_PER_DEGREE),
    lonStep: Math.round(point.longitude * GRID_STEPS_PER_DEGREE),
  };
}

// One span for every question: the two days before today, and eight days from today. The API
// gives seven at most, so that a forecast fetched before midnight still answers after it. The
// provider counts ten days of nine values as one call, as it does three days.
export const KEPT_PAST_DAYS = 2;
export const KEPT_DAYS = 8;

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

const marineHourly = z.object({
  time: times,
  wave_height: series,
  wave_period: series,
  wave_direction: series,
  swell_wave_height: series,
  swell_wave_period: series,
  swell_wave_direction: series,
  wind_wave_height: series,
  wind_wave_period: series,
  wind_wave_direction: series,
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
  wavePeriodSeconds: series,
  waveDirectionDegrees: series,
  swellHeightMeters: series,
  swellPeriodSeconds: series,
  swellDirectionDegrees: series,
  windWaveHeightMeters: series,
  windWavePeriodSeconds: series,
  windWaveDirectionDegrees: series,
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
 * A forecast as it is kept: the model's grid point, and one column for each value, hour by
 * hour. A row of the database is read through this, so a row written by other code is refused
 * instead of trusted.
 */
export const forecastData = z.object({
  point: z.object({ latitude: z.number(), longitude: z.number() }),
  hours: columns.refine(hasOneValuePerHour),
});

export type ForecastData = z.infer<typeof forecastData>;

/**
 * Merges Open-Meteo's marine and weather answers into one forecast, hour by hour. Returns an
 * error when an answer has changed shape, and when the two do not cover the same hours: each
 * request starts at the provider's own midnight, and one sent before it with one sent after
 * would leave a day without wind.
 */
export function buildForecast(marineJson: unknown, weatherJson: unknown) {
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
    hours: {
      time: waves.time,
      waveHeightMeters: waves.wave_height,
      wavePeriodSeconds: waves.wave_period,
      waveDirectionDegrees: waves.wave_direction,
      swellHeightMeters: waves.swell_wave_height,
      swellPeriodSeconds: waves.swell_wave_period,
      swellDirectionDegrees: waves.swell_wave_direction,
      windWaveHeightMeters: waves.wind_wave_height,
      windWavePeriodSeconds: waves.wind_wave_period,
      windWaveDirectionDegrees: waves.wind_wave_direction,
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

function url(base: string, cell: Cell, parameters: Record<string, string>) {
  const search = new URLSearchParams({
    latitude: String(cell.latStep / GRID_STEPS_PER_DEGREE),
    longitude: String(cell.lonStep / GRID_STEPS_PER_DEGREE),
    forecast_days: String(KEPT_DAYS),
    past_days: String(KEPT_PAST_DAYS),
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
 * Asks Open-Meteo for the forecast of a cell: one request for the waves, and one for the wind
 * and the weather.
 * `spend` counts a request before it is sent, and fails when the instance may send no more.
 */
export const fetchForecast = <E>(cell: Cell, spend: Effect.Effect<void, BudgetSpent | E>) => {
  const ask = (address: string) =>
    spend.pipe(
      Effect.flatMap(() => fetchJsonOnce(address)),
      Effect.retry(oneMoreTry),
    );

  return Effect.gen(function* () {
    const [marineJson, weatherJson] = yield* Effect.all(
      [
        ask(
          url(MARINE_URL, cell, {
            hourly: Object.keys(marineHourly.shape)
              .filter((name) => name !== "time")
              .join(","),
            // Take the nearest sea cell: a spot on the shore would otherwise fall on land.
            cell_selection: "sea",
          }),
        ),
        ask(
          url(WEATHER_URL, cell, {
            hourly: Object.keys(weatherHourly.shape)
              .filter((name) => name !== "time")
              .join(","),
            wind_speed_unit: "ms",
          }),
        ),
      ],
      { concurrency: 2 },
    );

    const data = buildForecast(marineJson, weatherJson);
    if (data instanceof ForecastFormatError) return yield* data;
    return data;
  });
};
