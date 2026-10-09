import { UpstreamError } from "@repo/upstream";
import { Effect } from "effect";

import { type ForecastStore, makeForecasts } from "./forecasts";
import { type Cell, type ForecastData, KEPT_DAYS, KEPT_PAST_DAYS } from "./open-meteo";

// What the tests of forecasts are made of, here and in the programs that use them. No test asks
// the provider: a store in memory stands for the database, and a function for the provider.

const HOUR = 3600;
const DAY = 24 * HOUR;

/** What the provider answers when asked at a moment: the span that is kept, from its own day. */
export function answer(
  at: number,
  waves: (seconds: number) => number | null = () => 1.5,
): ForecastData {
  const today = Math.floor(at / 1000 / DAY) * DAY;
  const time = Array.from(
    { length: (KEPT_PAST_DAYS + KEPT_DAYS) * 24 },
    (_, index) => today - KEPT_PAST_DAYS * DAY + index * HOUR,
  );
  const flat = (value: number) => time.map(() => value);
  return {
    point: { latitude: 43.625, longitude: -1.4583 },
    hours: {
      time,
      waveHeightMeters: time.map(waves),
      wavePeriodSeconds: flat(8),
      waveDirectionDegrees: flat(300),
      swellHeightMeters: flat(1.2),
      swellPeriodSeconds: flat(11),
      swellDirectionDegrees: flat(295),
      windWaveHeightMeters: flat(0.4),
      windWavePeriodSeconds: flat(4),
      windWaveDirectionDegrees: flat(320),
      windSpeedMetersPerSecond: flat(5),
      windGustMetersPerSecond: flat(8),
      windDirectionDegrees: flat(90),
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
  // `behind` is how far the provider's clock is behind this one's, in milliseconds, and
  // `waves` the wave height it gives for an hour.
  const state = {
    asked: 0,
    fails: null as null | (() => unknown),
    behind: 0,
    waves: (() => 1.5) as (seconds: number) => number | null,
  };
  const fetch: Parameters<typeof makeForecasts>[1] = (_cell, spend) =>
    Effect.gen(function* () {
      yield* spend;
      yield* spend;
      state.asked += 1;
      if (state.fails) return yield* Effect.fail(state.fails() as never);
      return answer(Date.now() - state.behind, state.waves);
    });
  return { fetch, state };
}

/** What a provider that cannot answer fails with. */
export const providerDown = () =>
  new UpstreamError({ url: "https://example.org/forecast", status: 503, retryable: true });

/** The forecasts of a program in a test, with what stands for its database and its provider. */
export function testForecasts() {
  const kept = memoryStore();
  const asked = provider();
  return { forecasts: makeForecasts(kept.store, asked.fetch), ...kept, provider: asked.state };
}
