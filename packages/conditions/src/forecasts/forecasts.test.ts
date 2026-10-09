import { UpstreamError } from "@repo/upstream";
import { Effect, Fiber, Result } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hoursFor, makeForecasts, MAX_FORECAST_DAYS, MAX_PAST_DAYS } from "./forecasts";
import { BudgetSpent, type Cell, ForecastFormatError } from "./open-meteo";
import { answer, memoryStore, provider } from "./testing";

const HOUR = 3600;
const DAY = 24 * HOUR;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const utc = (text: string) => Date.parse(text);

describe("the hours of a kept forecast that answer a question", () => {
  const fetched = utc("2026-10-08T23:50:00Z");
  const data = answer(fetched);
  const questions = Array.from({ length: MAX_FORECAST_DAYS }, (_, day) =>
    Array.from({ length: MAX_PAST_DAYS + 1 }, (_, pastDays) => ({ days: day + 1, pastDays })),
  ).flat();

  it.each([
    ["the evening it was fetched", "2026-10-08T23:55:00Z", "2026-10-08"],
    ["after midnight", "2026-10-09T00:10:00Z", "2026-10-09"],
    ["at the end of the next day", "2026-10-09T23:59:59Z", "2026-10-09"],
  ])("are those of the day it is read on, %s", (_, read, today) => {
    for (const asked of questions) {
      const hours = hoursFor(data, asked, utc(read));
      if (!Array.isArray(hours)) throw new Error(`no hours for ${JSON.stringify(asked)}`);

      const start = utc(`${today}T00:00:00Z`) - asked.pastDays * DAY * 1000;
      expect(hours).toHaveLength((asked.days + asked.pastDays) * 24);
      expect(hours[0]?.time.getTime()).toBe(start);
      expect(hours.at(-1)?.time.getTime()).toBe(start + (hours.length - 1) * HOUR * 1000);
    }
  });

  it("are refused when what is kept does not reach the days asked for", () => {
    const twoDaysOn = utc("2026-10-10T00:05:00Z");
    expect(hoursFor(data, { days: 7 }, twoDaysOn)).toBe("short");
    expect(hoursFor(data, { days: 6 }, twoDaysOn)).toHaveLength(6 * 24);
    // The days before the first that is kept.
    expect(hoursFor(data, { days: 1, pastDays: 2 }, utc("2026-10-07T12:00:00Z"))).toBe("short");
    expect(hoursFor({ ...data, hours: answer(fetched, () => null).hours }, { days: 1 }, 0)).toBe(
      "short",
    );
  });

  it("say that a point has no sea from the hours asked for, not from all that is kept", () => {
    const tomorrow = utc("2026-10-09T00:00:00Z") / 1000;
    // Waves in the days that are past, and none from tomorrow on.
    const drying = answer(fetched, (seconds) => (seconds < tomorrow ? 1.5 : null));

    expect(hoursFor(drying, { days: 3 }, utc("2026-10-09T08:00:00Z"))).toBeNull();
    expect(hoursFor(drying, { days: 3, pastDays: 1 }, utc("2026-10-09T08:00:00Z"))).toHaveLength(
      4 * 24,
    );
  });
});

