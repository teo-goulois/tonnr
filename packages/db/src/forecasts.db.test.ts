import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type Bucket, type Count, countCalls, currentCalls } from "./calls";
import { countForecastCells, forecastStore, pruneForecasts } from "./forecasts";
import { createDb } from "./index";
import { forecastCell, providerCalls } from "./schema/forecasts";
import { createTestDatabase, TEST_DATABASE_URL } from "./testing";

describe.skipIf(!TEST_DATABASE_URL)("the forecasts kept in the database", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(forecastCell);
    await database.db.delete(providerCalls);
  });

  const cell = { latStep: 873, lonStep: -29 };
  const budget = (day: string, limits: { day?: number; hour?: number; minute?: number } = {}) =>
    [
      { bucket: `day:${day}`, span: "day", limit: limits.day ?? 1000 },
      { bucket: "hour", span: "hour", limit: limits.hour ?? 1000 },
      { bucket: "minute", span: "minute", limit: limits.minute ?? 1000 },
    ] satisfies Bucket[];
  const store = (...given: Parameters<typeof budget>) =>
    forecastStore(database.db, "a-provider", budget(...given));
  const counts = async () =>
    Object.fromEntries(await currentCalls(database.db, "a-provider")) as Record<string, number>;

  describe("a cell's forecast", () => {
    it("is read with the database's time, which comes when there is no forecast", async () => {
      const before = Date.now();
      const found = await store("people").read(cell);

      expect(found.row).toBeNull();
      expect(Math.abs(found.now.getTime() - before)).toBeLessThan(5000);
    });

    it("comes back as it was written, with what it lacks", async () => {
      const data = { point: { latitude: 43.625, longitude: -1.4583 }, hours: [1.5, null, 0] };
      const fetchedAt = new Date("2026-10-09T08:00:00.123Z");

      const written = await store("people").write(cell, { fetchedAt, data });
      const found = await store("alerts").read(cell);

      expect(written.row).toEqual({ fetchedAt, data });
      expect(found.row).toEqual({ fetchedAt, data });
      expect(found.now).toBeInstanceOf(Date);
      // Another cell has none.
      expect((await store("people").read({ latStep: 873, lonStep: -28 })).row).toBeNull();
      expect(await countForecastCells(database.db)).toBe(1);
    });

    it("is the one whose fetch started last, whichever is written last", async () => {
      const at = (minute: number) => new Date(Date.UTC(2026, 9, 9, 8, minute));
      const { write, read } = store("people");

      await write(cell, { fetchedAt: at(10), data: "second" });
      // A fetch that started before, and took longer.
      const lost = await write(cell, { fetchedAt: at(5), data: "first" });
      expect(lost.row).toEqual({ fetchedAt: at(10), data: "second" });
      expect((await read(cell)).row).toEqual({ fetchedAt: at(10), data: "second" });

      const won = await write(cell, { fetchedAt: at(20), data: "third" });
      expect(won.row).toEqual({ fetchedAt: at(20), data: "third" });
    });
  });

  describe("a request to the provider", () => {
    it("is counted by the day, the hour and the minute", async () => {
      const people = store("people");
      expect(await people.spend()).toBe(true);
      expect(await people.spend()).toBe(true);

      expect(await counts()).toEqual({ "day:people": 2, hour: 2, minute: 2 });
    });

    it("is refused at a limit, and then counted nowhere", async () => {
      const people = store("people", { day: 3 });
      expect([await people.spend(), await people.spend(), await people.spend()]).toEqual([
        true,
        true,
        true,
      ]);

      expect(await people.spend()).toBe(false);
      expect(await people.spend()).toBe(false);
      // The hour and the minute did not keep the requests that the day refused.
      expect(await counts()).toEqual({ "day:people": 3, hour: 3, minute: 3 });
    });

    it("spends its program's share of the day, and the hour that both share", async () => {
      const people = store("people", { day: 2, hour: 5 });
      const alerts = store("alerts", { day: 4, hour: 5 });

      expect([await people.spend(), await people.spend(), await people.spend()]).toEqual([
        true,
        true,
        false,
      ]);
      // The worker's day is its own.
      expect([await alerts.spend(), await alerts.spend(), await alerts.spend()]).toEqual([
        true,
        true,
        true,
      ]);
      // The hour is full for both.
      expect(await alerts.spend()).toBe(false);
      expect(await counts()).toEqual({ "day:people": 2, "day:alerts": 3, hour: 5, minute: 5 });
    });

    it("never passes a limit, however many are counted at the same moment", async () => {
      const people = store("people", { minute: 20 });
      const alerts = store("alerts", { minute: 20 });

      const spent = await Promise.all(
        Array.from({ length: 60 }, (_, index) => (index % 2 ? people : alerts).spend()),
      );

      expect(spent.filter(Boolean)).toHaveLength(20);
      const found = await counts();
      expect(found.minute).toBe(20);
      expect(found.hour).toBe(20);
      expect((found["day:people"] ?? 0) + (found["day:alerts"] ?? 0)).toBe(20);
    });

    it("is counted in UTC, whatever time zone its connection keeps", async () => {
      const elsewhere = createDb(
        { DATABASE_URL: database.url },
        { options: "-c timezone=Asia/Tokyo" },
      );
      try {
        expect(await forecastStore(elsewhere, "a-provider", budget("people")).spend()).toBe(true);

        const rows = await database.db
          .select({
            bucket: providerCalls.bucket,
            isUtc: sql<boolean>`${providerCalls.start} = date_trunc(split_part(${providerCalls.bucket}, ':', 1), now(), 'UTC')`,
          })
          .from(providerCalls);
        expect(rows.map((row) => row.isUtc)).toEqual([true, true, true]);
        expect(Object.fromEntries(await currentCalls(elsewhere, "a-provider"))).toEqual({
          "day:people": 1,
          hour: 1,
          minute: 1,
        });
      } finally {
        await elsewhere.$client.end();
      }
    });

    it("of an hour that is over is not counted in this one", async () => {
      await database.db.insert(providerCalls).values([
        {
          provider: "a-provider",
          bucket: "hour",
          start: sql`date_trunc('hour', now(), 'UTC') - interval '1 hour'`,
          calls: 900,
        },
        {
          provider: "a-provider",
          bucket: "day:people",
          start: sql`date_trunc('day', now(), 'UTC') - interval '1 day'`,
          calls: 5000,
        },
        {
          provider: "another",
          bucket: "hour",
          start: sql`date_trunc('hour', now(), 'UTC')`,
          calls: 7,
        },
      ]);

      expect(await store("people", { hour: 1 }).spend()).toBe(true);
      expect(await counts()).toEqual({ "day:people": 1, hour: 1, minute: 1 });
    });
  });

  describe("a count under several names at once", () => {
    const mails = (hour: number, day: number, instance: number) =>
      [
        { provider: "mail:account-1", bucket: "hour", span: "hour", limit: hour },
        { provider: "mail:account-1", bucket: "day", span: "day", limit: day },
        { provider: "mail", bucket: "day", span: "day", limit: instance },
      ] satisfies Count[];
    const of = async (provider: string) =>
      Object.fromEntries(await currentCalls(database.db, provider)) as Record<string, number>;

    it("is taken in each of them, or in none, and says which was full and for how long", async () => {
      expect(await countCalls(database.db, mails(2, 5, 3))).toBeNull();
      expect(await countCalls(database.db, mails(2, 5, 3))).toBeNull();
      expect([await of("mail:account-1"), await of("mail")]).toEqual([
        { hour: 2, day: 2 },
        { day: 2 },
      ]);

      // The account's hour is full: nothing more is counted, the instance's day neither.
      const refused = await countCalls(database.db, mails(2, 5, 3));
      expect(refused?.map((full) => [full.provider, full.bucket])).toEqual([
        ["mail:account-1", "hour"],
      ]);
      const [hour] = refused ?? [];
      expect(hour?.retryAfterSeconds).toBeGreaterThan(0);
      expect(hour?.retryAfterSeconds).toBeLessThanOrEqual(3600);
      expect(await of("mail")).toEqual({ day: 2 });

      // Another account is stopped by the instance's day, and its own count is not spent.
      const other = mails(2, 5, 2).map((count) => ({
        ...count,
        provider: count.provider === "mail" ? "mail" : "mail:account-2",
      }));
      const stopped = await countCalls(database.db, other);
      expect(stopped?.map((full) => [full.provider, full.bucket])).toEqual([["mail", "day"]]);
      expect(stopped?.[0]?.retryAfterSeconds).toBeLessThanOrEqual(24 * 3600);
      expect(await of("mail:account-2")).toEqual({});
    });

    it("is refused a limit under one, which the first count of a span would pass", async () => {
      for (const limit of [0, -1, 1.5]) {
        await expect(countCalls(database.db, mails(limit, 5, 3))).rejects.toThrow("limit");
      }
      expect(await of("mail")).toEqual({});
    });
  });

  it("lets go of the forecasts and the counts that nothing reads any more", async () => {
    const { write, spend } = store("people");
    const ago = (hours: number) => new Date(Date.now() - hours * 3600 * 1000);
    await write(cell, { fetchedAt: ago(1), data: "kept" });
    await write({ latStep: 1, lonStep: 1 }, { fetchedAt: ago(47), data: "kept" });
    await write({ latStep: 2, lonStep: 2 }, { fetchedAt: ago(49), data: "old" });
    await spend();
    await database.db.insert(providerCalls).values({
      provider: "a-provider",
      bucket: "minute",
      start: sql`now() - interval '3 days'`,
      calls: 12,
    });

    expect(await pruneForecasts(database.db)).toEqual({ cells: 1, calls: 1 });
    expect(await countForecastCells(database.db)).toBe(2);
    expect(
      await database.db.select().from(providerCalls).where(eq(providerCalls.calls, 12)),
    ).toEqual([]);
    expect(await counts()).toEqual({ "day:people": 1, hour: 1, minute: 1 });
  });
});
