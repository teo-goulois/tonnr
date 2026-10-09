import { fetchJson } from "@repo/upstream";
import { Cache, Effect, Exit, Schema } from "effect";
import { z } from "zod";

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export const FORECAST_SOURCE = {
  name: "Open-Meteo",
  url: "https://open-meteo.com/",
  attribution: "Weather data by Open-Meteo.com",
  // The data is CC BY 4.0. The free API that serves it is for non-commercial use only.
  license: {
    type: "cc-by-4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    commercialUse: false,
  },
};

// Wave models are about 5 km wide at best, so nearby points share a forecast and a cache entry.
const GRID_STEPS_PER_DEGREE = 20;
const CACHE_HOURS = 1;
const CACHE_CAPACITY = 1000;

export class ForecastFormatError extends Schema.TaggedError<ForecastFormatError>()(
  "ForecastFormatError",
  { message: Schema.String },
) {}

const series = z.array(z.number().nullable());
// Seconds since 1970, between the years 2000 and 2100.
const times = z.array(z.number().int().min(946_684_800).max(4_102_444_800));

// Every series must have one value per hour, or the hours would be paired with the wrong values.
function hasOneValuePerHour(hourly: { time: number[] } & Record<string, unknown[]>) {
  return Object.values(hourly).every((values) => values.length === hourly.time.length);
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

const weatherSchema = z.object({
  hourly: z
    .object({
      time: times,
      wind_speed_10m: series,
      wind_gusts_10m: series,
      wind_direction_10m: series,
    })
    .refine(hasOneValuePerHour),
});

// `pastDays` adds the days before today, as the models last computed them.
type ForecastQuery = { latitude: number; longitude: number; days: number; pastDays?: number };

function snapToGrid(degrees: number) {
  return Math.round(degrees * GRID_STEPS_PER_DEGREE) / GRID_STEPS_PER_DEGREE;
}

function url(base: string, query: ForecastQuery, parameters: Record<string, string>) {
  const search = new URLSearchParams({
    latitude: String(query.latitude),
    longitude: String(query.longitude),
    forecast_days: String(query.days),
    past_days: String(query.pastDays ?? 0),
    timeformat: "unixtime",
    timezone: "GMT",
    ...parameters,
  });
  return `${base}?${search}`;
}

/**
 * Merges Open-Meteo's marine and weather answers into one forecast.
 * Returns null when the point has no sea nearby, and an error when an answer has changed shape.
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
  if (waves.wave_height.every((height) => height === null)) return null;

  const wind = weather.data.hourly;
  const windIndexByTime = new Map(wind.time.map((time, index) => [time, index]));

  return {
    point: { latitude: marine.data.latitude, longitude: marine.data.longitude },
    hours: waves.time.map((time, index) => {
      const windIndex = windIndexByTime.get(time);
      const windAt = (values: (number | null)[]) =>
        windIndex === undefined ? null : (values[windIndex] ?? null);

      return {
        time: new Date(time * 1000),
        waveHeightMeters: waves.wave_height[index] ?? null,
        wavePeriodSeconds: waves.wave_period[index] ?? null,
        waveDirectionDegrees: waves.wave_direction[index] ?? null,
        swellHeightMeters: waves.swell_wave_height[index] ?? null,
        swellPeriodSeconds: waves.swell_wave_period[index] ?? null,
        swellDirectionDegrees: waves.swell_wave_direction[index] ?? null,
        windWaveHeightMeters: waves.wind_wave_height[index] ?? null,
        windWavePeriodSeconds: waves.wind_wave_period[index] ?? null,
        windWaveDirectionDegrees: waves.wind_wave_direction[index] ?? null,
        windSpeedMetersPerSecond: windAt(wind.wind_speed_10m),
        windGustMetersPerSecond: windAt(wind.wind_gusts_10m),
        windDirectionDegrees: windAt(wind.wind_direction_10m),
      };
    }),
  };
}

/** Hourly waves, swell, and wind at a point. Null when the point has no sea nearby. */
const fetchForecast = Effect.fn("fetchForecast")(function* (query: ForecastQuery) {
  const [marineJson, weatherJson] = yield* Effect.all(
    [
      fetchJson(
        url(MARINE_URL, query, {
          hourly: Object.keys(marineHourly.shape)
            .filter((name) => name !== "time")
            .join(","),
          // Take the nearest sea cell: a spot on the shore would otherwise fall on land.
          cell_selection: "sea",
        }),
      ),
      fetchJson(
        url(WEATHER_URL, query, {
          hourly: "wind_speed_10m,wind_gusts_10m,wind_direction_10m",
          wind_speed_unit: "ms",
        }),
      ),
    ],
    { concurrency: 2 },
  );

  const forecast = buildForecast(marineJson, weatherJson);
  if (forecast instanceof ForecastFormatError) return yield* forecast;
  return forecast;
});

// Open-Meteo's free tier allows 10,000 calls a day, and a forecast takes two. An answer is
// reused for an hour. A failure is not kept, so the next request tries again.
const cache = Effect.runSync(
  Cache.makeWith(
    (key: string) => {
      const [latitude = 0, longitude = 0, days = 1, pastDays = 0] = key.split(",").map(Number);
      return fetchForecast({ latitude, longitude, days, pastDays });
    },
    {
      capacity: CACHE_CAPACITY,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? `${CACHE_HOURS} hours` : "0 millis"),
    },
  ),
);

export function getForecast(query: ForecastQuery) {
  const key = [
    snapToGrid(query.latitude),
    snapToGrid(query.longitude),
    query.days,
    query.pastDays ?? 0,
  ].join(",");
  return Cache.get(cache, key);
}
