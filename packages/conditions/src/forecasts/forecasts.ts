import type { UpstreamError } from "@repo/upstream";
import { Cache, Duration, Effect, Exit, Result, Schema } from "effect";

import {
  BudgetSpent,
  type Cell,
  cellOf,
  fetchForecast,
  forecastData,
  type ForecastData,
  type ForecastFormatError,
  KEPT_DAYS,
  KEPT_PAST_DAYS,
} from "./open-meteo";

const MINUTE_MS = 60 * 1000;
const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

// A forecast is fresh for two hours. Models are renewed every hour to every twelve, and the
// worker checks the alerts every three: each check reads a forecast fetched since the last.
const FRESH_MS = 2 * 60 * MINUTE_MS;
// When the provider cannot be asked, an older forecast still answers, for a day.
const USABLE_MS = 24 * 60 * MINUTE_MS;
// How long the program's memory answers before the database is read again. It never makes a
// forecast last longer: a fresh one leaves the memory when it stops being fresh.
const MEMORY_MS = 10 * MINUTE_MS;
// A stale answer is kept less, so that the provider is asked again soon.
const STALE_MEMORY_MS = MINUTE_MS;
// After the provider failed to answer, it is asked nothing for this long.
const QUIET_MS = MINUTE_MS;
const MEMORY_CAPACITY = 1000;

// What a question may ask for, given the span that is kept.
export const MAX_FORECAST_DAYS = KEPT_DAYS - 1;
export const MAX_PAST_DAYS = KEPT_PAST_DAYS;

// A forecast as it is kept: when the fetch that got it started, and what the provider answered.
// What comes back from where it is kept is checked before it is used.
type Row = { fetchedAt: Date; data: unknown };

/**
 * What a program gives so that forecasts are kept and the requests for them counted, by all the
 * programs of an instance together. `packages/db` has the three that use Postgres. Each of the
 * first two also says what time it is where the forecasts are kept: a forecast's age is counted
 * on that one clock, and the moment a fetch starts is read there.
 */
export type ForecastStore = {
  /** The forecast kept for a cell. Null when none is. */
  read: (cell: Cell) => Promise<{ now: Date; row: Row | null }>;
  /** Keeps a forecast unless one fetched later is kept, and gives back the one that is kept. */
  write: (
    cell: Cell,
    row: { fetchedAt: Date; data: ForecastData },
  ) => Promise<{
    now: Date;
    row: Row;
  }>;
  /** Counts one request to the provider. False when a limit would be passed: nothing is counted. */
  spend: () => Promise<boolean>;
};

export class ForecastStoreError extends Schema.TaggedError<ForecastStoreError>()(
  "ForecastStoreError",
  { cause: Schema.Defect() },
) {}

/** The provider failed a moment ago, and is left alone for a minute. */
export class ProviderLeftAlone extends Schema.TaggedError<ProviderLeftAlone>()(
  "ProviderLeftAlone",
  {},
) {}

/** The forecast that is kept is too old to answer, and no other could be had. */
export class ForecastExpired extends Schema.TaggedError<ForecastExpired>()("ForecastExpired", {}) {}

/** The forecast that is kept does not reach the days asked for. */
export class ForecastTooShort extends Schema.TaggedError<ForecastTooShort>()(
  "ForecastTooShort",
  {},
) {}

// `pastDays` adds the days before today, as the models last computed them.
export type ForecastQuery = {
  latitude: number;
  longitude: number;
  days: number;
  pastDays?: number;
};

type Asked = Pick<ForecastQuery, "days" | "pastDays">;

/**
 * The hours of a kept forecast that answer a question asked at a moment: from the start of that
 * UTC day, less the past days, for the days asked. Null when the point has no sea forecast over
 * those hours, and `"short"` when what is kept does not cover them.
 */
