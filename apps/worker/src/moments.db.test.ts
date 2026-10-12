import { accountSuspension } from "@repo/db/schema/access";
import { alert, alertSettings, alertSpot, alertWindow, notification } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { momentsDone, tellMoments } from "./moments";
import { longitudesNear } from "./stations";

// What the worker tells between two looks, from what the last look kept: decision 031. No
// forecast is read here, and no provider is asked.
describe.skipIf(!TEST_DATABASE_URL)("the moments between two looks", () => {
  // Saturday the 10th of October 2026, in UTC.
  const at = (time: string) => new Date(`2026-10-${time}:00Z`);
  const stretch = (start: string, end: string) => ({
    start: at(start).toISOString(),
    end: at(end).toISOString(),
  });
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.db.insert(user).values({ id: "owner", name: "Owner", email: "o@example.org" });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    await database.db.delete(notification);
    await database.db.delete(alert);
    await database.db.delete(alertSettings);
    await database.db.delete(spot);
    await database.db.delete(station);
    await database.db.delete(accountSuspension);
    await database.db
      .insert(spot)
      .values({ id: "home", userId: "owner", name: "Home", latitude: 43.63, longitude: -1.46 });
    await database.db.insert(alert).values({
      id: "bay",
      userId: "owner",
      name: "The bay",
      criteria: { swellHeightMeters: { min: 1 } },
    });
    // An account that goes at any hour, by night as by day: its hours are the sea's.
    await database.db.insert(alertSettings).values({ userId: "owner", daylightOnly: false });
  });

  /** A spot of the alert as a look left it: a sea window, and when it was looked at. */
  const seen = async (
    lookedAt: string,
    window = { start: "10T08:00", end: "10T12:00", seen: 2 },
    spotId = "home",
    alertId = "bay",
  ) => {
    await database.db
      .insert(alertSpot)
      .values({ spotId, alertId, position: 0, lookedAt: at(lookedAt) })
      .onConflictDoUpdate({
        target: [alertSpot.spotId, alertSpot.alertId],
        set: { lookedAt: at(lookedAt) },
      });
    await database.db.insert(alertWindow).values({
      alertId,
      spotId,
      seaStart: at(window.start),
      seaEnd: at(window.end),
      seen: window.seen,
    });
  };
  const run = (now: string) => {
    vi.setSystemTime(at(now));
    return Effect.runPromise(tellMoments(database.db));
  };
  const told = () => database.db.select().from(notification).orderBy(notification.createdAt);
  const settings = (changes: Partial<typeof alertSettings.$inferInsert>) =>
    database.db.update(alertSettings).set(changes).where(eq(alertSettings.userId, "owner"));

  describe("when open hours begin", () => {
    it("say that it is on, once, and not before", async () => {
      await seen("10T06:20");

      expect(await run("10T07:45")).toEqual({ begins: 0, evenings: 0, mails: 0, failed: 0 });
      expect(await run("10T08:00")).toEqual({ begins: 1, evenings: 0, mails: 0, failed: 0 });
      const [said] = await told();
      expect(said).toMatchObject({
        userId: "owner",
        alertId: "bay",
        moment: "begins",
        payload: {
          alertName: "The bay",
          zone: "UTC",
          // Far from any buoy, it says that the window has begun, and no more.
          lines: [
            {
              spotId: "home",
              spotName: "Home",
              open: [stretch("10T08:00", "10T12:00")],
              buoy: null,
            },
          ],
        },
      });

      expect(await run("10T08:15")).toMatchObject({ begins: 0 });
      expect(await run("10T10:00")).toMatchObject({ begins: 0 });
      expect(await told()).toHaveLength(1);
    });

    it("say it ahead by the notice the account asked for", async () => {
      await seen("10T05:20");
      await settings({ noticeMinutes: 60 });

      expect(await run("10T06:45")).toMatchObject({ begins: 0 });
      expect(await run("10T07:00")).toMatchObject({ begins: 1 });
    });

    it("say it of a window seen once, and not of one looked at too long ago", async () => {
      await seen("10T07:20", { start: "10T08:00", end: "10T12:00", seen: 1 });
      expect(await run("10T08:00")).toMatchObject({ begins: 1 });

      await database.db.delete(notification);
      await database.db.update(alertSpot).set({ begun: [], lookedAt: at("10T01:20") });
      expect(await run("10T08:15")).toMatchObject({ begins: 0 });
    });

    it("tell the spots of an alert that begin together in one notification", async () => {
      await database.db
        .insert(spot)
        .values({ id: "north", userId: "owner", name: "North", latitude: 43.7, longitude: -1.44 });
      await seen("10T06:20");
      await database.db
        .insert(alertSpot)
        .values({ spotId: "north", alertId: "bay", position: 1, lookedAt: at("10T06:20") });
      await database.db.insert(alertWindow).values({
        alertId: "bay",
        spotId: "north",
        seaStart: at("10T08:00"),
        seaEnd: at("10T11:00"),
        seen: 2,
      });

      expect(await run("10T08:00")).toMatchObject({ begins: 1 });
      const [said] = await told();
      expect(said?.payload.lines.map((line) => line.spotName)).toEqual(["Home", "North"]);
    });

    describe("with the waves a station near the spot measured", () => {
      const waves = (id: string, more: Partial<typeof station.$inferInsert> = {}) =>
        database.db.insert(station).values({
          id,
          provider: "test",
          providerStationId: id,
          name: id,
          latitude: 43.53,
          longitude: -1.61,
          licenseType: "open",
          licenseUrl: "https://example.org/licence",
          attribution: "Example",
          reportsWaves: true,
          exposure: "open",
          latestObservedAt: at("10T07:30"),
          ...more,
        });
      const read = (stationId: string, observedAt: string, heightM: number | null = 1.8) =>
        database.db.insert(reading).values({
          stationId,
          observedAt: at(observedAt),
          significantHeightM: heightM,
          peakPeriodS: 11,
          peakDirectionDeg: 290,
        });
      const stationSaid = async () => (await told())[0]?.payload.lines[0]?.buoy;

      it("give the reading of the nearest one the sea reaches freely", async () => {
        await seen("10T06:20");
        // Each of these has a reading that would be given, were the station taken.
        await waves("sheltered", { latitude: 43.62, longitude: -1.47, exposure: "sheltered" });
        await waves("offshore");
        await waves("further", { latitude: 43.3, longitude: -1.75 });
        await waves("far", { latitude: 45.5, longitude: -1.5 });
        for (const id of ["sheltered", "offshore", "further", "far"]) await read(id, "10T07:30");

        await run("10T08:00");
        expect(await stationSaid()).toMatchObject({
          stationId: "offshore",
          name: "offshore",
          observedAt: at("10T07:30").toISOString(),
          significantHeightMeters: 1.8,
          peakPeriodSeconds: 11,
          peakDirectionDegrees: 290,
        });
        const distance = (await stationSaid())?.distanceKm ?? 0;
        expect(distance).toBeGreaterThan(10);
        expect(distance).toBeLessThan(25);
      });

      it("give its latest reading of the waves, when a later one holds the wind alone", async () => {
        await seen("10T06:20");
        await waves("offshore", { latestObservedAt: at("10T07:45") });
        await read("offshore", "10T07:30");
        await read("offshore", "10T07:45", null);

        await run("10T08:00");
        expect((await stationSaid())?.observedAt).toBe(at("10T07:30").toISOString());
      });

      it("pass over a station whose waves are two hours old, for the next one", async () => {
        await seen("10T06:20");
        await waves("offshore", { latestObservedAt: at("10T07:45") });
        await read("offshore", "10T05:30");
        await read("offshore", "10T07:45", null);
        await waves("further", { latitude: 43.3, longitude: -1.75 });
        await read("further", "10T07:30");

        await run("10T08:00");
        expect((await stationSaid())?.stationId).toBe("further");
      });

      it("give none when the only reading is dated after now, or the station said nothing", async () => {
        await seen("10T06:20");
        await waves("offshore", { latestObservedAt: at("10T09:00") });
        await read("offshore", "10T09:00");
        await waves("silent", {
          latitude: 43.6,
          longitude: -1.5,
          latestObservedAt: at("10T03:00"),
        });
        await read("silent", "10T03:00");

        await run("10T08:00");
        expect(await stationSaid()).toBeNull();
      });
    });

    it("say nothing when the moment is switched off, or the account kept out", async () => {
      await seen("10T06:20");
      await settings({ onBegin: false });
      expect(await run("10T08:00")).toMatchObject({ begins: 0 });

      await settings({ onBegin: true });
      await database.db.insert(accountSuspension).values({ userId: "owner" });
      expect(await run("10T08:15")).toEqual({ begins: 0, evenings: 0, mails: 0, failed: 0 });
      expect(await told()).toEqual([]);
    });
  });

  describe("when another worker, or the account, came first", () => {
    // Holds the alert as a transaction does, changes something, and lets go when the pass has
    // come to wait for it.
    const meanwhile = async (
      change: (
        tx: Parameters<Parameters<typeof database.db.transaction>[0]>[0],
      ) => Promise<unknown>,
      now: string,
    ) => {
      let go!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>((resolve) => (go = resolve));
      const isReady = new Promise<void>((resolve) => (ready = resolve));
      const held = database.db.transaction(async (tx) => {
        await tx.select().from(alert).where(eq(alert.id, "bay")).for("update");
        await change(tx);
        ready();
        await gate;
      });
      await isReady;
      const passed = run(now);
      await new Promise((resolve) => setTimeout(resolve, 150));
      go();
      await held;
      return passed;
    };

    it("do not say again what another worker has just said", async () => {
      await seen("10T06:20");
      const result = await meanwhile(
        (tx) =>
          tx
            .update(alertSpot)
            .set({ begun: [stretch("10T08:00", "10T12:00")] })
            .where(eq(alertSpot.spotId, "home")),
        "10T08:14",
      );

      expect(result).toMatchObject({ begins: 0, failed: 0 });
      expect(await told()).toEqual([]);
    });

    it("say nothing of an alert that was switched off, and bring nothing back", async () => {
      await seen("10T06:20");
      const result = await meanwhile(
        (tx) => tx.update(alert).set({ enabled: false }).where(eq(alert.id, "bay")),
        "10T08:00",
      );

      expect(result).toMatchObject({ begins: 0, failed: 0 });
      expect(await told()).toEqual([]);
      const [link] = await database.db.select().from(alertSpot);
      expect(link?.begun).toEqual([]);
    });

    it("say nothing of a spot that left the alert", async () => {
      await seen("10T06:20");
      const result = await meanwhile(
        (tx) => tx.delete(alertSpot).where(eq(alertSpot.spotId, "home")),
        "10T08:00",
      );

      expect(result).toMatchObject({ begins: 0, failed: 0 });
      expect(await told()).toEqual([]);
    });
  });

  describe("at a spot that is in two alerts", () => {
    beforeEach(async () => {
      await database.db.insert(alert).values({
        id: "big",
        userId: "owner",
        name: "Big days",
        criteria: { swellHeightMeters: { min: 2 } },
      });
    });

    it("say that it is on for each, of the hours that are its own", async () => {
      await seen("10T06:20", { start: "10T08:00", end: "10T10:00", seen: 2 });
      await seen("10T06:20", { start: "10T12:00", end: "10T14:00", seen: 2 }, "home", "big");

      expect(await run("10T08:00")).toMatchObject({ begins: 1 });
      expect(await run("10T12:00")).toMatchObject({ begins: 1 });
      expect(
        (await told()).map((row) => [row.alertId, row.payload.lines.map((line) => line.open)]),
      ).toEqual([
        ["bay", [[stretch("10T08:00", "10T10:00")]]],
        ["big", [[stretch("10T12:00", "10T14:00")]]],
      ]);
      // Each remembers what it said to begin, and nothing of the other's.
      const links = await database.db.select().from(alertSpot).orderBy(alertSpot.alertId);
      expect(links.map((row) => [row.alertId, row.begun])).toEqual([
        ["bay", []],
        ["big", [stretch("10T12:00", "10T14:00")]],
      ]);
    });

    it("list it under each in the evening, with that alert's hours", async () => {
      await settings({ zone: "Europe/Paris", eveningMinutes: 19 * 60 });
      await seen("09T15:20");
      await seen("09T15:20", { start: "10T10:00", end: "10T14:00", seen: 2 }, "home", "big");

      expect(await run("09T17:00")).toMatchObject({ evenings: 1 });
      const [said] = await told();
      expect(
        said?.payload.lines.map((line) => [line.spotId, line.alertId, line.alertName, line.open]),
      ).toEqual([
        ["home", "bay", "The bay", [stretch("10T08:00", "10T12:00")]],
        ["home", "big", "Big days", [stretch("10T10:00", "10T14:00")]],
      ]);
    });
  });

  describe("a piece that was said and is over", () => {
    it("no longer hides the hours that took its place", async () => {
      // 08:00 to 10:00 was said. A later look keeps 09:00 to 13:00 in its place.
      await seen("10T10:20", { start: "10T09:00", end: "10T13:00", seen: 2 });
      await database.db.update(alertSpot).set({ begun: [stretch("10T08:00", "10T10:00")] });

      expect(await run("10T11:00")).toMatchObject({ begins: 1 });
      const [link] = await database.db.select().from(alertSpot);
      expect(link?.begun).toEqual([stretch("10T09:00", "10T13:00")]);
    });

    it("is forgotten, whether another begins or not", async () => {
      await seen("10T10:20", { start: "10T18:00", end: "10T21:00", seen: 2 });
      await database.db.update(alertSpot).set({ begun: [stretch("10T08:00", "10T10:00")] });

      expect(await run("10T11:00")).toMatchObject({ begins: 0 });
      const [link] = await database.db.select().from(alertSpot);
      expect(link?.begun).toEqual([]);
    });
  });

  describe("the evening before", () => {
    // Paris is two hours ahead of UTC in October: its evening hour is 17:00 UTC.
    beforeEach(() => settings({ zone: "Europe/Paris", eveningMinutes: 19 * 60 }));

    it("list the next day's open hours once, from the account's hour", async () => {
      await seen("09T15:20");

      expect(await run("09T16:45")).toMatchObject({ evenings: 0 });
      expect(await run("09T17:00")).toEqual({ begins: 0, evenings: 1, mails: 0, failed: 0 });
      const [said] = await told();
      expect(said).toMatchObject({
        userId: "owner",
        alertId: null,
        moment: "evening",
        payload: {
          alertName: null,
          zone: "Europe/Paris",
          day: "2026-10-10",
          lines: [
            {
              spotId: "home",
              spotName: "Home",
              alertName: "The bay",
              open: [stretch("10T08:00", "10T12:00")],
            },
          ],
        },
      });

      expect(await run("09T17:15")).toMatchObject({ evenings: 0 });
      expect(await run("09T21:45")).toMatchObject({ evenings: 0 });
      expect(await told()).toHaveLength(1);
    });

    it("send nothing for an evening with nothing to list, and still list what comes later", async () => {
      // Seen once only at the evening hour: not sure enough to be listed.
      await seen("09T15:20", { start: "10T08:00", end: "10T12:00", seen: 1 });
      expect(await run("09T17:00")).toMatchObject({ evenings: 0 });

      await database.db.update(alertWindow).set({ seen: 2 });
      await database.db.update(alertSpot).set({ lookedAt: at("09T18:20") });
      expect(await run("09T18:30")).toMatchObject({ evenings: 1 });
    });

    it("say nothing when the evening is switched off", async () => {
      await seen("09T15:20");
      await settings({ onEvening: false });

      expect(await run("09T17:00")).toMatchObject({ evenings: 0 });
    });

    it("list a day that has the date of one already listed, on another clock", async () => {
      // 05:00 UTC is 19:00 on Kiritimati, whose next day, the 10th, begins at 10:00 UTC.
      await settings({ zone: "Pacific/Kiritimati" });
      await seen("09T03:20", { start: "09T12:00", end: "09T16:00", seen: 2 });
      expect(await run("09T05:00")).toMatchObject({ evenings: 1 });

      // In Honolulu, a day later, the next day is called the 10th too, and is another day.
      await settings({ zone: "Pacific/Honolulu" });
      await database.db.delete(alertWindow);
      await seen("10T03:20", { start: "10T14:00", end: "10T18:00", seen: 2 });
      expect(await run("10T05:00")).toMatchObject({ evenings: 1 });
      expect((await told()).map((row) => [row.payload.zone, row.payload.day])).toEqual([
        ["Pacific/Kiritimati", "2026-10-10"],
        ["Pacific/Honolulu", "2026-10-10"],
      ]);
    });

    it("never take an account's days back", async () => {
      await seen("09T15:20");
      await settings({ eveningUntil: at("12T22:00") });

      await run("09T17:00");
      const [after] = await database.db.select().from(alertSettings);
      expect(after?.eveningUntil).toEqual(at("12T22:00"));
      expect(await told()).toEqual([]);
    });

    it("keep what the account set as it set it", async () => {
      await seen("09T15:20");
      const [before] = await database.db.select().from(alertSettings);

      await run("09T17:00");
      const [after] = await database.db.select().from(alertSettings);
      expect(after?.updatedAt).toEqual(before?.updatedAt);
      expect(after?.eveningUntil).toEqual(at("10T22:00"));
    });
  });

  describe("the box a station is looked for in", () => {
    it("is one range of longitudes away from the antimeridian and the poles", () => {
      const [range, ...others] = longitudesNear({ latitude: 43.63, longitude: -1.46 }, 60) ?? [];
      expect(others).toEqual([]);
      expect(range?.[0]).toBeLessThan(-1.46 - 0.7);
      expect(range?.[1]).toBeGreaterThan(-1.46 + 0.7);
    });

    it("is two ranges across the antimeridian", () => {
      const ranges = longitudesNear({ latitude: 0, longitude: 179.9 }, 60);
      expect(ranges).toHaveLength(2);
      // A station at 179.9 degrees west is some twenty kilometres away.
      expect(ranges?.some(([west, east]) => west <= -179.9 && -179.9 <= east)).toBe(true);
    });

    it("holds every longitude near a pole, and widens towards it", () => {
      expect(longitudesNear({ latitude: 89.8, longitude: 10 }, 60)).toBeNull();
      // At 85 degrees north, a station four degrees east is under forty kilometres away.
      const [range] = longitudesNear({ latitude: 85, longitude: 10 }, 60) ?? [];
      expect(range?.[1]).toBeGreaterThan(14);
    });
  });

  it("says of a run that told everyone that it went well", () => {
    expect(momentsDone({ begins: 2, evenings: 1, mails: 3, failed: 0 })).toEqual({
      counts: { begins: 2, evenings: 1, mails: 3, failed: 0 },
      degraded: false,
    });
    expect(momentsDone({ begins: 0, evenings: 0, mails: 0, failed: 1 }).degraded).toBe(true);
  });
});