describe("the forecasts of a program", () => {
  const cellKey = (cell: Cell) => `${cell.latStep},${cell.lonStep}`;
  const here = { latitude: 43.63, longitude: -1.46, days: 3 };

  const down = () =>
    new UpstreamError({ url: "https://example.org", status: 503, retryable: true });
  const run = <Value, Failure>(effect: Effect.Effect<Value, Failure>) =>
    Effect.runPromise(Effect.result(effect));
  const got = async <Value, Failure>(effect: Effect.Effect<Value, Failure>) => {
    const result = await run(effect);
    if (Result.isFailure(result)) throw new Error(`failed: ${String(result.failure)}`);
    return result.success;
  };
  const failed = async <Value, Failure>(effect: Effect.Effect<Value, Failure>) => {
    const result = await run(effect);
    if (Result.isSuccess(result)) throw new Error("answered");
    return result.failure;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(utc("2026-10-09T08:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  // Time passes: the machine's clock and the time the program measures move together.
  const later = (ms: number) => void vi.advanceTimersByTime(ms);

  it("ask the provider once for a cell, keep the answer, and count each request", async () => {
    const { store, seen, rows } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);

    const first = await got(forecasts.get(here));
    // A point close by, in the same cell, and another question of the same point.
    const second = await got(forecasts.get({ latitude: 43.64, longitude: -1.47, days: 7 }));

    expect(first).toMatchObject({ stale: false, point: { latitude: 43.625 } });
    expect(first?.fetchedAt).toEqual(new Date("2026-10-09T08:00:00Z"));
    expect(first?.hours).toHaveLength(3 * 24);
    expect(second?.hours).toHaveLength(7 * 24);
    expect(state.asked).toBe(1);
    expect(seen).toEqual({ reads: 1, writes: 1, spent: 2 });
    expect([...rows.keys()]).toEqual(["873,-29"]);
  });

  it("share one fetch between the questions that arrive together", async () => {
    const { store } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);

    await Promise.all([
      got(forecasts.get(here)),
      got(forecasts.get(here)),
      got(forecasts.get(here)),
    ]);
    expect(state.asked).toBe(1);
  });

  it("read the store again after ten minutes, and ask the provider again after two hours", async () => {
    const { store, seen } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);
    await got(forecasts.get(here));

    later(9 * MINUTE_MS);
    await got(forecasts.get(here));
    expect(seen.reads).toBe(1);

    later(2 * MINUTE_MS);
    await got(forecasts.get(here));
    expect([seen.reads, state.asked]).toEqual([2, 1]);

    // Two hours after the fetch, whatever the memory held ten minutes ago.
    later(2 * HOUR_MS - 11 * MINUTE_MS);
    const again = await got(forecasts.get(here));
    expect(state.asked).toBe(2);
    expect(again?.fetchedAt).toEqual(new Date("2026-10-09T10:00:00Z"));
  });

  it("never keep a forecast in memory past the moment it stops being fresh", async () => {
    const { store } = memoryStore();
    const { fetch, state } = provider();
    await got(makeForecasts(store, fetch).get(here));

    // Another program reads the row five minutes before it stops being fresh.
    later(2 * HOUR_MS - 5 * MINUTE_MS);
    const other = makeForecasts(store, fetch);
    expect(await got(other.get(here))).toMatchObject({ stale: false });
    expect(state.asked).toBe(1);

    later(6 * MINUTE_MS);
    await got(other.get(here));
    expect(state.asked).toBe(2);
  });

  it("find in the store what another program fetched, and keep their memories apart", async () => {
    const shared = memoryStore();
    const { fetch, state } = provider();
    await got(makeForecasts(shared.store, fetch).get(here));

    const worker = makeForecasts(shared.store, fetch);
    expect((await got(worker.get(here)))?.hours).toHaveLength(3 * 24);
    expect(state.asked).toBe(1);

    // A program with another store knows nothing of it.
    const elsewhere = memoryStore();
    await got(makeForecasts(elsewhere.store, fetch).get(here));
    expect(state.asked).toBe(2);
    expect(elsewhere.seen.writes).toBe(1);
  });

  it("answer with an older forecast when the provider fails, say so, and try again a minute later", async () => {
    const { store } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);
    await got(forecasts.get(here));

    later(3 * HOUR_MS);
    state.fails = down;
    const stale = await got(forecasts.get(here));
    expect(stale).toMatchObject({ stale: true, fetchedAt: new Date("2026-10-09T08:00:00Z") });
    expect(state.asked).toBe(2);

    // The stale answer stays a minute in memory.
    later(30 * 1000);
    await got(forecasts.get(here));
    expect(state.asked).toBe(2);

    state.fails = null;
    later(31 * 1000);
    expect(await got(forecasts.get(here))).toMatchObject({ stale: false });
    expect(state.asked).toBe(3);
  });

  it("fail when the provider does and the forecast that is kept is more than a day old", async () => {
    const { store } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);
    await got(forecasts.get(here));

    state.fails = down;
    later(23 * HOUR_MS + 59 * MINUTE_MS + 30 * 1000);
    expect(await got(forecasts.get(here))).toMatchObject({ stale: true });
    // Kept in memory for a minute, and its day is over before that.
    later(45 * 1000);
    expect(await failed(forecasts.get(here))).toMatchObject({ _tag: "ProviderLeftAlone" });
    later(2 * MINUTE_MS);
    expect(await failed(forecasts.get(here))).toMatchObject({ _tag: "UpstreamError" });
  });

  it("leave the provider alone for a minute after it failed, then let one question try", async () => {
    const { store, seen } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);
    const elsewhere = { latitude: 48.4, longitude: -4.6, days: 3 };

    state.fails = down;
    expect(await failed(forecasts.get(here))).toMatchObject({ _tag: "UpstreamError" });
    expect(await failed(forecasts.get(elsewhere))).toMatchObject({ _tag: "ProviderLeftAlone" });
    expect(await failed(forecasts.get(here))).toMatchObject({ _tag: "ProviderLeftAlone" });
    expect([state.asked, seen.spent]).toEqual([1, 2]);

    later(61 * 1000);
    expect(await failed(forecasts.get(here))).toMatchObject({ _tag: "UpstreamError" });
    expect(await failed(forecasts.get(elsewhere))).toMatchObject({ _tag: "ProviderLeftAlone" });
    expect(state.asked).toBe(2);

    later(61 * 1000);
    state.fails = null;
    await got(forecasts.get(here));
    await got(forecasts.get(elsewhere));
    expect(state.asked).toBe(4);
  });

  it("go on asking after the refusal of one question, or an answer that cannot be read", async () => {
    const { store } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);

    const failures = [
      () => new UpstreamError({ url: "https://example.org", status: 400, retryable: false }),
      () => new UpstreamError({ url: "https://example.org", retryable: false, cause: "not JSON" }),
      () => new ForecastFormatError({ message: "changed" }),
    ];
    for (const [index, failure] of failures.entries()) {
      state.fails = failure;
      await failed(forecasts.get(here));
      // Another cell is asked for at once, and answered.
      state.fails = null;
      await got(forecasts.get({ latitude: 48 + index, longitude: -4.6, days: 3 }));
    }
    expect(state.asked).toBe(6);
  });

  it("send nothing once the budget is spent, and answer with what is kept", async () => {
    const { store, seen, limit } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);
    await got(forecasts.get(here));

    limit(seen.spent);
    later(3 * HOUR_MS);
    expect(await got(forecasts.get(here))).toMatchObject({ stale: true });
    expect(
      await failed(forecasts.get({ latitude: 48.4, longitude: -4.6, days: 3 })),
    ).toBeInstanceOf(BudgetSpent);
    // The provider was not asked, and is not taken for one that failed.
    expect(state.asked).toBe(1);
    limit(Infinity);
    later(2 * MINUTE_MS);
    expect(await got(forecasts.get(here))).toMatchObject({ stale: false });
  });

  it("take a row that cannot be read for a missing one", async () => {
    const { store, rows } = memoryStore();
    const { fetch, state } = provider();
    rows.set("873,-29", { fetchedAt: new Date(), data: { point: null, hours: [] } });

    expect(await got(makeForecasts(store, fetch).get(here))).toMatchObject({ stale: false });
    expect(state.asked).toBe(1);
  });

  it("return the forecast that is kept when another program's fetch started later", async () => {
    const { store, rows } = memoryStore();
    const { fetch } = provider();
    const winner = { ...answer(Date.now()), point: { latitude: 1, longitude: 2 } };
    const forecasts = makeForecasts(
      {
        ...store,
        // The other program writes while this one waits for the provider.
        write: async (cell, row) => {
          rows.set(cellKey(cell), {
            fetchedAt: new Date(row.fetchedAt.getTime() + 500),
            data: winner,
          });
          return store.write(cell, row);
        },
      },
      fetch,
    );

    expect(await got(forecasts.get(here))).toMatchObject({
      point: { latitude: 1, longitude: 2 },
      fetchedAt: new Date("2026-10-09T08:00:00.500Z"),
    });
  });

  it("answer from what was fetched when it cannot be written, and fail when nothing can be read", async () => {
    const { store } = memoryStore();
    const { fetch } = provider();
    const unwritable = makeForecasts(
      { ...store, write: () => Promise.reject(new Error("no write")) },
      fetch,
    );
    expect(await got(unwritable.get(here))).toMatchObject({ stale: false });

    const unreadable = makeForecasts(
      { ...store, read: () => Promise.reject(new Error("no read")) },
      fetch,
    );
    expect(await failed(unreadable.get(here))).toMatchObject({ _tag: "ForecastStoreError" });
  });

  it("count a forecast's age on the time that passed, whatever the machine's clock is set to", async () => {
    // The database keeps its own time, which the setting of this machine's clock does not move.
    const offset = Date.now() - performance.now();
    const { store } = memoryStore(() => new Date(offset + performance.now()));
    const { fetch, state } = provider();
    await got(makeForecasts(store, fetch).get(here));

    // A program takes the forecast into its memory a minute before it stops being fresh.
    later(2 * HOUR_MS - MINUTE_MS);
    const other = makeForecasts(store, fetch);
    await got(other.get(here));
    expect(state.asked).toBe(1);

    // Two minutes pass, and the machine's clock is set back half an hour.
    later(2 * MINUTE_MS);
    vi.setSystemTime(Date.now() - 30 * MINUTE_MS);
    await got(other.get(here));
    expect(state.asked).toBe(2);
  });

  it("keep the age of a forecast that could not be written, across midnight", async () => {
    vi.setSystemTime(utc("2026-10-09T23:59:59Z"));
    const { store } = memoryStore();
    const { state } = provider();
    // The provider takes three seconds, and the store takes no write.
    const slow: Parameters<typeof makeForecasts>[1] = (_cell, spend) =>
      Effect.gen(function* () {
        yield* spend;
        state.asked += 1;
        later(3000);
        return answer(Date.now());
      });
    const forecasts = makeForecasts(
      { ...store, write: () => Promise.reject(new Error("no write")) },
      slow,
    );

    const found = await got(forecasts.get(here));

    // Asked for before midnight and answered after it: the hours are the new day's.
    expect(found.fetchedAt).toEqual(new Date("2026-10-09T23:59:59Z"));
    expect(found.hours?.[0]?.time).toEqual(new Date("2026-10-10T00:00:00Z"));
    // It was not written, so it answers from this program's memory alone, for ten minutes
    // counted from the moment its fetch started.
    later(10 * MINUTE_MS - 3500);
    await got(forecasts.get(here));
    expect(state.asked).toBe(1);
    later(1000);
    await got(forecasts.get(here));
    expect(state.asked).toBe(2);
  });

  it("say that an older forecast is one, when it shows no sea either", async () => {
    const { store, rows } = memoryStore();
    const { fetch, state } = provider();
    rows.set("873,-29", {
      fetchedAt: new Date(Date.now() - 3 * HOUR_MS),
      data: answer(Date.now(), () => null),
    });
    state.fails = down;

    expect(await got(makeForecasts(store, fetch).get(here))).toMatchObject({
      hours: null,
      stale: true,
    });
  });

  it("leave a fetch to the questions that still wait for it when one gives up", async () => {
    const { store } = memoryStore();
    const { state } = provider();
    const release = Promise.withResolvers<void>();
    const asked = Promise.withResolvers<void>();
    const held: Parameters<typeof makeForecasts>[1] = () =>
      Effect.gen(function* () {
        state.asked += 1;
        asked.resolve();
        yield* Effect.promise(() => release.promise);
        return answer(Date.now());
      });
    const forecasts = makeForecasts(store, held);

    const gone = Effect.runFork(forecasts.get(here));
    const patient = Effect.runPromise(forecasts.get(here));
    await asked.promise;
    await Effect.runPromise(Fiber.interrupt(gone));
    release.resolve();

    expect((await patient).hours).toHaveLength(3 * 24);
    expect(state.asked).toBe(1);
  });

  it("let one question try a provider that failed, and free the way when that one gives up or cannot be counted", async () => {
    const { store } = memoryStore();
    const { fetch, state } = provider();
    let spendFails = false;
    const forecasts = makeForecasts(
      {
        ...store,
        spend: () => (spendFails ? Promise.reject(new Error("no count")) : store.spend()),
      },
      fetch,
    );
    const cells = [0, 1, 2, 3].map((index) => ({ latitude: 48 + index, longitude: -4.6, days: 3 }));

    state.fails = down;
    await failed(forecasts.get(here));
    later(61 * 1000);

    // The minute is over, and four questions arrive together: one of them tries.
    const together = await Promise.all(cells.map((cell) => failed(forecasts.get(cell))));
    expect(together.map((failure) => (failure as { _tag: string })._tag).sort()).toEqual([
      "ProviderLeftAlone",
      "ProviderLeftAlone",
      "ProviderLeftAlone",
      "UpstreamError",
    ]);
    expect(state.asked).toBe(2);

    // The one that tries next cannot be counted: the way is free for the one after it.
    later(61 * 1000);
    spendFails = true;
    expect(await failed(forecasts.get(here))).toMatchObject({ _tag: "ForecastStoreError" });
    spendFails = false;
    state.fails = null;
    expect((await got(forecasts.get(here))).stale).toBe(false);
  });

  it("say that a point has no sea over the hours asked for", async () => {
    const { store, rows } = memoryStore();
    const { fetch, state } = provider();
    rows.set("873,-29", { fetchedAt: new Date(), data: answer(Date.now(), () => null) });

    expect(await got(makeForecasts(store, fetch).get(here))).toMatchObject({
      hours: null,
      stale: false,
    });
    expect(state.asked).toBe(0);
  });

  it("ask again for a forecast that does not cover the day, and refuse the days it lacks", async () => {
    const { store, rows } = memoryStore();
    const { fetch, state } = provider();
    const forecasts = makeForecasts(store, fetch);
    // A row fetched a moment ago, whose hours start two days early: it lacks the last day.
    // One day early would still cover: the span that is kept has a day to spare.
    rows.set("873,-29", {
      fetchedAt: new Date(Date.now() - MINUTE_MS),
      data: answer(Date.now() - 48 * HOUR_MS),
    });

    expect((await got(forecasts.get({ ...here, days: 7 })))?.hours).toHaveLength(7 * 24);
    expect(state.asked).toBe(1);

    // And when the provider itself answers so, the question it cannot answer is refused, and
    // the one it can is answered.
    state.behind = 48 * HOUR_MS;
    const elsewhere = { latitude: 48.4, longitude: -4.6 };
    expect(await failed(forecasts.get({ ...elsewhere, days: 7 }))).toMatchObject({
      _tag: "ForecastTooShort",
    });
    expect((await got(forecasts.get({ ...elsewhere, days: 3 })))?.hours).toHaveLength(3 * 24);
  });
});
