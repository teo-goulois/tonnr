import { UpstreamError } from "@repo/upstream";
import { Effect } from "effect";

import { type ForecastStore, makeForecasts } from "./forecasts";
import {
  type Cell,
  type ForecastData,
  KEPT_DAYS,
  KEPT_PAST_DAYS,
  type PastDays,
} from "./open-meteo";

// What the tests of forecasts are made of, here and in the programs that use them. No test asks
// the provider: a store in memory stands for the database, and a function for the provider.

const HOUR = 3600;
const DAY = 24 * HOUR;

/**
 * What the provider answers when asked at a moment: the span that is kept, from its own day.
 * Asked for days of the past, it answers those days whole.
 */
export function answer(
  at: number,
  waves: (seconds: number) => number | null = () => 1.5,
  swell: (seconds: number) => number | null = () => 1.2,
  days?: PastDays,
): ForecastData {
  const today = Math.floor(at / 1000 / DAY) * DAY;
  const first = days ? Date.parse(`${days.start}T00:00:00Z`) / 1000 : today - KEPT_PAST_DAYS * DAY;
  const end = days ? Date.parse(`${days.end}T00:00:00Z`) / 1000 + DAY : today + KEPT_DAYS * DAY;
  const time = Array.from({ length: (end - first) / HOUR }, (_, index) => first + index * HOUR);
  const flat = (value: number) => time.map(() => value);
  const waveHeightMeters = time.map(waves);
  return {
    point: { latitude: 43.625, longitude: -1.4583 },
    models: waveHeightMeters.some((height) => height !== null)
      ? [{ id: "ecmwf_wam", from: time[0] ?? 0 }]
      : [],
    swellModels: [{ id: "mfwam", from: time[0] ?? 0 }],
    peakModels: [],
    hours: {
      time,
      waveHeightMeters,
      wavePeriodSeconds: flat(8),
      wavePeakPeriodSeconds: flat(11),
      waveDirectionDegrees: flat(295),
      primarySwellHeightMeters: time.map(swell),
      primarySwellDirectionDegrees: flat(290),
      windSpeedMetersPerSecond: flat(5),
      windGustMetersPerSecond: flat(8),
      windDirectionDegrees: flat(90),
      cloudCoverPercent: flat(40),
      precipitationMillimeters: flat(0),
      airTemperatureCelsius: flat(16),
    },
  };
}

const cellKey = (cell: Cell) => `${cell.latStep},${cell.lonStep}`;

/**
 * A store in memory, as the database is one. Its clock is the test's, unless the test gives it
 * one of its own, as a database on another machine has.
 */
export function memoryStore(clock: () => Date = () => new Date()) {
  const rows = new Map<string, { fetchedAt: Date; data: unknown }>();
  const seen = { reads: 0, writes: 0, spent: 0 };
  let budget = Infinity;
  const store: ForecastStore = {
    read: async (cell) => {
      seen.reads += 1;
      return { now: clock(), row: rows.get(cellKey(cell)) ?? null };
    },
    write: async (cell, row) => {
      seen.writes += 1;
      const kept = rows.get(cellKey(cell));
      if (!kept || kept.fetchedAt < row.fetchedAt) rows.set(cellKey(cell), row);
      return { now: clock(), row: rows.get(cellKey(cell)) ?? row };
    },
    spend: async () => {
      if (seen.spent >= budget) return false;
      seen.spent += 1;
      return true;
    },
  };
  return { store, rows, seen, limit: (calls: number) => void (budget = calls) };
}

/** A provider that answers, or fails with what it is told to. Each question is two requests. */
export function provider() {
  // `behind` is how far the provider's clock is behind this one's, in milliseconds, `waves` the
  // wave height it gives for an hour, and `swell` the height of the swell apart in it.
  const state = {
    asked: 0,
    // The days of the past it was asked for by themselves, in the order they were asked.
    past: [] as PastDays[],
    fails: null as null | (() => unknown),
    behind: 0,
    waves: (() => 1.5) as (seconds: number) => number | null,
    swell: (() => 1.2) as (seconds: number) => number | null,
  };
  const fetch: Parameters<typeof makeForecasts>[1] = (_cell, spend) =>
    Effect.gen(function* () {
      yield* spend;
      yield* spend;
      state.asked += 1;
      if (state.fails) return yield* Effect.fail(state.fails() as never);
      return answer(Date.now() - state.behind, state.waves, state.swell);
    });
  // Days of the past are the provider's own models: no swell apart is laid over them.
  const fetchPast: Parameters<typeof makeForecasts>[2] = (_cell, spend, days) =>
    Effect.gen(function* () {
      yield* spend;
      yield* spend;
      if (days) state.past.push(days);
      if (state.fails) return yield* Effect.fail(state.fails() as never);
      const data = answer(Date.now() - state.behind, state.waves, () => null, days);
      return { ...data, swellModels: [] };
    });
  return { fetch, fetchPast, state };
}

/** What a provider that cannot answer fails with. */
export const providerDown = () =>
  new UpstreamError({ url: "https://example.org/forecast", status: 503, retryable: true });

/** The forecasts of a program in a test, with what stands for its database and its provider. */
export function testForecasts() {
  const kept = memoryStore();
  const asked = provider();
  return {
    forecasts: makeForecasts(kept.store, asked.fetch, asked.fetchPast),
    ...kept,
    provider: asked.state,
  };
}