export function hoursFor(data: ForecastData, asked: Asked, at: number) {
  const { time, ...values } = data.hours;
  const today = Math.floor(at / 1000 / DAY_S) * DAY_S;
  const from = today - (asked.pastDays ?? 0) * DAY_S;
  const until = today + asked.days * DAY_S;
  if ((time[0] ?? Infinity) > from || (time.at(-1) ?? -Infinity) < until - HOUR_S) return "short";

  const hours = [];
  let hasWaves = false;
  for (const [index, seconds] of time.entries()) {
    if (seconds < from || seconds >= until) continue;
    const waveHeightMeters = values.waveHeightMeters[index] ?? null;
    hasWaves ||= waveHeightMeters !== null;
    hours.push({
      time: new Date(seconds * 1000),
      waveHeightMeters,
      wavePeriodSeconds: values.wavePeriodSeconds[index] ?? null,
      waveDirectionDegrees: values.waveDirectionDegrees[index] ?? null,
      swellHeightMeters: values.swellHeightMeters[index] ?? null,
      swellPeriodSeconds: values.swellPeriodSeconds[index] ?? null,
      swellDirectionDegrees: values.swellDirectionDegrees[index] ?? null,
      windWaveHeightMeters: values.windWaveHeightMeters[index] ?? null,
      windWavePeriodSeconds: values.windWavePeriodSeconds[index] ?? null,
      windWaveDirectionDegrees: values.windWaveDirectionDegrees[index] ?? null,
      windSpeedMetersPerSecond: values.windSpeedMetersPerSecond[index] ?? null,
      windGustMetersPerSecond: values.windGustMetersPerSecond[index] ?? null,
      windDirectionDegrees: values.windDirectionDegrees[index] ?? null,
      cloudCoverPercent: values.cloudCoverPercent[index] ?? null,
      precipitationMillimeters: values.precipitationMillimeters[index] ?? null,
      airTemperatureCelsius: values.airTemperatureCelsius[index] ?? null,
    });
  }
  // No wave height at any of the hours asked for: the point has no sea nearby.
  return hasWaves ? hours : null;
}

// Whether a kept forecast answers every question that may be asked on a day.
function coversTheDay(data: ForecastData, at: number) {
  return hoursFor(data, { days: MAX_FORECAST_DAYS, pastDays: MAX_PAST_DAYS }, at) !== "short";
}

// A failure after which asking again at once is no use: the provider could not be reached,
// answered with an error of its own, or said that the instance asks too much. The refusal of
// one question is not one, nor is an answer that cannot be read.
function isProviderDown(error: { _tag: string; status?: number | undefined; retryable?: boolean }) {
  if (error._tag !== "UpstreamError") return false;
  if (error.status === undefined) return error.retryable === true;
  return error.status >= 500 || error.status === 429;
}

// The time that passes in this program, in milliseconds. It only goes forward: setting the
// machine's clock back or ahead makes no forecast younger or older.
const passed = () => performance.now();

// A forecast in the program's memory. Its age was counted on the store's clock at one moment,
// `seenAt`, and the time that passed since is added to it.
type Held = {
  data: ForecastData;
  fetchedAt: Date;
  stale: boolean;
  age: number;
  seenAt: number;
};

const ageOf = (held: Held) => held.age + (passed() - held.seenAt);
// How long a forecast may still answer: a fresh one while it is fresh, a stale one for its day.
const lifeLeft = (held: Held) => (held.stale ? USABLE_MS : FRESH_MS) - ageOf(held);
// How long the memory may still answer with it before the store is read again.
const memoryLeft = (held: Held) =>
  Math.min(lifeLeft(held), (held.stale ? STALE_MEMORY_MS : MEMORY_MS) - (passed() - held.seenAt));

type Fetch = typeof fetchForecast;

/**
 * The forecasts of a program: kept in its memory, then in the store that every program of the
 * instance shares, and asked of the provider when neither has a fresh one. Decision 023.
 */
