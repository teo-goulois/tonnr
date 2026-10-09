import { answer, providerDown, testForecasts } from "@repo/conditions/forecasts/testing";
import { user } from "@repo/db/schema/auth";
import { accountSuspension } from "@repo/db/schema/access";
import { job } from "@repo/db/schema/instance";
import { notification, spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { alertsDone, evaluateAlerts } from "./alerts";
import { recorded } from "./runs";

// The alerts against forecasts that are fresh, stale, or not to be had: decisions 008 and 023.
// The provider is a function. No test asks the real one.
describe.skipIf(!TEST_DATABASE_URL)("the alerts and the forecast they are planned on", () => {
  const AT = new Date("2026-10-09T08:00:00Z");
  const HOUR_MS = 60 * 60 * 1000;
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let kept: ReturnType<typeof testForecasts>;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.db.insert(user).values({ id: "owner", name: "Owner", email: "o@example.org" });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
    await database.db.delete(spot);
    await database.db.insert(spot).values({
      id: "home",
      userId: "owner",
      name: "Home",
      latitude: 43.63,
      longitude: -1.46,
      // The forecast of the tests has a swell of 1.2 m at every hour.
      criteria: { swellHeightMeters: { min: 1 } },
      alertsEnabled: true,
    });
  });

  const run = () => Effect.runPromise(evaluateAlerts(database.db, kept.forecasts));
  const notifications = () =>
    database.db.select().from(notification).orderBy(notification.day, notification.kind);

  it("announce a window that a fresh forecast shows", async () => {
    expect(await run()).toEqual({ spots: 1, created: 1, failed: 0, stale: 0 });

    const [announced] = await notifications();
    expect(announced).toMatchObject({ spotId: "home", kind: "window_found", missedRuns: 0 });
  });

  it("write nothing at all on a stale forecast, and say how many spots were left", async () => {
    await run();
    // The window was missing from the run before this one: once more, and it is called off.
    await database.db.update(notification).set({ missedRuns: 1 });
    const before = await notifications();

    // Three hours on, the provider is down. What is kept still shows the window, and a fresh
    // forecast would show none.
    vi.advanceTimersByTime(3 * HOUR_MS);
    kept.provider.fails = providerDown;
    expect(await run()).toEqual({ spots: 1, created: 0, failed: 0, stale: 1 });
    expect(await notifications()).toEqual(before);

    // A program that reads a fresh forecast, with a swell too small for the spot, does the
    // planning: the window is missing a second time, and is called off.
    const fresh = testForecasts();
    const data = answer(Date.now());
    const flat = { ...data.hours, swellHeightMeters: data.hours.time.map(() => 0.2) };
    fresh.rows.set("873,-29", { fetchedAt: new Date(), data: { ...data, hours: flat } });
    expect(await Effect.runPromise(evaluateAlerts(database.db, fresh.forecasts))).toMatchObject({
      stale: 0,
      failed: 0,
    });
    expect((await notifications()).map((row) => row.kind)).toContain("window_cancelled");
  });

  it("count a spot as left on an older forecast that shows no sea either", async () => {
    kept.provider.waves = () => null;
    expect(await run()).toEqual({ spots: 1, created: 0, failed: 0, stale: 0 });

    vi.advanceTimersByTime(3 * HOUR_MS);
    kept.provider.fails = providerDown;
    expect(await run()).toEqual({ spots: 1, created: 0, failed: 0, stale: 1 });
    expect(await notifications()).toEqual([]);
  });

  it("say of a run with spots left that only a part of its work was done", async () => {
    // The job's row is written on the database's clock: no time is made up here.
    vi.useRealTimers();
    const outcome = async () => {
      await recorded(
        database.db,
        {
          job: { name: "evaluate-alerts", schedule: "20 */3 * * *" },
          workerId: "worker-1",
          startedAt: new Date(),
        },
        async () => alertsDone(await run()),
      );
      const [row] = await database.db.select().from(job).where(eq(job.name, "evaluate-alerts"));
      return row;
    };

    kept = testForecasts();
    expect(await outcome()).toMatchObject({
      outcome: "succeeded",
      counts: { spots: 1, created: 1, failed: 0, stale: 0 },
    });

    // A program whose provider fails, and that finds a forecast three hours old.
    kept = testForecasts();
    kept.rows.set("873,-29", {
      fetchedAt: new Date(Date.now() - 3 * HOUR_MS),
      data: answer(Date.now()),
    });
    kept.provider.fails = providerDown;
    expect(await outcome()).toMatchObject({
      outcome: "degraded",
      counts: { spots: 1, created: 0, failed: 0, stale: 1 },
    });
  });

  it("leave out the spots of a suspended account, and ask no forecast for them", async () => {
    await database.db.insert(accountSuspension).values({ userId: "owner" });

    expect(await run()).toEqual({ spots: 0, created: 0, failed: 0, stale: 0 });
    expect(kept.provider.asked).toBe(0);
    expect(await notifications()).toEqual([]);

    await database.db.delete(accountSuspension);
    expect(await run()).toMatchObject({ spots: 1, created: 1 });
  });

  it("ask no forecast for a spot whose owner was suspended while another spot was checked", async () => {
    await database.db.insert(user).values({ id: "other", name: "Other", email: "x@example.org" });
    await database.db.insert(spot).values({
      id: "theirs",
      userId: "other",
      name: "Theirs",
      latitude: 48.4,
      longitude: -4.8,
      criteria: { swellHeightMeters: { min: 1 } },
      alertsEnabled: true,
    });
    // Both accounts are suspended while the first spot's forecast is fetched: whichever spot
    // comes second is not asked for.
    const during = testForecasts();
    const fetched = during.forecasts.get;
    const forecasts = {
      ...during.forecasts,
      get: (query: Parameters<typeof fetched>[0]) =>
        Effect.gen(function* () {
          const found = yield* fetched(query);
          yield* Effect.promise(() =>
            database.db
              .insert(accountSuspension)
              .values([{ userId: "owner" }, { userId: "other" }])
              .onConflictDoNothing(),
          );
          return found;
        }),
    };

    try {
      expect(await Effect.runPromise(evaluateAlerts(database.db, forecasts))).toEqual({
        spots: 2,
        created: 0,
        failed: 0,
        stale: 0,
      });
      expect(during.provider.asked).toBe(1);
      expect(await notifications()).toEqual([]);
    } finally {
      await database.db.delete(user).where(eq(user.id, "other"));
      await database.db.delete(accountSuspension);
    }
  });

  it("announce nothing to an account that was suspended while its forecast was fetched", async () => {
    // The account is suspended between the moment the spots are listed and the writing.
    const during = testForecasts();
    const fetched = during.forecasts.get;
    const forecasts = {
      ...during.forecasts,
      get: (query: Parameters<typeof fetched>[0]) =>
        Effect.gen(function* () {
          const found = yield* fetched(query);
          yield* Effect.promise(() =>
            database.db.insert(accountSuspension).values({ userId: "owner" }),
          );
          return found;
        }),
    };

    expect(await Effect.runPromise(evaluateAlerts(database.db, forecasts))).toEqual({
      spots: 1,
      created: 0,
      failed: 0,
      stale: 0,
    });
    expect(await notifications()).toEqual([]);
    await database.db.delete(accountSuspension);
  });

  it("count a spot as failed when no forecast can be had for it", async () => {
    kept.provider.fails = providerDown;

    expect(await run()).toEqual({ spots: 1, created: 0, failed: 1, stale: 0 });
    expect(await notifications()).toEqual([]);
  });

  it("count a spot as failed when the instance has asked all it may", async () => {
    kept.limit(0);

    expect(await run()).toEqual({ spots: 1, created: 0, failed: 1, stale: 0 });
    expect(kept.provider.asked).toBe(0);
  });
});
