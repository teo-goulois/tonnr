import { testForecasts } from "@repo/conditions/forecasts/testing";
import { accountSuspension } from "@repo/db/schema/access";
import {
  alert,
  alertSettings,
  alertSpot,
  liveActivity,
  notification,
  notificationDelivery,
  pushSubscription,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { providerCalls } from "@repo/db/schema/forecasts";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { type AppDevice, WINDOW_ACTIVITY } from "@repo/push";
import { testApns, testFcm, testPusher } from "@repo/push/testing";
import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateAlerts } from "./alerts";
import type { PushOut } from "./deliveries";
import { ACTIVITY_URL, followActivities, shownHash } from "./live-activities";
import { tellMoments } from "./moments";

// The Live Activity that "it is on" starts on an iPhone whose switch is on, in the place of its
// push, and the job that follows it: decision 074. No test asks Apple or Google: `testApns` and
// `testFcm` stand for them, and read what they take as the phone would.
describe.skipIf(!TEST_DATABASE_URL)("the Live Activity of a window that begins", () => {
  // A Friday morning, at the minute the looks run.
  const AT = new Date("2026-10-09T08:20:00Z");
  const MINUTE_MS = 60 * 1000;
  const HOUR_MS = 60 * MINUTE_MS;
  const SATURDAY = Date.UTC(2026, 9, 10);
  const hour = (at: number) => new Date(SATURDAY + at * HOUR_MS);
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let kept: ReturnType<typeof testForecasts>;
  let browsers: ReturnType<typeof testPusher>;
  let apple: ReturnType<typeof testApns>;
  let google: ReturnType<typeof testFcm>;
  let out: PushOut;
  let iphone: AppDevice;
  // The token iOS gave the iPhone to start the app's Live Activities: its switch is on.
  let startToken: string;

  const swellBetween = (from: number, to: number) => (seconds: number) =>
    seconds * 1000 >= SATURDAY + from * HOUR_MS && seconds * 1000 < SATURDAY + to * HOUR_MS
      ? 1.2
      : 0.2;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
    kept.provider.waves = swellBetween(8, 12);
    browsers = testPusher();
    apple = testApns();
    google = testFcm();
    out = {
      web: browsers.pusher,
      ios: apple.pusher,
      android: google.pusher,
      webOrigin: "https://app.example.org",
    };
    const { db } = database;
    await db.delete(user);
    await db.delete(station);
    await db.delete(providerCalls);
    await db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.org" });
    await db.insert(spot).values({
      id: "home",
      userId: "owner",
      name: "Home",
      latitude: 43.63,
      longitude: -1.46,
      // Its owner said where the wind blows off the shore from.
      characteristics: { offshoreDirectionDegrees: 90 },
    });
    await db.insert(alert).values({
      id: "bay",
      userId: "owner",
      name: "The bay",
      criteria: { waveHeightMeters: { min: 1 } },
    });
    await db.insert(alertSpot).values({ spotId: "home", alertId: "bay", position: 0 });
    // Only that it is on, half an hour before, at any hour, in French.
    await db.insert(alertSettings).values({
      userId: "owner",
      daylightOnly: false,
      locale: "fr",
      quietFrom: null,
      quietTo: null,
      onEvening: false,
      onFound: false,
      onBegin: true,
      noticeMinutes: 30,
    });
    const browser = browsers.device();
    await db.insert(pushSubscription).values({ id: "a-browser", userId: "owner", ...browser });
    iphone = apple.device();
    startToken = apple.startToken();
    await db.insert(pushSubscription).values({
      id: "b-iphone",
      userId: "owner",
      kind: "ios",
      token: iphone.token,
      environment: "production",
      appId: iphone.appId,
      activityStartToken: startToken,
      p256dh: iphone.p256dh,
      auth: iphone.auth,
    });
    const android = google.device();
    await db.insert(pushSubscription).values({
      id: "c-android",
      userId: "owner",
      kind: "android",
      token: android.token,
      appId: android.appId,
      p256dh: android.p256dh,
      auth: android.auth,
    });
  });

  const look = () => Effect.runPromise(evaluateAlerts(database.db, kept.forecasts));
  const next = () => {
    vi.advanceTimersByTime(3 * HOUR_MS);
    return look();
  };
  const pass = (push: PushOut | null = out) =>
    Effect.runPromise(tellMoments(database.db, null, push));
  const follow = (ios = out.ios ?? null) => Effect.runPromise(followActivities(database.db, ios));
  // Two looks on Friday find Saturday's window, the looks go on through the night, and at 07:45
  // on Saturday it is said to be on, half an hour ahead.
  const begins = async () => {
    await look();
    for (let one = 0; one < 7; one += 1) await next();
    vi.setSystemTime(hour(7.75));
    return pass();
  };
  const activities = () => database.db.select().from(liveActivity);
  // The app gives the activity's token, as `push.activityStarted` writes it.
  const tokenGiven = async (environment: "development" | "production" = "production") => {
    const token = apple.activityToken(environment);
    await database.db.update(liveActivity).set({ token });
    return token;
  };
  const buoy = async (observedAt: Date, heightM = 1.7) => {
    await database.db.insert(station).values({
      id: "buoy",
      provider: "test",
      providerStationId: "buoy",
      name: "Anglet buoy",
      latitude: 43.53,
      longitude: -1.61,
      licenseType: "open",
      licenseUrl: "https://example.org/licence",
      attribution: "Example",
      reportsWaves: true,
      exposure: "open",
      latestObservedAt: observedAt,
    });
    await database.db.insert(reading).values({
      stationId: "buoy",
      observedAt,
      significantHeightM: heightM,
      peakPeriodS: 13,
      peakDirectionDeg: 290,
    });
  };

  describe("as it begins", () => {
    it("starts on the iPhone whose switch is on, in the place of its push, and the push leaves to every other device", async () => {
      expect(await begins()).toMatchObject({ begins: 1, pushes: 1, failed: 0 });

      const [told] = await database.db.select().from(notification);
      const [started] = apple.activities();
      expect(started).toMatchObject({ token: startToken, kind: "start", priority: 10 });
      expect(started?.read).toEqual({
        event: "start",
        timestamp: hour(7.75).getTime() / 1000,
        name: WINDOW_ACTIVITY,
        shown: {
          alertId: "bay",
          notificationId: told?.id,
          start: hour(8).toISOString(),
          end: hour(12).toISOString(),
          more: 0,
          pauseUntil: hour(24).toISOString(),
          sea: {
            at: hour(8).toISOString(),
            heightMeters: 1.2,
            periodSeconds: 11,
            directionDegrees: 295,
          },
          wind: expect.objectContaining({ observedAt: null }),
          tide: expect.objectContaining({ type: expect.stringMatching(/^(high|low)$/) }),
          buoy: null,
        },
        attributes: { url: ACTIVITY_URL },
        // The app's own line, in the account's language, which names nothing.
        alert: {
          title: "C’est le moment",
          body: "Un créneau d’une de tes alertes commence",
          sound: "default",
        },
        // Stale once its window ends, and kept by Apple until then for a phone that is off.
        staleDate: hour(12).getTime() / 1000,
        dismissalDate: null,
        inputPushToken: 1,
      });
      expect(started?.expiration).toBe(hour(12).getTime() / 1000);
      // The iPhone is sent no push of its own; the others are.
      expect(apple.sent()).toEqual([]);
      expect(browsers.sent()).toHaveLength(1);
      expect(google.sent()).toHaveLength(1);
      // What it told is kept as the push's would be, and it was one push of the account's day.
      expect(await database.db.select().from(alertSpot)).toMatchObject([
        { pushBegun: [{ start: hour(8).toISOString(), end: hour(12).toISOString() }] },
      ]);
      const [counted] = await database.db
        .select()
        .from(providerCalls)
        .where(eq(providerCalls.provider, "alert-push:owner"));
      expect(counted?.calls).toBe(1);
      // Its row, in the same transaction, with no token until the app gives it.
      expect(await activities()).toEqual([
        expect.objectContaining({
          userId: "owner",
          deviceId: "b-iphone",
          notificationId: told?.id,
          alertId: "bay",
          alertRevision: 0,
          placeId: "home",
          startsAt: hour(8),
          token: null,
          lastsUntil: hour(12),
          endedAt: null,
          shown: shownHash(started!.read.shown!),
        }),
      ]);
    });

    it("tells Apple no name, and no id of a place", async () => {
      await begins();

      const said = JSON.stringify(apple.asked().map((one) => one.payload));
      for (const name of ["Home", "home", "The bay", "Owner"]) expect(said).not.toContain(name);
    });

    it("sends the push in its place to an iPhone whose start APNs refuses", async () => {
      apple.answers.set(startToken, { status: 429, reason: "TooManyRequests" });
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await begins()).toMatchObject({ pushes: 1 });

      expect(apple.activities()).toEqual([]);
      expect(apple.sent()).toMatchObject([{ token: iphone.token }]);
      expect(await activities()).toEqual([]);
    });

    it("lets go of a token that starts no more activities, and pushes to the iPhone, which stays", async () => {
      apple.answers.set(startToken, { status: 410, reason: "ExpiredToken" });

      await begins();

      expect(apple.sent()).toMatchObject([{ token: iphone.token }]);
      const [kept] = await database.db
        .select()
        .from(pushSubscription)
        .where(eq(pushSubscription.id, "b-iphone"));
      expect(kept?.activityStartToken).toBeNull();
      expect(await activities()).toEqual([]);
    });

    it("pushes to an iPhone whose switch is off, as decision 072 does", async () => {
      await database.db.update(pushSubscription).set({ activityStartToken: null });

      await begins();

      expect(apple.activities()).toEqual([]);
      expect(apple.sent()).toMatchObject([{ token: iphone.token }]);
    });

    it("waits for the quiet hours to end, as its push does", async () => {
      await database.db
        .update(alertSettings)
        .set({ quietFrom: 7 * 60, quietTo: 9 * 60 })
        .where(eq(alertSettings.userId, "owner"));

      await begins();
      expect(apple.asked()).toEqual([]);

      vi.setSystemTime(hour(9));
      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(apple.activities()).toMatchObject([{ kind: "start", read: { event: "start" } }]);
    });

    it("is held back by the account's pushes of the day, as its push is", async () => {
      await database.db
        .insert(providerCalls)
        // Counted by the database's own clock, in its day.
        .values({
          provider: "alert-push:owner",
          bucket: "day",
          start: sql`date_trunc('day', clock_timestamp(), 'UTC')`,
          calls: 24,
        });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const told = await begins();

      expect(told).toMatchObject({ pushes: 0 });
      expect(apple.asked()).toEqual([]);
      expect(await activities()).toEqual([]);
    });

    it("follows the place its start showed, which a beginning it said in the place of told", async () => {
      // The alert has a second place, where the wind of the forecast blows onshore.
      await database.db.insert(spot).values({
        id: "reef",
        userId: "owner",
        name: "Reef",
        latitude: 43.63,
        longitude: -1.46,
        characteristics: { offshoreDirectionDegrees: 270 },
      });
      await database.db.insert(alertSpot).values({ spotId: "reef", alertId: "bay", position: 1 });
      await database.db
        .update(alertSettings)
        .set({ quietFrom: 7 * 60, quietTo: 9 * 60 })
        .where(eq(alertSettings.userId, "owner"));
      await begins();
      // What waits is two beginnings: the reef's, written first, and then the home's.
      const [made] = await database.db.select().from(notification);
      const [due] = await database.db.select().from(notificationDelivery);
      const lineOf = (spotId: string) => made?.payload.lines.find((one) => one.spotId === spotId);
      const [home, reef] = [lineOf("home"), lineOf("reef")];
      if (!made || !due || !home || !reef) throw new Error("no notification");
      await database.db
        .update(notification)
        .set({ payload: { ...made.payload, lines: [reef] } })
        .where(eq(notification.id, made.id));
      const second = crypto.randomUUID();
      await database.db
        .insert(notification)
        .values({
          ...made,
          id: second,
          key: "second",
          payload: { ...made.payload, lines: [home] },
        });
      await database.db.insert(notificationDelivery).values({
        ...due,
        notificationId: second,
        createdAt: new Date(due.createdAt.getTime() + 1000),
      });

      // The reef's leaves first, and says the home's with it, first as the alert lists them.
      vi.setSystemTime(hour(9));
      expect(await pass()).toMatchObject({ pushes: 1 });
      const [started] = apple.activities();
      expect(started?.read.shown).toMatchObject({
        notificationId: made.id,
        more: 1,
        wind: { atShore: "offshore" },
      });
      expect(await activities()).toMatchObject([
        {
          notificationId: made.id,
          placeId: "home",
          startsAt: new Date(started!.read.shown!.start),
        },
      ]);

      // What follows it is the home's, not the reef's that its notification first told.
      await tokenGiven();
      vi.setSystemTime(new Date(hour(9).getTime() + 7 * MINUTE_MS));
      expect(await follow()).toMatchObject({ running: 1, ended: 0, failed: 0 });
      expect(apple.activities().at(-1)?.read.shown?.wind?.atShore).toBe("offshore");
    });

    it("updates the activity of the alert that runs, and lights the screen, instead of starting another", async () => {
      // An activity of the alert runs on the iPhone, started by an earlier notification.
      const earlier = crypto.randomUUID();
      await database.db.insert(notification).values({
        id: earlier,
        userId: "owner",
        alertId: "bay",
        moment: "begins",
        key: "begins:bay:earlier",
        payload: {
          alertName: "The bay",
          zone: "UTC",
          lines: [
            {
              spotId: "home",
              spotName: "Home",
              open: [{ start: hour(8).toISOString(), end: hour(12).toISOString() }],
            },
          ],
        },
      });
      const token = apple.activityToken();
      await database.db.insert(liveActivity).values({
        id: crypto.randomUUID(),
        userId: "owner",
        deviceId: "b-iphone",
        notificationId: earlier,
        alertId: "bay",
        alertRevision: 0,
        placeId: "home",
        startsAt: hour(8),
        token,
        lastsUntil: hour(12),
        shown: "before",
      });

      await begins();

      expect(apple.activities()).toMatchObject([
        {
          token,
          kind: "activity",
          priority: 10,
          read: { event: "update", alert: { title: "C’est le moment" } },
        },
      ]);
      expect(apple.activities()[0]?.read.shown).toMatchObject({ notificationId: earlier, more: 0 });
      expect(apple.sent()).toEqual([]);
      const rows = await activities();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.shown).toBe(shownHash(apple.activities()[0]!.read.shown!));
    });
  });

  describe("followed every quarter of an hour", () => {
    it("sends nothing while what it shows has not changed, nor before its token has come", async () => {
      await begins();
      vi.setSystemTime(new Date(hour(8).getTime() + 7 * MINUTE_MS));

      expect(await follow()).toMatchObject({ running: 1, updated: 0, ended: 0 });
      await buoy(new Date(hour(8).getTime() - 5 * MINUTE_MS));
      expect(await follow()).toMatchObject({ running: 1, updated: 0 });
      expect(apple.activities()).toHaveLength(1);
    });

    it("sends nothing from one quarter of an hour to the next while what a person sees stays, the tide being read to the minute", async () => {
      await begins();
      await tokenGiven();

      for (const minutes of [7, 22, 37, 52]) {
        vi.setSystemTime(new Date(hour(8).getTime() + minutes * MINUTE_MS));
        expect(await follow()).toMatchObject({ running: 1, updated: 0, failed: 0 });
      }

      expect(apple.activities()).toHaveLength(1);
      const tide = apple.activities()[0]?.read.shown?.tide;
      expect(new Date(tide!.time).getTime() % MINUTE_MS).toBe(0);
      expect(tide!.heightMeters).toBe(Math.round(tide!.heightMeters * 10) / 10);
    });

    it("updates it at the low priority when what it shows changed, once", async () => {
      await begins();
      const token = await tokenGiven();
      vi.setSystemTime(new Date(hour(8).getTime() + 7 * MINUTE_MS));
      await buoy(new Date(hour(8).getTime() - 5 * MINUTE_MS));

      expect(await follow()).toMatchObject({ running: 1, updated: 1, failed: 0 });
      expect(await follow()).toMatchObject({ running: 1, updated: 0 });

      const [, update] = apple.activities();
      expect(update).toMatchObject({ token, kind: "activity", priority: 5 });
      expect(update?.read).toMatchObject({
        event: "update",
        alert: null,
        staleDate: hour(12).getTime() / 1000,
        shown: {
          buoy: {
            observedAt: new Date(hour(8).getTime() - 5 * MINUTE_MS).toISOString(),
            heightMeters: 1.7,
            periodSeconds: 13,
            directionDegrees: 290,
          },
        },
      });
      expect((await activities())[0]?.shown).toBe(shownHash(update!.read.shown!));
    });

    it("shows the wind a station near measured lately, and how it meets the shore", async () => {
      await begins();
      await tokenGiven();
      vi.setSystemTime(new Date(hour(8).getTime() + 7 * MINUTE_MS));
      const observedAt = new Date(hour(8).getTime() - 10 * MINUTE_MS);
      await database.db.insert(station).values({
        id: "wind",
        provider: "test",
        providerStationId: "wind",
        name: "Biarritz airport",
        latitude: 43.47,
        longitude: -1.53,
        licenseType: "open",
        licenseUrl: "https://example.org/licence",
        attribution: "Example",
        reportsWind: true,
        latestObservedAt: observedAt,
      });
      await database.db.insert(reading).values({
        stationId: "wind",
        observedAt,
        windSpeedMs: 3.14,
        windGustMs: 5.26,
        windDirectionDeg: 95,
      });

      await follow();

      expect(apple.activities()[1]?.read.shown?.wind).toEqual({
        observedAt: observedAt.toISOString(),
        speedMetersPerSecond: 3.1,
        gustMetersPerSecond: 5.3,
        directionDegrees: 95,
        atShore: "offshore",
      });
      const said = JSON.stringify(apple.asked().map((one) => one.payload));
      expect(said).not.toContain("Biarritz");
      expect(said).not.toContain('"wind"');
    });

    it("gives it the new end of a window that moved", async () => {
      await begins();
      const token = await tokenGiven();
      kept.provider.waves = swellBetween(8, 15);
      vi.setSystemTime(new Date(hour(8).getTime() + 20 * MINUTE_MS));
      await look();
      vi.setSystemTime(new Date(hour(8).getTime() + 22 * MINUTE_MS));

      expect(await follow()).toMatchObject({ updated: 1 });

      expect(apple.activities()[1]).toMatchObject({
        token,
        read: { shown: { end: hour(15).toISOString() }, staleDate: hour(15).getTime() / 1000 },
      });
      expect((await activities())[0]?.lastsUntil).toEqual(hour(15));
    });

    it("ends it when its window is over, at once, and sends it nothing more", async () => {
      await begins();
      const token = await tokenGiven();
      vi.setSystemTime(hour(12));

      expect(await follow()).toMatchObject({ running: 0, ended: 1 });
      expect(await follow()).toMatchObject({ running: 0, ended: 0 });

      expect(apple.activities()[1]).toMatchObject({
        token,
        priority: 10,
        read: { event: "end", dismissalDate: hour(12).getTime() / 1000, staleDate: null },
      });
      expect(apple.activities()).toHaveLength(2);
      expect(await activities()).toMatchObject([{ endedAt: hour(12), token: null }]);
    });

    it("ends it when the last look no longer finds its window", async () => {
      await begins();
      await tokenGiven();
      kept.provider.waves = () => 0.2;
      vi.setSystemTime(new Date(hour(8).getTime() + 20 * MINUTE_MS));
      await look();

      expect(await follow()).toMatchObject({ ended: 1 });
      expect(apple.activities()[1]?.read.event).toBe("end");
    });

    it.each([
      ["its alert is switched off", () => database.db.update(alert).set({ enabled: false })],
      [
        "its alert is changed",
        () => database.db.update(alert).set({ revision: sql`${alert.revision} + 1` }),
      ],
      ["its alert is deleted", () => database.db.delete(alert)],
      [
        "its alert is paused for the day",
        () => database.db.update(alert).set({ awayUntil: hour(24) }),
      ],
      [
        "its account is away",
        () =>
          database.db
            .update(alertSettings)
            .set({ awayUntil: hour(48) })
            .where(eq(alertSettings.userId, "owner")),
      ],
      [
        "its account is suspended",
        () => database.db.insert(accountSuspension).values({ userId: "owner" }),
      ],
      [
        "the iPhone's switch is turned off",
        () => database.db.update(pushSubscription).set({ activityStartToken: null }),
      ],
    ])("ends it when %s", async (_what, change) => {
      await begins();
      const token = await tokenGiven();
      vi.setSystemTime(new Date(hour(8).getTime() + 7 * MINUTE_MS));
      await change();

      expect(await follow()).toMatchObject({ ended: 1 });

      expect(apple.activities()[1]).toMatchObject({ token, read: { event: "end" } });
      expect(await activities()).toMatchObject([{ endedAt: expect.any(Date), token: null }]);
    });

    it("ends one whose token never came, sending nothing, when its window is over", async () => {
      await begins();
      vi.setSystemTime(hour(12));

      expect(await follow()).toMatchObject({ ended: 1 });
      expect(apple.activities()).toHaveLength(1);
      expect(await activities()).toMatchObject([{ endedAt: hour(12) }]);
    });

    it("ends one that Apple says is no more on the phone", async () => {
      await begins();
      const token = await tokenGiven();
      apple.answers.set(token, { status: 410, reason: "ExpiredToken" });
      vi.setSystemTime(new Date(hour(8).getTime() + 7 * MINUTE_MS));
      await buoy(new Date(hour(8).getTime() - 5 * MINUTE_MS));

      expect(await follow()).toMatchObject({ ended: 1 });
      expect(await activities()).toMatchObject([{ endedAt: expect.any(Date), token: null }]);
    });

    it("sends nothing more to one the app said ended", async () => {
      await begins();
      await tokenGiven();
      await database.db.update(liveActivity).set({ endedAt: hour(7.9), token: null });
      vi.setSystemTime(hour(12));

      expect(await follow()).toMatchObject({ running: 0, ended: 0 });
      expect(apple.activities()).toHaveLength(1);
    });

    it("forgets an activity a day after it ended", async () => {
      await begins();
      vi.setSystemTime(hour(12));
      await follow();
      vi.setSystemTime(hour(36.5));

      await follow();

      expect(await activities()).toEqual([]);
    });

    it("never writes a token in the log", async () => {
      const said = [
        vi.spyOn(console, "error").mockImplementation(() => {}),
        vi.spyOn(console, "log").mockImplementation(() => {}),
        vi.spyOn(console, "warn").mockImplementation(() => {}),
        vi.spyOn(console, "info").mockImplementation(() => {}),
      ];
      apple.answers.set(startToken, { status: 429, reason: "TooManyRequests" });
      await begins();
      apple.answers.delete(startToken);
      await database.db.delete(liveActivity);
      await database.db.delete(notificationDelivery);
      await database.db.delete(notification);
      await database.db.update(alertSpot).set({ pushBegun: [], begun: [] });
      vi.setSystemTime(hour(7.8));
      await pass();
      const token = await tokenGiven();
      apple.answers.set(token, { status: 429, reason: "TooManyRequests" });
      vi.setSystemTime(new Date(hour(8).getTime() + 7 * MINUTE_MS));
      await buoy(new Date(hour(8).getTime() - 5 * MINUTE_MS));
      await follow();

      const logged = said.flatMap((spy) => spy.mock.calls.flat().map(String)).join("\n");
      expect(logged).toContain("TooManyRequests");
      for (const one of [startToken, token, iphone.token]) expect(logged).not.toContain(one);
    });
  });
});
