import { providerDown, testForecasts } from "@repo/conditions/forecasts/testing";
import { accountSuspension } from "@repo/db/schema/access";
import { alert, alertSettings, alertSpot, alertWindow, notification } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { job } from "@repo/db/schema/instance";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { alertsDone, evaluateAlerts } from "./alerts";
import { recorded } from "./runs";

// The looks at the alerts, against forecasts that are fresh, stale, or not to be had: decisions
// 031 and 023. The provider is a function. No test asks the real one.
describe.skipIf(!TEST_DATABASE_URL)("the looks at the alerts", () => {
  // A Friday morning, at the minute the job runs.
  const AT = new Date("2026-10-09T08:20:00Z");
  const HOUR_MS = 60 * 60 * 1000;
  const SATURDAY = Date.UTC(2026, 9, 10);
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let kept: ReturnType<typeof testForecasts>;

  // A swell that meets the alert between two hours of Saturday, and at no other hour.
  const swellBetween = (from: number, to: number) => (seconds: number) =>
    seconds * 1000 >= SATURDAY + from * HOUR_MS && seconds * 1000 < SATURDAY + to * HOUR_MS
      ? 1.2
      : 0.2;
  const saturday = (from: number, to: number) => ({
    start: new Date(SATURDAY + from * HOUR_MS).toISOString(),
    end: new Date(SATURDAY + to * HOUR_MS).toISOString(),
  });

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.db.insert(user).values({ id: "owner", name: "Owner", email: "o@example.org" });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
    kept.provider.waves = swellBetween(8, 12);
    await database.db.delete(notification);
    await database.db.delete(alert);
    await database.db.delete(alertSettings);
    await database.db.delete(spot);
    await database.db
      .insert(spot)
      .values({ id: "home", userId: "owner", name: "Home", latitude: 43.63, longitude: -1.46 });
    await database.db.insert(alert).values({
      id: "bay",
      userId: "owner",
      name: "The bay",
      criteria: { swellHeightMeters: { min: 1 } },
    });
    await database.db.insert(alertSpot).values({ spotId: "home", alertId: "bay", position: 0 });
    // An account that goes at any hour, by night as by day: its hours are the sea's.
    await database.db.insert(alertSettings).values({ userId: "owner", daylightOnly: false });
  });

  const run = (forecasts = kept.forecasts) =>
    Effect.runPromise(evaluateAlerts(database.db, forecasts));
  /** The next look, three hours on. */
  const next = (forecasts = kept.forecasts) => {
    vi.advanceTimersByTime(3 * HOUR_MS);
    return run(forecasts);
  };
  const notifications = () =>
    database.db.select().from(notification).orderBy(notification.createdAt, notification.moment);
  const said = async () =>
    (await notifications()).map((row) => [
      row.moment,
      ...row.payload.lines.map((line) => ({
        spot: line.spotName,
        open: line.open,
        ...(line.before ? { before: line.before } : {}),
      })),
    ]);
  const windows = async () =>
    (
      await database.db.select().from(alertWindow).orderBy(alertWindow.spotId, alertWindow.seaStart)
    ).map((row) => ({
      spot: row.spotId,
      start: row.seaStart.toISOString(),
      end: row.seaEnd.toISOString(),
      seen: row.seen,
    }));
  const toldAt = async (spotId = "home") =>
    (await database.db.select().from(alertSpot).where(eq(alertSpot.spotId, spotId)))[0]?.told;
  const settings = (changes: Partial<typeof alertSettings.$inferInsert>) =>
    database.db.update(alertSettings).set(changes).where(eq(alertSettings.userId, "owner"));

  describe("of a spot that is in two alerts", () => {
    beforeEach(async () => {
      await database.db.insert(alert).values({
        id: "big",
        userId: "owner",
        name: "Big days",
        criteria: { swellHeightMeters: { min: 2 } },
      });
      await database.db.insert(alertSpot).values({ spotId: "home", alertId: "big", position: 0 });
      // Small on Saturday morning, big in its afternoon.
      kept.provider.waves = (seconds) => {
        const hour = (seconds * 1000 - SATURDAY) / HOUR_MS;
        return hour >= 8 && hour < 12 ? 1.2 : hour >= 14 && hour < 18 ? 2.5 : 0.2;
      };
    });

    it("look at it for each, and tell each what its own conditions find", async () => {
      expect(await run()).toEqual({ spots: 2, created: 0, failed: 0, stale: 0 });
      expect(await next()).toMatchObject({ spots: 2, created: 2 });

      const told = (await notifications()).map((row) => [
        row.alertId,
        row.payload.alertName,
        row.payload.lines.flatMap((line) => line.open),
      ]);
      expect(told).toHaveLength(2);
      expect(told).toEqual(
        expect.arrayContaining([
          ["bay", "The bay", [saturday(8, 12), saturday(14, 18)]],
          ["big", "Big days", [saturday(14, 18)]],
        ]),
      );
    });

    it("keep for each what it saw and told there, whatever the other does", async () => {
      await run();
      await next();
      // The big days go: the small ones stay as they were.
      kept.provider.waves = swellBetween(8, 12);
      await next();

      const seen = await database.db
        .select()
        .from(alertWindow)
        .orderBy(alertWindow.alertId, alertWindow.seaStart);
      expect(seen.map((row) => [row.alertId, row.seaStart.toISOString(), row.seen])).toEqual([
        ["bay", saturday(8, 12).start, 3],
      ]);
      const links = await database.db.select().from(alertSpot).orderBy(alertSpot.alertId);
      expect(links.map((row) => [row.alertId, row.told])).toEqual([
        // The afternoon was missed once by each: two looks call it off.
        [
          "bay",
          [
            { ...saturday(8, 12), missed: 0 },
            { ...saturday(14, 18), missed: 1 },
          ],
        ],
        ["big", [{ ...saturday(14, 18), missed: 1 }]],
      ]);
    });
  });

  describe("of a window", () => {
    it("tell it once two in a row have found it, and once only", async () => {
      expect(await run()).toEqual({ spots: 1, created: 0, failed: 0, stale: 0 });
      expect(await windows()).toEqual([{ spot: "home", ...saturday(8, 12), seen: 1 }]);
      expect(await toldAt()).toEqual([]);

      expect(await next()).toEqual({ spots: 1, created: 1, failed: 0, stale: 0 });
      const [found] = await notifications();
      expect(found).toMatchObject({
        userId: "owner",
        alertId: "bay",
        moment: "found",
        readAt: null,
        payload: {
          alertName: "The bay",
          zone: "UTC",
          lines: [
            {
              spotId: "home",
              spotName: "Home",
              forecastFetchedAt: new Date().toISOString(),
              open: [saturday(8, 12)],
              // What the forecast gives for the first of its hours.
              sea: { swellHeightMeters: 1.2, swellPeriodSeconds: 11, windSpeedMetersPerSecond: 5 },
            },
          ],
        },
      });
      expect(await toldAt()).toEqual([{ ...saturday(8, 12), missed: 0 }]);

      expect(await next()).toMatchObject({ spots: 1, created: 0 });
      expect(await windows()).toEqual([{ spot: "home", ...saturday(8, 12), seen: 3 }]);
    });

    it("tell it again when it moved by more than two hours, and call it off when two miss it", async () => {
      await run();
      await next();

      kept.provider.waves = swellBetween(11, 15);
      expect(await next()).toMatchObject({ created: 1 });
      kept.provider.waves = () => 0.2;
      expect(await next()).toMatchObject({ created: 0 });
      expect(await toldAt()).toEqual([{ ...saturday(11, 15), missed: 1 }]);
      expect(await next()).toMatchObject({ created: 1 });

      expect(await said()).toEqual([
        ["found", { spot: "Home", open: [saturday(8, 12)] }],
        ["moved", { spot: "Home", open: [saturday(11, 15)], before: [saturday(8, 12)] }],
        ["gone", { spot: "Home", open: [], before: [saturday(11, 15)] }],
      ]);
      expect([await windows(), await toldAt()]).toEqual([[], []]);
    });

    it("tell the hours the account can use, and nothing of a window that has none", async () => {
      // Mornings until ten, every day.
      await settings({ week: Array(7).fill([{ from: 0, to: 600 }]) });
      await run();
      await next();
      expect(await said()).toEqual([["found", { spot: "Home", open: [saturday(8, 10)] }]]);

      // The sea moves to the afternoon: it is kept in mind, and its told hours are called off.
      kept.provider.waves = swellBetween(13, 17);
      await next();
      await next();
      expect((await said()).at(-1)).toEqual([
        "gone",
        { spot: "Home", open: [], before: [saturday(8, 10)] },
      ]);
      expect(await windows()).toMatchObject([{ ...saturday(13, 17) }]);
    });

    it("wait for it to come within the days the account asked for", async () => {
      // Friday: one day ahead is Saturday, and no day ahead of Thursday the 8th was.
      vi.setSystemTime(new Date("2026-10-08T08:20:00Z"));
      await settings({ horizonDays: 1 });
      await run();
      expect(await next()).toMatchObject({ spots: 1, created: 0 });
      expect(await windows()).toMatchObject([{ seen: 2 }]);

      // On Friday it is told, by the first look of the day.
      vi.setSystemTime(new Date("2026-10-08T23:20:00Z"));
      expect(await next()).toMatchObject({ created: 1 });
      expect(await said()).toEqual([["found", { spot: "Home", open: [saturday(8, 12)] }]]);
    });

    it("read the account's days and hours on its own clock", async () => {
      // Auckland is thirteen hours ahead: Saturday from 08:00 to 14:00 UTC runs across its
      // midnight, and an account that goes on Sunday mornings there has the hours after it.
      kept.provider.waves = swellBetween(8, 14);
      await settings({
        zone: "Pacific/Auckland",
        week: [[], [], [], [], [], [], [{ from: 0, to: 600 }]],
      });
      await run();
      await next();

      expect(await said()).toEqual([["found", { spot: "Home", open: [saturday(11, 14)] }]]);
      expect((await notifications())[0]?.payload.zone).toBe("Pacific/Auckland");
    });

    it("write one notification for an alert on several spots, with a line for each", async () => {
      await database.db
        .insert(spot)
        .values({ id: "north", userId: "owner", name: "North", latitude: 43.7, longitude: -1.44 });
      await database.db.insert(alertSpot).values({ spotId: "north", alertId: "bay", position: 1 });

      expect(await run()).toMatchObject({ spots: 2, created: 0 });
      expect(await next()).toMatchObject({ spots: 2, created: 1 });
      expect(await said()).toEqual([
        [
          "found",
          { spot: "Home", open: [saturday(8, 12)] },
          { spot: "North", open: [saturday(8, 12)] },
        ],
      ]);
    });

    it("look at an alert once in three hours, whoever runs", async () => {
      await run();
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(await run()).toEqual({ spots: 0, created: 0, failed: 0, stale: 0 });
      expect(await windows()).toMatchObject([{ seen: 1 }]);
    });

    it("do not count one forecast twice when a worker starts just before the job's hour", async () => {
      // A worker that starts at 08:59 looks at once, and its job runs again at 09:20.
      vi.setSystemTime(new Date("2026-10-09T08:59:00Z"));
      await run();
      vi.setSystemTime(new Date("2026-10-09T09:20:00Z"));
      expect(await run()).toEqual({ spots: 0, created: 0, failed: 0, stale: 0 });
      expect(kept.provider.asked).toBe(1);

      // The job of 12:20 is the second look, on a forecast fetched since.
      vi.setSystemTime(new Date("2026-10-09T12:20:00Z"));
      expect(await run()).toMatchObject({ spots: 1, created: 1 });
      expect(kept.provider.asked).toBe(2);
    });

    it("date a look from the moment it is applied, in a run that takes long", async () => {
      // A run that begins at 08:20 and comes to this alert two hours later.
      const slow = testForecasts();
      slow.provider.waves = swellBetween(8, 12);
      const fetched = slow.forecasts.get;
      let isLate = true;
      const forecasts = {
        ...slow.forecasts,
        get: (query: Parameters<typeof fetched>[0]) => {
          if (isLate) vi.advanceTimersByTime(2 * HOUR_MS);
          return fetched(query);
        },
      } as typeof slow.forecasts;
      await run(forecasts);
      isLate = false;

      // An hour on, another run reads the same forecast, still fresh: it is no second look.
      vi.advanceTimersByTime(HOUR_MS);
      expect(await run(forecasts)).toEqual({ spots: 0, created: 0, failed: 0, stale: 0 });
      expect(slow.provider.asked).toBe(1);
      expect(await windows()).toMatchObject([{ seen: 1 }]);
    });

    it("tell of the same moment at two looks of one morning, each for itself", async () => {
      await run();
      await next();
      kept.provider.waves = swellBetween(11, 15);
      await next();
      kept.provider.waves = swellBetween(8, 12);
      await next();

      expect((await said()).map(([moment]) => moment)).toEqual(["found", "moved", "moved"]);
      expect(new Set((await notifications()).map((row) => row.key)).size).toBe(3);
    });

    it("leave an alert that is switched off, and one that asks nothing of the sea", async () => {
      await database.db.update(alert).set({ enabled: false });
      expect(await run()).toMatchObject({ spots: 0 });

      await database.db.update(alert).set({ enabled: true, criteria: {} });
      expect(await run()).toMatchObject({ spots: 0 });
      expect(kept.provider.asked).toBe(0);
    });
  });

  describe("after a change of the account's settings", () => {
    it("say nothing of the hours it moved, and hold the next move of the sea against them", async () => {
      await run();
      await next();

      // From ten on, every day: the told hours are cut, and that is no news.
      await settings({ week: Array(7).fill([{ from: 600, to: 1440 }]) });
      expect(await next()).toMatchObject({ created: 0 });
      expect(await toldAt()).toEqual([{ ...saturday(10, 12), missed: 0 }]);

      kept.provider.waves = swellBetween(8, 15);
      expect(await next()).toMatchObject({ created: 1 });
      expect((await said()).at(-1)).toEqual([
        "moved",
        { spot: "Home", open: [saturday(10, 15)], before: [saturday(10, 12)] },
      ]);
    });

    it("call nothing off when the account is away, and tell what is there when it is back", async () => {
      await run();
      await next();

      await settings({ awayUntil: new Date(SATURDAY + 24 * HOUR_MS) });
      expect(await next()).toMatchObject({ created: 0 });
      expect(await next()).toMatchObject({ created: 0 });
      expect(await toldAt()).toEqual([]);

      await settings({ awayUntil: null });
      expect(await next()).toMatchObject({ created: 1 });
      expect((await said()).map(([moment]) => moment)).toEqual(["found", "found"]);
    });

    it("leave a moment that is switched off untold", async () => {
      await settings({ onFound: false });
      await run();
      expect(await next()).toMatchObject({ spots: 1, created: 0 });
      expect(await toldAt()).toEqual([]);

      // Hours that were told are followed without a word when changes are switched off.
      await settings({ onFound: true, onChange: false });
      expect(await next()).toMatchObject({ created: 1 });
      kept.provider.waves = swellBetween(13, 17);
      expect(await next()).toMatchObject({ created: 0 });
      expect(await toldAt()).toEqual([{ ...saturday(13, 17), missed: 0 }]);
    });
  });

  describe("on a forecast that is not fresh", () => {
    it("write nothing, count the spot as left, and take up where they were", async () => {
      await run();
      const before = [await windows(), await toldAt()];

      // Three hours on, the provider is down: what is kept is an older forecast.
      kept.provider.fails = providerDown;
      expect(await next()).toEqual({ spots: 0, created: 0, failed: 0, stale: 1 });
      expect([await windows(), await toldAt()]).toEqual(before);
      expect(await notifications()).toEqual([]);

      // The look after is the second that finds the window: the one between was none.
      kept.provider.fails = null;
      expect(await next()).toEqual({ spots: 1, created: 1, failed: 0, stale: 0 });
    });

    it("do not count it against a window that was told", async () => {
      await run();
      await next();
      kept.provider.waves = () => 0.2;
      await next();

      kept.provider.fails = providerDown;
      expect(await next()).toMatchObject({ stale: 1, created: 0 });
      expect(await toldAt()).toEqual([{ ...saturday(8, 12), missed: 1 }]);
      kept.provider.fails = null;
      expect(await next()).toMatchObject({ created: 1 });
      expect((await said()).at(-1)?.[0]).toBe("gone");
    });

    it("look at a spot that has no sea forecast, and find nothing there", async () => {
      kept.provider.waves = () => null;
      expect(await run()).toEqual({ spots: 1, created: 0, failed: 0, stale: 0 });
      expect(await windows()).toEqual([]);
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
        counts: { spots: 1, created: 0, failed: 0, stale: 0 },
      });

      // A provider that fails from then on, and a forecast that has grown old: the alert is
      // due again, and its spot is left.
      await database.db.update(alert).set({ lookedAt: new Date(Date.now() - 3 * HOUR_MS) });
      for (const row of kept.rows.values()) row.fetchedAt = new Date(Date.now() - 3 * HOUR_MS);
      const stale = testForecasts();
      for (const [key, row] of kept.rows) stale.rows.set(key, row);
      stale.provider.fails = providerDown;
      kept = stale;
      expect(await outcome()).toMatchObject({
        outcome: "degraded",
        counts: { spots: 0, created: 0, failed: 0, stale: 1 },
      });
    });

    it("look at the spots of an alert that can be read when another cannot", async () => {
      // Far from the first, in another cell of the forecast, which the provider fails for.
      await database.db
        .insert(spot)
        .values({ id: "far", userId: "owner", name: "Far", latitude: 47.84, longitude: -4.35 });
      await database.db.insert(alertSpot).values({ spotId: "far", alertId: "bay", position: 1 });
      const some = testForecasts();
      some.provider.waves = swellBetween(8, 12);
      const fetched = some.forecasts.get;
      const forecasts = {
        ...some.forecasts,
        get: (query: Parameters<typeof fetched>[0]) =>
          query.latitude > 45 ? Effect.fail(providerDown()) : fetched(query),
      } as typeof some.forecasts;

      expect(await run(forecasts)).toEqual({ spots: 1, created: 0, failed: 0, stale: 1 });
      expect(await next(forecasts)).toEqual({ spots: 1, created: 1, failed: 0, stale: 1 });
      expect(await said()).toEqual([["found", { spot: "Home", open: [saturday(8, 12)] }]]);
      // The spot that could not be read is as it was: never looked at.
      const [far] = await database.db.select().from(alertSpot).where(eq(alertSpot.spotId, "far"));
      expect(far).toMatchObject({ lookedAt: null, told: [], cutBy: null });
    });

    it("count an alert as failed when no forecast can be had for it", async () => {
      kept.provider.fails = providerDown;

      expect(await run()).toEqual({ spots: 0, created: 0, failed: 1, stale: 0 });
      expect(await windows()).toEqual([]);
    });

    it("count an alert as failed when the instance has asked all it may", async () => {
      kept.limit(0);

      expect(await run()).toEqual({ spots: 0, created: 0, failed: 1, stale: 0 });
      expect(kept.provider.asked).toBe(0);
    });
  });

  describe("of an account that is kept out", () => {
    it("leave its alerts, and ask no forecast for them", async () => {
      await database.db.insert(accountSuspension).values({ userId: "owner" });

      expect(await run()).toEqual({ spots: 0, created: 0, failed: 0, stale: 0 });
      expect(kept.provider.asked).toBe(0);

      await database.db.delete(accountSuspension);
      expect(await run()).toMatchObject({ spots: 1 });
    });

    // Forecasts during whose fetching something is done to the database.
    const meanwhile = (change: () => Promise<unknown>) => {
      const during = testForecasts();
      during.provider.waves = swellBetween(8, 12);
      const fetched = during.forecasts.get;
      const forecasts = {
        ...during.forecasts,
        get: (query: Parameters<typeof fetched>[0]) =>
          Effect.gen(function* () {
            const found = yield* fetched(query);
            yield* Effect.promise(change);
            return found;
          }),
      };
      return { forecasts, provider: during.provider };
    };

    it("ask no forecast for an alert whose owner was suspended while another was looked at", async () => {
      await database.db.insert(user).values({ id: "other", name: "Other", email: "x@example.org" });
      await database.db
        .insert(spot)
        .values({ id: "theirs", userId: "other", name: "Theirs", latitude: 48.4, longitude: -4.8 });
      await database.db.insert(alert).values({
        id: "theirs",
        userId: "other",
        name: "Theirs",
        criteria: { swellHeightMeters: { min: 1 } },
      });
      await database.db
        .insert(alertSpot)
        .values({ spotId: "theirs", alertId: "theirs", position: 0 });
      // Both accounts are suspended while the first alert's forecast is fetched: whichever
      // alert comes second is not asked for.
      const during = meanwhile(() =>
        database.db
          .insert(accountSuspension)
          .values([{ userId: "owner" }, { userId: "other" }])
          .onConflictDoNothing(),
      );

      try {
        expect(await run(during.forecasts)).toEqual({ spots: 1, created: 0, failed: 0, stale: 0 });
        expect(during.provider.asked).toBe(1);
        expect(await windows()).toEqual([]);
      } finally {
        await database.db.delete(user).where(eq(user.id, "other"));
        await database.db.delete(accountSuspension);
      }
    });

    it("write nothing of an alert whose owner was suspended while its forecast was fetched", async () => {
      const during = meanwhile(() =>
        database.db.insert(accountSuspension).values({ userId: "owner" }),
      );

      expect(await run(during.forecasts)).toEqual({ spots: 1, created: 0, failed: 0, stale: 0 });
      expect(await windows()).toEqual([]);
      await database.db.delete(accountSuspension);
    });
  });

  describe("of an alert that changed while its forecast was fetched", () => {
    const changing = (change: () => Promise<unknown>) => {
      const during = testForecasts();
      during.provider.waves = swellBetween(8, 12);
      const fetched = during.forecasts.get;
      return {
        ...during.forecasts,
        get: (query: Parameters<typeof fetched>[0]) =>
          Effect.gen(function* () {
            const found = yield* fetched(query);
            yield* Effect.promise(change);
            return found;
          }),
      };
    };

    it("write what they saw when it was renamed, or its spot described", async () => {
      const forecasts = changing(async () => {
        await database.db.update(alert).set({ name: "Another name" });
        await database.db.update(spot).set({ characteristics: { breakTypes: ["reef"] } });
      });

      expect(await run(forecasts)).toMatchObject({ spots: 1 });
      expect(await windows()).toHaveLength(1);
    });

    it.each([
      // What the API does of a change to what a look reads: it counts it.
      ["asked otherwise", { revision: sql`${alert.revision} + 1` }],
      ["switched off", { enabled: false }],
    ])("write nothing when it was %s", async (_what, change) => {
      const forecasts = changing(() => database.db.update(alert).set(change));

      expect(await run(forecasts)).toMatchObject({ spots: 1, created: 0 });
      expect(await windows()).toEqual([]);
      expect((await database.db.select().from(alert))[0]?.lookedAt).toBeNull();
    });
  });
});