export function makeForecasts(store: ForecastStore, fetch: Fetch = fetchForecast) {
  // The provider failed to answer: nothing is asked of it before this moment, and then one
  // question at a time until one is answered. Null while it answers.
  let leftAloneUntil: number | null = null;
  let isTrying = false;

  const stored = <Value>(run: () => Promise<Value>) =>
    Effect.tryPromise({ try: run, catch: (cause) => new ForecastStoreError({ cause }) });
  const spend = stored(() => store.spend()).pipe(
    Effect.flatMap((counted) => (counted ? Effect.void : Effect.fail(new BudgetSpent()))),
  );
  // A row that other code wrote in another shape counts as missing.
  const held = (now: Date, row: Row | null, stale = false): Held | null => {
    const data = forecastData.safeParse(row?.data);
    if (!row || !data.success) return null;
    const age = now.getTime() - row.fetchedAt.getTime();
    return { data: data.data, fetchedAt: row.fetchedAt, stale, age, seenAt: passed() };
  };

  const ask = Effect.fn("askForecast")(function* (cell: Cell) {
    const isAfterFailure = leftAloneUntil !== null;
    if (leftAloneUntil !== null && (passed() < leftAloneUntil || isTrying)) {
      return yield* new ProviderLeftAlone();
    }
    isTrying = isAfterFailure;
    return yield* fetch(cell, spend).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          leftAloneUntil = null;
        }),
      ),
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (isProviderDown(error)) leftAloneUntil = passed() + QUIET_MS;
        }),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (isAfterFailure) isTrying = false;
        }),
      ),
    );
  });

  const lookup = Effect.fn("lookupForecast")(function* (key: string) {
    const [latStep = 0, lonStep = 0] = key.split(",").map(Number);
    const cell = { latStep, lonStep };

    const read = yield* stored(() => store.read(cell));
    // The store's time was read at this moment of the program's: what follows is counted from it.
    const readAt = passed();
    const kept = held(read.now, read.row);
    if (kept && kept.age < FRESH_MS && coversTheDay(kept.data, read.now.getTime())) return kept;

    // The moment the fetch starts orders two fetches of a cell, on the clock they share.
    const fetched = yield* Effect.result(ask(cell));
    if (Result.isSuccess(fetched)) {
      const fresh = { fetchedAt: read.now, data: fetched.success };
      const written = yield* Effect.result(stored(() => store.write(cell, fresh)));
      const winner = Result.isSuccess(written)
        ? held(written.success.now, written.success.row)
        : null;
      // A forecast that could not be written still answers, from this program's memory. Its
      // fetch started when the store was read, and it is as old as the time that passed since.
      return winner ?? { ...fresh, stale: false, age: 0, seenAt: readAt };
    }
    // The older forecast answers while its day lasts, counted to this moment: asking the
    // provider took time.
    const older = kept && { ...kept, stale: true };
    if (older && lifeLeft(older) > 0) return older;
    return yield* Effect.fail(fetched.failure);
  });

  const memory = Effect.runSync(
    Cache.makeWith(lookup, {
      capacity: MEMORY_CAPACITY,
      // A failure is not kept, so the next question asks again.
      timeToLive: (exit) =>
        Exit.isSuccess(exit) ? Duration.millis(Math.max(0, memoryLeft(exit.value))) : Duration.zero,
    }),
  );

  return {
    /**
     * Hourly waves, swell, and wind at a point. `hours` is null when the point has no sea
     * nearby over the hours asked for. `stale` says that the provider could not be asked and
     * that this is an older answer, with or without hours.
     */
    get: Effect.fn("getForecast")(function* (query: ForecastQuery) {
      const cell = cellOf(query);
      const key = `${cell.latStep},${cell.lonStep}`;
      let found = yield* Cache.get(memory, key);
      // The memory lets go of a forecast when its time is up, by the machine's clock. This
      // checks it by the time that passed, which no setting of that clock changes.
      if (memoryLeft(found) <= 0) {
        const expired = found;
        // Only the forecast that was read is let go. Questions that arrived together read
        // the same one, and share the one that takes its place.
        yield* Cache.invalidateWhen(memory, key, (held) => held === expired);
        found = yield* Cache.get(memory, key);
        if (lifeLeft(found) <= 0) return yield* new ForecastExpired();
      }

      const hours = hoursFor(found.data, query, found.fetchedAt.getTime() + ageOf(found));
      if (hours === "short") {
        // The next question reads the store again, which asks for a forecast that covers.
        yield* Cache.invalidate(memory, key);
        return yield* new ForecastTooShort();
      }
      return {
        point: found.data.point,
        hours,
        fetchedAt: found.fetchedAt,
        stale: found.stale,
      };
    }),
  };
}

export type Forecasts = ReturnType<typeof makeForecasts>;
export type ForecastFailure =
  | UpstreamError
  | ForecastFormatError
  | BudgetSpent
  | ForecastStoreError
  | ProviderLeftAlone
  | ForecastExpired
  | ForecastTooShort;
