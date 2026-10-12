import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import {
  alert,
  alertSettings,
  alertSpot,
  alertWindow,
  notification,
  notificationDelivery,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// An alert of its own, set on spots, and the settings of an account: decision 031.
describe.skipIf(!TEST_DATABASE_URL)("an alert", () => {
  const WEB = "https://app.example.org";
  // Friday 9 October 2026, 08:00 UTC. The forecast of the tests has a swell of 1.2 m at every
  // hour, and the tide is known along this coast.
  const AT = new Date("2026-10-09T08:00:00Z");
  const swell = { swellHeightMeters: { min: 1 } };

  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let kept: ReturnType<typeof testForecasts>;

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
    const { db } = database;
    await db.delete(user);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    await db.insert(spot).values([
      { id: "north", userId: "ana", name: "North", latitude: 43.63, longitude: -1.46 },
      { id: "south", userId: "ana", name: "South", latitude: 43.6, longitude: -1.47 },
      { id: "far", userId: "ana", name: "Far", latitude: 47.84, longitude: -4.35 },
      { id: "bens", userId: "ben", name: "Ben's", latitude: 43.63, longitude: -1.46 },
    ]);
  });

  const by = (id: string) => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
        session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: WEB,
      adminSites: [],
      usage,
      forecasts: kept.forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: AT, webOrigin: WEB },
    };
    return { context };
  };
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;
  const make = (
    input: {
      name?: string;
      spotIds?: string[];
      criteria?: Record<string, unknown>;
      enabled?: boolean;
      shortestMinutes?: number;
    } = {},
    who = "ana",
  ) =>
    call(
      v1Router.alerts.create,
      { name: "The bay", spotIds: ["north"], criteria: swell, ...input } as never,
      by(who),
    );
  const revisionOf = async (id: string) =>
    (await database.db.select().from(alert).where(eq(alert.id, id)))[0]?.revision;
  // What a look leaves of a spot: a sea window, and its hours as told.
  const BEGUN = { start: "2026-10-10T08:00:00.000Z", end: "2026-10-10T11:00:00.000Z" };
  const TOLD = { ...BEGUN, missed: 0 };
  const see = async (alertId: string, spotId: string) => {
    await database.db
      .insert(alertWindow)
      .values({ alertId, spotId, seaStart: new Date(TOLD.start), seaEnd: new Date(TOLD.end) })
      .onConflictDoNothing();
    await database.db
      .update(alertSpot)
      .set({ told: [TOLD], mailed: [TOLD], cutBy: "as it was", begun: [BEGUN], lookedAt: AT })
      .where(eq(alertSpot.spotId, spotId));
    await database.db.update(alert).set({ lookedAt: AT }).where(eq(alert.id, alertId));
  };
  const windowsOf = async (alertId: string) =>
    (await database.db.select().from(alertWindow).where(eq(alertWindow.alertId, alertId))).map(
      (window) => window.spotId,
    );
  // The spots of an alert at which something told still stands.
  const toldAt = async (alertId: string) =>
    (await database.db.select().from(alertSpot).where(eq(alertSpot.alertId, alertId)))
      .filter(
        (row) =>
          row.told.length > 0 ||
          row.mailed.length > 0 ||
          row.cutBy ||
          row.begun.length > 0 ||
          row.lookedAt,
      )
      .map((row) => row.spotId)
      .sort();
  const lookedAtOf = async (id: string) =>
    (await database.db.select().from(alert).where(eq(alert.id, id)))[0]?.lookedAt;

  describe("made", () => {
    it("is set on the spots it names, in their order, on and with a shortest window of two hours", async () => {
      const made = await make({ spotIds: ["south", "north"] });

      expect(made).toMatchObject({
        name: "The bay",
        criteria: swell,
        enabled: true,
        shortestMinutes: 120,
        spotIds: ["south", "north"],
      });
      expect(await call(v1Router.alerts.get, { id: made.id }, by("ana"))).toEqual(made);
      expect((await call(v1Router.alerts.list, undefined, by("ana"))).alerts).toEqual([made]);
    });

    it("says in a spot's answer which alert it is in, to its owner alone", async () => {
      const made = await make();

      const spots = (await call(v1Router.spots.list, undefined, by("ana"))).spots;
      expect(spots.map((one) => [one.id, one.alertId])).toEqual([
        ["north", made.id],
        ["south", null],
        ["far", null],
      ]);
      expect(await call(v1Router.spots.get, { id: "north" }, by("ana"))).toMatchObject({
        alertId: made.id,
      });
      await expect(call(v1Router.spots.get, { id: "north" }, by("ben"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
    });

    it("keeps a spot in one alert at most", async () => {
      await make();

      await expect(make({ name: "Another", spotIds: ["south", "north"] })).rejects.toEqual(
        refusal("CONFLICT"),
      );
      // Nothing of the refused alert was kept: the other spot is free.
      expect((await make({ name: "Another", spotIds: ["south"] })).spotIds).toEqual(["south"]);
    });

    it("is set on the caller's own spots only", async () => {
      await expect(make({ spotIds: ["bens"] })).rejects.toEqual(refusal("NOT_FOUND"));
      await expect(make({ spotIds: ["north", "nowhere"] })).rejects.toEqual(refusal("NOT_FOUND"));
    });

    it.each([
      ["no condition at all", { criteria: {} }],
      ["a condition with neither end", { criteria: { swellHeightMeters: {} } }],
      ["no spot", { spotIds: [] }],
      ["a spot named twice", { spotIds: ["north", "north"] }],
      [
        "more spots than an alert holds",
        { spotIds: Array.from({ length: 13 }, (_, i) => `s${i}`) },
      ],
      ["no name", { name: "  " }],
      ["a shortest window of half an hour", { shortestMinutes: 30 }],
      ["a shortest window of an hour and a half", { shortestMinutes: 90 }],
      ["a condition that is none", { criteria: { swellHeightMeters: { min: 3, max: 1 } } }],
    ])("is refused with %s", async (_what, input) => {
      await expect(make(input as never)).rejects.toEqual(refusal("BAD_REQUEST"));
    });

    it("is one of a hundred at most", async () => {
      await database.db.insert(alert).values(
        Array.from({ length: 100 }, (_, index) => ({
          id: `a${index}`,
          userId: "ana",
          name: `Alert ${index}`,
          criteria: swell,
        })),
      );

      await expect(make()).rejects.toEqual(refusal("FORBIDDEN"));
      // Another account's count is its own.
      await database.db.insert(spot).values({
        id: "bens-other",
        userId: "ben",
        name: "Other",
        latitude: 43,
        longitude: -1.5,
      });
      expect((await make({ spotIds: ["bens-other"] }, "ben")).name).toBe("The bay");
    });
  });

  describe("made with an answer about mail", () => {
    const mailOf = async (userId: string) => {
      const [row] = await database.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, userId));
      return row ? { byMail: row.byMail, hasKey: row.mailKey !== null } : null;
    };

    it("keeps the answer with the alert, and the key of its mails' link for a yes", async () => {
      await make({ byMailIfNone: true } as never);
      expect(await mailOf("ana")).toEqual({ byMail: true, hasKey: true });

      await make({ spotIds: ["bens"], byMailIfNone: false } as never, "ben");
      expect(await mailOf("ben")).toEqual({ byMail: false, hasKey: false });
    });

    it("keeps the answer an account gave before, whatever comes with a later alert", async () => {
      await call(v1Router.alerts.updateSettings, { byMail: false }, by("ana"));
      await make({ byMailIfNone: true } as never);
      expect(await mailOf("ana")).toEqual({ byMail: false, hasKey: false });

      await call(v1Router.alerts.updateSettings, { byMail: true }, by("ben"));
      const [before] = await database.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, "ben"));
      await make({ spotIds: ["bens"], byMailIfNone: false } as never, "ben");
      const [after] = await database.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, "ben"));
      expect(after).toMatchObject({ byMail: true, mailKey: before?.mailKey });
    });

    it("saves no answer when the alert is not made", async () => {
      await make();
      // The spot is in an alert already: the second is refused, and its answer with it.
      await expect(make({ byMailIfNone: true } as never)).rejects.toEqual(refusal("CONFLICT"));
      expect(await mailOf("ana")).toBeNull();
    });

    it("leaves an account that is not asked as it is", async () => {
      await make();
      expect(await mailOf("ana")).toBeNull();
    });
  });

  describe("read by another account", () => {
    it("is missing, whatever is asked of it", async () => {
      const made = await make();

      expect((await call(v1Router.alerts.list, undefined, by("ben"))).alerts).toEqual([]);
      for (const ask of [
        () => call(v1Router.alerts.get, { id: made.id }, by("ben")),
        () => call(v1Router.alerts.update, { id: made.id, name: "Mine now" }, by("ben")),
        () => call(v1Router.alerts.delete, { id: made.id }, by("ben")),
      ]) {
        await expect(ask()).rejects.toEqual(refusal("NOT_FOUND"));
      }
      expect(await call(v1Router.alerts.get, { id: made.id }, by("ana"))).toMatchObject({
        name: "The bay",
      });
    });
  });

  describe("changed", () => {
    it("keeps what is left out, and takes a new name without being read anew", async () => {
      const made = await make();
      await see(made.id, "north");

      const renamed = await call(v1Router.alerts.update, { id: made.id, name: "Dawn" }, by("ana"));

      expect(renamed).toMatchObject({
        name: "Dawn",
        enabled: true,
        criteria: swell,
        spotIds: ["north"],
      });
      expect(await revisionOf(made.id)).toBe(0);
      expect([await windowsOf(made.id), await toldAt(made.id)]).toEqual([["north"], ["north"]]);
    });

    it("starts over under new conditions: what was seen under the old ones is forgotten", async () => {
      const made = await make();
      await see(made.id, "north");

      const asked = await call(
        v1Router.alerts.update,
        { id: made.id, criteria: { swellHeightMeters: { min: 2 } } },
        by("ana"),
      );

      expect(asked.criteria).toEqual({ swellHeightMeters: { min: 2 } });
      expect(await revisionOf(made.id)).toBe(1);
      expect(await windowsOf(made.id)).toEqual([]);
      expect(await toldAt(made.id)).toEqual([]);
      // The next run looks at it, as at a new one.
      expect(await lookedAtOf(made.id)).toBeNull();
      // The same conditions again are no change.
      await see(made.id, "north");
      await call(
        v1Router.alerts.update,
        { id: made.id, criteria: { swellHeightMeters: { min: 2 } } },
        by("ana"),
      );
      expect(await revisionOf(made.id)).toBe(1);
      expect(await windowsOf(made.id)).toEqual(["north"]);
      expect(await toldAt(made.id)).toEqual(["north"]);
    });

    it("starts over when it is switched off, and keeps what it saw under another shortest window", async () => {
      const made = await make();
      await see(made.id, "north");

      // The hours are cut otherwise: the next look brings what was told in line by itself.
      await call(v1Router.alerts.update, { id: made.id, shortestMinutes: 60 }, by("ana"));
      expect(await revisionOf(made.id)).toBe(1);
      expect([await windowsOf(made.id), await toldAt(made.id)]).toEqual([["north"], ["north"]]);
      expect(await lookedAtOf(made.id)).toEqual(AT);

      await call(v1Router.alerts.update, { id: made.id, enabled: false }, by("ana"));
      expect([await windowsOf(made.id), await toldAt(made.id)]).toEqual([[], []]);
      // A look that began before it was switched off writes nothing, were it on again by then.
      expect(await revisionOf(made.id)).toBe(2);
      await call(v1Router.alerts.update, { id: made.id, enabled: true }, by("ana"));
      expect(await revisionOf(made.id)).toBe(2);
      expect(await lookedAtOf(made.id)).toBeNull();
    });

    it("takes its spots as they are given: those left out leave, with what was seen at them", async () => {
      const made = await make({ spotIds: ["north", "south"] });
      await see(made.id, "north");
      await see(made.id, "south");

      const moved = await call(
        v1Router.alerts.update,
        { id: made.id, spotIds: ["far", "south"] },
        by("ana"),
      );

      // The spot that stays keeps its place, and the new one comes after it.
      expect(moved.spotIds).toEqual(["south", "far"]);
      expect(await call(v1Router.alerts.get, { id: made.id }, by("ana"))).toMatchObject({
        spotIds: ["south", "far"],
      });
      expect(await windowsOf(made.id)).toEqual(["south"]);
      expect(await revisionOf(made.id)).toBe(1);
      // The spot that left is free for another alert.
      expect((await make({ name: "North alone", spotIds: ["north"] })).spotIds).toEqual(["north"]);
      // And one that is in another alert cannot be taken from it.
      await expect(
        call(v1Router.alerts.update, { id: made.id, spotIds: ["south", "north"] }, by("ana")),
      ).rejects.toEqual(refusal("CONFLICT"));
    });

    it("goes when it is deleted, and leaves its spots", async () => {
      const made = await make({ spotIds: ["north", "south"] });

      expect(await call(v1Router.alerts.delete, { id: made.id }, by("ana"))).toEqual({
        id: made.id,
      });
      await expect(call(v1Router.alerts.get, { id: made.id }, by("ana"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      const spots = (await call(v1Router.spots.list, undefined, by("ana"))).spots;
      expect(spots.map((one) => [one.id, one.alertId])).toEqual([
        ["north", null],
        ["south", null],
        ["far", null],
      ]);
    });
  });

  describe("and its spots", () => {
    it("goes with its last spot, and stays while it has another", async () => {
      const made = await make({ spotIds: ["north", "south"] });
      await see(made.id, "north");

      await call(v1Router.spots.delete, { id: "north" }, by("ana"));
      expect(await call(v1Router.alerts.get, { id: made.id }, by("ana"))).toMatchObject({
        spotIds: ["south"],
      });
      expect(await revisionOf(made.id)).toBe(1);
      expect(await windowsOf(made.id)).toEqual([]);

      await call(v1Router.spots.delete, { id: "south" }, by("ana"));
      await expect(call(v1Router.alerts.get, { id: made.id }, by("ana"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
    });

    it("keeps what a condition with neither end leaves, and no word of it", async () => {
      const made = await make({
        criteria: { swellHeightMeters: { min: 1 }, tideHeightMeters: {} },
      });

      expect(made.criteria).toEqual({ swellHeightMeters: { min: 1 } });
    });

    // Two requests at once, the first held back until the second has come to wait for it.
    const meanwhile = async (
      first: (tx: Parameters<Parameters<typeof database.db.transaction>[0]>[0]) => Promise<void>,
      second: () => Promise<unknown>,
    ) => {
      let go!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>((resolve) => (go = resolve));
      const isReady = new Promise<void>((resolve) => (ready = resolve));
      const held = database.db.transaction(async (tx) => {
        await first(tx);
        ready();
        await gate;
      });
      await isReady;
      const asked = second();
      await new Promise((resolve) => setTimeout(resolve, 150));
      go();
      return Promise.all([held, asked]);
    };

    it("moves a spot after a look under way at its alert, and neither is refused", async () => {
      const made = await make();
      await see(made.id, "north");
      const later = new Date("2026-10-11T08:00:00Z");
      let write!: () => Promise<void>;

      // A look as the worker makes it: the alert is held, then what was seen is written.
      const looking = database.db.transaction(async (tx) => {
        await tx.select().from(alert).where(eq(alert.id, made.id)).for("update");
        await new Promise<void>((resolve) => {
          write = async () => resolve();
        });
        await tx.delete(alertWindow).where(eq(alertWindow.spotId, "north"));
        await tx
          .insert(alertWindow)
          .values({ alertId: made.id, spotId: "north", seaStart: later, seaEnd: later });
        await tx.update(alertSpot).set({ lookedAt: AT }).where(eq(alertSpot.spotId, "north"));
      });
      await vi.waitFor(() => expect(write).toBeDefined());
      const moving = call(v1Router.spots.update, { id: "north", latitude: 43.64 }, by("ana"));
      await new Promise((resolve) => setTimeout(resolve, 150));
      await write();

      await looking;
      expect(await moving).toMatchObject({ latitude: 43.64 });
      // The move came after the look, and forgot what it had written.
      expect([await windowsOf(made.id), await toldAt(made.id)]).toEqual([[], []]);
    });

    it("deletes the alert a spot joined while the spot was being deleted", async () => {
      // An alert made on the spot by a request that has not finished: the spot is held.
      await meanwhile(
        async (tx) => {
          await tx.select().from(spot).where(eq(spot.id, "north")).for("update");
          await tx
            .insert(alert)
            .values({ id: "late", userId: "ana", name: "Late", criteria: swell });
          await tx.insert(alertSpot).values({ spotId: "north", alertId: "late", position: 0 });
        },
        () => call(v1Router.spots.delete, { id: "north" }, by("ana")),
      );

      expect(await database.db.select().from(alert).where(eq(alert.id, "late"))).toEqual([]);
      expect(await database.db.select().from(spot).where(eq(spot.id, "north"))).toEqual([]);
    });

    it("forgets what it saw at a spot that moves, and not at one that is renamed", async () => {
      const made = await make();
      await see(made.id, "north");

      await call(v1Router.spots.update, { id: "north", name: "The north bank" }, by("ana"));
      expect([await revisionOf(made.id), await windowsOf(made.id)]).toEqual([0, ["north"]]);
      expect(await toldAt(made.id)).toEqual(["north"]);

      const moved = await call(v1Router.spots.update, { id: "north", latitude: 43.64 }, by("ana"));
      expect(moved).toMatchObject({ latitude: 43.64, alertId: made.id });
      expect([await revisionOf(made.id), await windowsOf(made.id)]).toEqual([1, []]);
      expect(await toldAt(made.id)).toEqual([]);
    });
  });

  describe("tried before it is saved", () => {
    it("gives, at each spot, the hours, the windows, and those the account can use", async () => {
      const tried = await call(
        v1Router.alerts.preview,
        { spotIds: ["north", "south"], criteria: swell, days: 2 },
        by("ana"),
      );

      expect(tried.spots.map((one) => [one.spotId, one.hasSea, one.hours.length])).toEqual([
        ["north", true, 48],
        ["south", true, 48],
      ]);
      // Each spot says when its own forecast was fetched.
      expect(tried.spots.map((one) => [one.forecastFetchedAt, one.forecastStale])).toEqual([
        [AT, false],
        [AT, false],
      ]);
      const [north] = tried.spots;
      // The swell is 1.2 m at every hour: one window, of the two days.
      expect(north?.windows).toEqual([
        { start: new Date("2026-10-09T00:00:00Z"), end: new Date("2026-10-11T00:00:00Z") },
      ]);
      // An account that set nothing is told of daylight only: two days, two pieces.
      expect(north?.open).toHaveLength(2);
      expect(north?.open[0]?.start.getUTCHours()).toBeGreaterThanOrEqual(5);
      expect(north?.open[0]?.end.getUTCHours()).toBeLessThanOrEqual(18);
    });

    it("reads the account's settings, and a shortest window of its own", async () => {
      // Mornings from 08:00 to 10:00 in Paris, every day, by day or by night.
      await call(
        v1Router.alerts.updateSettings,
        {
          zone: "Europe/Paris",
          daylightOnly: false,
          week: Array.from({ length: 7 }, () => [{ from: 8 * 60, to: 10 * 60 }]),
        },
        by("ana"),
      );
      const open = async (shortestMinutes: number) =>
        (
          await call(
            v1Router.alerts.preview,
            { spotIds: ["north"], criteria: swell, days: 2, shortestMinutes },
            by("ana"),
          )
        ).spots[0]?.open;

      expect(await open(120)).toEqual([
        { start: new Date("2026-10-09T06:00:00Z"), end: new Date("2026-10-09T08:00:00Z") },
        { start: new Date("2026-10-10T06:00:00Z"), end: new Date("2026-10-10T08:00:00Z") },
      ]);
      expect(await open(180)).toEqual([]);
    });

    it("is of the caller's own spots, and saves nothing", async () => {
      await expect(
        call(v1Router.alerts.preview, { spotIds: ["bens"], criteria: swell }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));
      await call(v1Router.alerts.preview, { spotIds: ["north"], criteria: swell }, by("ana"));
      expect((await call(v1Router.alerts.list, undefined, by("ana"))).alerts).toEqual([]);
    });
  });

  describe("the settings of an account", () => {
    const defaults = {
      horizonDays: 3,
      zone: null,
      locale: null,
      onFound: true,
      onEvening: true,
      eveningMinutes: 19 * 60,
      onChange: true,
      onBegin: true,
      noticeMinutes: 0,
      daylightOnly: true,
      week: null,
      awayUntil: null,
      quietFrom: 22 * 60,
      quietTo: 7 * 60,
      byMail: null,
      namesInSubject: true,
      byPush: false,
      // The instance of these tests sends no mail.
      mail: "off",
    };

    it("are the defaults for an account that set nothing", async () => {
      expect(await call(v1Router.alerts.getSettings, undefined, by("ana"))).toEqual(defaults);
    });

    it("keep what is left out, and are the account's own", async () => {
      await call(
        v1Router.alerts.updateSettings,
        { horizonDays: 5, zone: "Europe/Paris", locale: "fr", byMail: true },
        by("ana"),
      );
      const set = await call(
        v1Router.alerts.updateSettings,
        { onEvening: false, noticeMinutes: 45 },
        by("ana"),
      );

      expect(set).toEqual({
        ...defaults,
        horizonDays: 5,
        zone: "Europe/Paris",
        locale: "fr",
        byMail: true,
        onEvening: false,
        noticeMinutes: 45,
      });
      expect(await call(v1Router.alerts.getSettings, undefined, by("ana"))).toEqual(set);
      expect(await call(v1Router.alerts.getSettings, undefined, by("ben"))).toEqual(defaults);
    });

    it("put each day's hours in order, and make one of those that touch", async () => {
      const day = [
        { from: 17 * 60, to: 21 * 60 },
        { from: 6 * 60, to: 9 * 60 },
        { from: 9 * 60, to: 10 * 60 },
      ];
      const set = await call(
        v1Router.alerts.updateSettings,
        { week: [day, [], [], [], [], [{ from: 0, to: 1440 }], []] },
        by("ana"),
      );

      expect(set.week).toEqual([
        [
          { from: 6 * 60, to: 10 * 60 },
          { from: 17 * 60, to: 21 * 60 },
        ],
        [],
        [],
        [],
        [],
        [{ from: 0, to: 1440 }],
        [],
      ]);
      // Back to any hour of any day.
      expect(
        (await call(v1Router.alerts.updateSettings, { week: null }, by("ana"))).week,
      ).toBeNull();
    });

    it("take quiet hours whole, or none", async () => {
      const none = await call(
        v1Router.alerts.updateSettings,
        { quietFrom: null, quietTo: null },
        by("ana"),
      );
      expect([none.quietFrom, none.quietTo]).toEqual([null, null]);

      const night = await call(
        v1Router.alerts.updateSettings,
        { quietFrom: 23 * 60, quietTo: 6 * 60 },
        by("ana"),
      );
      expect([night.quietFrom, night.quietTo]).toEqual([23 * 60, 6 * 60]);
    });

    it("take a device's zone and language once, and keep them from then on", async () => {
      // The first alert gives them, from the device it is made on.
      await make({ zoneIfNone: "europe/paris", localeIfNone: "fr" } as never);
      expect(await call(v1Router.alerts.getSettings, undefined, by("ana"))).toMatchObject({
        zone: "Europe/Paris",
        locale: "fr",
      });

      // Another device offers its own with a setting: the account keeps what it has.
      const later = await call(
        v1Router.alerts.updateSettings,
        { onFound: false, zoneIfNone: "Pacific/Auckland", localeIfNone: "en" },
        by("ana"),
      );
      expect(later).toMatchObject({ zone: "Europe/Paris", locale: "fr", onFound: false });

      // A zone that is given, and not only offered, is taken.
      const moved = await call(
        v1Router.alerts.updateSettings,
        { zone: "Pacific/Auckland", localeIfNone: "en" },
        by("ana"),
      );
      expect(moved).toMatchObject({ zone: "Pacific/Auckland", locale: "fr" });
    });

    it("give a device's zone to an account that sets something first", async () => {
      const first = await call(
        v1Router.alerts.updateSettings,
        { daylightOnly: false, zoneIfNone: "Europe/Paris", localeIfNone: "fr" },
        by("ben"),
      );

      expect(first).toMatchObject({ zone: "Europe/Paris", locale: "fr", daylightOnly: false });
      // Offered alone, they are a first setting too.
      await database.db.delete(alertSettings);
      const alone = await call(
        v1Router.alerts.updateSettings,
        { zoneIfNone: "Europe/Paris" },
        by("ben"),
      );
      expect(alone).toMatchObject({ zone: "Europe/Paris", locale: null });
    });

    describe("the link of an alert mail", () => {
      const keyOf = async (userId: string) =>
        (await database.db.select().from(alertSettings).where(eq(alertSettings.userId, userId)))[0]
          ?.mailKey ?? null;
      // With no session at all, as a mail program asks, or with another account's.
      const nobody = (): { context: Context } => ({
        context: { ...by("ben").context, session: null },
      });
      const follow = (u: string, k: string, who = nobody()) =>
        call(v1Router.alerts.mailOff, { query: { u, k } }, who);

      it("has a key from the moment mail is switched on, and none before", async () => {
        await call(v1Router.alerts.updateSettings, { onFound: true }, by("ana"));
        expect(await keyOf("ana")).toBeNull();

        await call(v1Router.alerts.updateSettings, { byMail: true }, by("ana"));
        const key = await keyOf("ana");
        expect(key).toEqual(expect.any(String));
        // Saying yes again is no new key: the mails already sent keep their link.
        await call(v1Router.alerts.updateSettings, { byMail: true, onFound: false }, by("ana"));
        expect(await keyOf("ana")).toBe(key);
      });

      it("switches alert mails off, for whoever holds it, and nothing else", async () => {
        await call(v1Router.alerts.updateSettings, { byMail: true, horizonDays: 4 }, by("ana"));
        const key = (await keyOf("ana")) ?? "";

        // It is followed with no session of the account's, or with another account's.
        expect(await follow("ana", "not-the-key", by("ben"))).toEqual({ off: false });
        expect(await follow("ana", key)).toEqual({ off: true });
        expect(await call(v1Router.alerts.getSettings, undefined, by("ana"))).toMatchObject({
          byMail: false,
          horizonDays: 4,
        });
        expect(await keyOf("ana")).toBeNull();
        // It works once.
        expect(await follow("ana", key)).toEqual({ off: false });
      });

      it("does nothing with a key that is not the account's, or no longer", async () => {
        await call(v1Router.alerts.updateSettings, { byMail: true }, by("ana"));
        await call(v1Router.alerts.updateSettings, { byMail: true }, by("ben"));
        const bens = (await keyOf("ben")) ?? "";

        expect(await follow("ana", "made-up")).toEqual({ off: false });
        expect(await follow("ana", bens)).toEqual({ off: false });
        expect(await follow("nobody", bens)).toEqual({ off: false });

        // Mail switched off, then on again: the link of a mail from before is good no more.
        const old = (await keyOf("ana")) ?? "";
        await call(v1Router.alerts.updateSettings, { byMail: false }, by("ana"));
        await call(v1Router.alerts.updateSettings, { byMail: true }, by("ana"));
        expect(await follow("ana", old)).toEqual({ off: false });
        expect(await call(v1Router.alerts.getSettings, undefined, by("ana"))).toMatchObject({
          byMail: true,
        });
      });
    });

    describe("the address a mail program opens", () => {
      const open = (query: { u?: string; k?: string; l?: string }) =>
        call(
          v1Router.alerts.mailOffPage,
          { query },
          { context: { ...by("ben").context, session: null } },
        );

      it("leads to the page that asks, in the language of the mail, and stops nothing", async () => {
        await call(v1Router.alerts.updateSettings, { byMail: true, locale: "fr" }, by("ana"));
        const [row] = await database.db.select().from(alertSettings);
        const key = row?.mailKey ?? "";

        expect(await open({ u: "ana", k: key, l: "fr" })).toEqual({
          headers: { location: `${WEB}/fr/mail-off?u=ana&k=${key}` },
        });
        expect((await database.db.select().from(alertSettings))[0]).toMatchObject({
          byMail: true,
          mailKey: key,
        });
      });

      it("says nothing of an account, whatever key is given", async () => {
        await call(v1Router.alerts.updateSettings, { byMail: true, locale: "fr" }, by("ana"));
        const [row] = await database.db.select().from(alertSettings);

        // The account's own language is not read: a good key and a made-up one lead alike.
        expect(await open({ u: "ana", k: row?.mailKey ?? "" })).toEqual({
          headers: { location: `${WEB}/mail-off?u=ana&k=${row?.mailKey}` },
        });
        expect(await open({ u: "ana", k: "made-up" })).toEqual({
          headers: { location: `${WEB}/mail-off?u=ana&k=made-up` },
        });
        expect(await open({ l: "de" })).toEqual({ headers: { location: `${WEB}/mail-off?u=&k=` } });
      });
    });

    it("keeps the key of a link out of what is said of a fault", async () => {
      const failing = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () =>
                Promise.reject(new Error("Failed query, params: ana,the-secret-key")),
            }),
          }),
        }),
      };
      const fault = await call(
        v1Router.alerts.mailOff,
        { query: { u: "ana", k: "the-secret-key" } },
        { context: { ...by("ben").context, session: null, db: failing as never } },
      ).catch((error: unknown) => error);

      expect(fault).toBeInstanceOf(ORPCError);
      expect(fault).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      expect(
        JSON.stringify([fault, (fault as Error).message, (fault as Error).cause]),
      ).not.toContain("the-secret-key");
    });

    it("make a mail that waits follow quiet hours as they are changed", async () => {
      const made = await make();
      await database.db.insert(notification).values({
        id: "told",
        userId: "ana",
        alertId: made.id,
        moment: "found",
        key: "told",
        payload: { alertName: "The bay", zone: "UTC", lines: [] },
      });
      // The database's clock is not the test's: a day that is far ahead on both.
      const later = new Date("2100-01-01T00:00:00Z");
      const waiting = {
        notificationId: "told",
        channel: "mail" as const,
        dueAt: later,
        expiresAt: later,
      };
      await database.db.insert(notificationDelivery).values(waiting);
      const dueAt = async () => (await database.db.select().from(notificationDelivery))[0]?.dueAt;

      // Another setting leaves it where it is.
      await call(v1Router.alerts.updateSettings, { onFound: true }, by("ana"));
      expect(await dueAt()).toEqual(later);
      // And so does another account's quiet hours.
      await call(v1Router.alerts.updateSettings, { quietFrom: null, quietTo: null }, by("ben"));
      expect(await dueAt()).toEqual(later);

      // New quiet hours make it due: the worker reads them at its next pass.
      await call(v1Router.alerts.updateSettings, { quietFrom: null, quietTo: null }, by("ana"));
      expect(((await dueAt()) ?? later).getTime()).toBeLessThan(later.getTime());
    });

    it("keep a time zone's name as the runtime spells it", async () => {
      const set = await call(v1Router.alerts.updateSettings, { zone: "europe/paris" }, by("ana"));

      expect(set.zone).toBe("Europe/Paris");
    });

    it.each([
      ["a zone that is none", { zone: "Europe/Atlantis" }],
      ["more days ahead than the forecast holds whole", { horizonDays: 6 }],
      ["no day ahead", { horizonDays: 0 }],
      ["a week of six days", { week: [[], [], [], [], [], []] }],
      [
        "hours that end before they begin",
        { week: [[{ from: 600, to: 540 }], [], [], [], [], [], []] },
      ],
      ["hours that are not whole", { week: [[{ from: 510, to: 600 }], [], [], [], [], [], []] }],
      ["quiet hours with a beginning and no end", { quietFrom: 1320 }],
      ["quiet hours with an end and no beginning", { quietFrom: null, quietTo: 420 }],
      ["an evening past the day's last minute", { eveningMinutes: 1440 }],
      ["a notice of five hours", { noticeMinutes: 300 }],
      ["a language the app does not speak", { locale: "de" }],
    ])("refuse %s", async (_what, input) => {
      await expect(call(v1Router.alerts.updateSettings, input as never, by("ana"))).rejects.toEqual(
        refusal("BAD_REQUEST"),
      );
      expect(await call(v1Router.alerts.getSettings, undefined, by("ana"))).toEqual(defaults);
    });
  });
});
