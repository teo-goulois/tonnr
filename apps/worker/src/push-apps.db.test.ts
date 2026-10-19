import { testForecasts } from "@repo/conditions/forecasts/testing";
import {
  alert,
  alertSettings,
  alertSpot,
  notification,
  notificationDelivery,
  pushSubscription,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { providerCalls } from "@repo/db/schema/forecasts";
import { stationList, stationListBreak } from "@repo/db/schema/lists";
import { reportNotice, surfReport } from "@repo/db/schema/reports";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import type { AppDevice } from "@repo/push";
import { testApns, testFcm, testPusher } from "@repo/push/testing";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateAlerts } from "./alerts";
import type { PushOut } from "./deliveries";
import { tellMoments } from "./moments";
import { runReportNotices } from "./report-notices";

// The pushes to the apps on phones: decision 072. A notification still has one delivery for
// push, which goes to every device of its account, of every kind, each by its kind's way out.
// No test asks Apple or Google: `testApns` and `testFcm` stand for them, and `testPusher` for a
// browser's push service.
describe.skipIf(!TEST_DATABASE_URL)("the pushes to the apps on phones", () => {
  // A Friday morning, at the minute the looks run.
  const AT = new Date("2026-10-09T08:20:00Z");
  const HOUR_MS = 60 * 60 * 1000;
  const SATURDAY = Date.UTC(2026, 9, 10);
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let kept: ReturnType<typeof testForecasts>;
  let browsers: ReturnType<typeof testPusher>;
  let apple: ReturnType<typeof testApns>;
  let google: ReturnType<typeof testFcm>;
  let out: PushOut;
  let iphone: AppDevice;
  let android: AppDevice;

  // The rows the API writes for an account's devices: decision 072's shape.
  const subscribeBrowser = async (id: string) => {
    const device = browsers.device();
    await database.db.insert(pushSubscription).values({ id, userId: "owner", ...device });
    return device;
  };
  const subscribePhone = async (id: string, kind: "ios" | "android", device: AppDevice) => {
    await database.db.insert(pushSubscription).values({
      id,
      userId: "owner",
      kind,
      token: device.token,
      environment: kind === "ios" ? (device.environment ?? "production") : null,
      appId: device.appId,
      p256dh: device.p256dh,
      auth: device.auth,
    });
  };

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
    kept.provider.waves = (seconds: number) =>
      seconds * 1000 >= SATURDAY + 8 * HOUR_MS && seconds * 1000 < SATURDAY + 12 * HOUR_MS
        ? 1.2
        : 0.2;
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
    await db.delete(surfBreak);
    await db.delete(providerCalls);
    await db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.org" });
    await db
      .insert(spot)
      .values({ id: "home", userId: "owner", name: "Home", latitude: 43.63, longitude: -1.46 });
    await db.insert(alert).values({
      id: "bay",
      userId: "owner",
      name: "The bay",
      criteria: { waveHeightMeters: { min: 1 } },
    });
    await db.insert(alertSpot).values({ spotId: "home", alertId: "bay", position: 0 });
    await db.insert(alertSettings).values({
      userId: "owner",
      daylightOnly: false,
      locale: "es",
      quietFrom: null,
      quietTo: null,
      onEvening: false,
      onBegin: false,
    });
    await subscribeBrowser("a-browser");
    iphone = apple.device();
    android = google.device();
    await subscribePhone("b-iphone", "ios", iphone);
    await subscribePhone("c-android", "android", android);
  });

  const look = () => Effect.runPromise(evaluateAlerts(database.db, kept.forecasts));
  const found = async () => {
    await look();
    vi.advanceTimersByTime(3 * HOUR_MS);
    await look();
  };
  const pass = (push: PushOut | null = out) =>
    Effect.runPromise(tellMoments(database.db, null, push));
  const states = async () =>
    (
      await database.db
        .select({ moment: notification.moment, state: notificationDelivery.state })
        .from(notificationDelivery)
        .innerJoin(notification, eq(notification.id, notificationDelivery.notificationId))
        .where(eq(notificationDelivery.channel, "push"))
    ).map((one) => [one.moment, one.state]);
  const devices = async () =>
    (await database.db.select().from(pushSubscription).orderBy(pushSubscription.id)).map(
      (row) => row.id,
    );
  const pushedAt = async () =>
    (await database.db.select().from(alertSpot))[0]?.pushed.map((piece) => piece.start);

  describe("of an alert", () => {
    it("leave to every device of the account, of every kind, as one push of its day", async () => {
      await found();

      expect(await pass()).toMatchObject({ pushes: 1, failed: 0 });

      const [web] = browsers.sent();
      const [ios] = apple.sent();
      const [phone] = google.sent();
      expect(ios?.token).toBe(iphone.token);
      expect(phone?.token).toBe(android.token);
      // The same words to all three: a browser reads what it always read.
      expect(ios?.push).toMatchObject(web?.push ?? {});
      expect(phone?.push).toEqual(ios?.push);
      // Apple reads the line that stands in for it, in the account's language.
      expect(ios?.standIn).toBe("Una de tus alertas tiene novedades");
      expect(await states()).toEqual([["found", "sent"]]);
      expect(await pushedAt()).toEqual([new Date(SATURDAY + 8 * HOUR_MS).toISOString()]);
      // One push of the account's day, however many devices it went to.
      const [counted] = await database.db
        .select()
        .from(providerCalls)
        .where(eq(providerCalls.provider, "alert-push:owner"));
      expect(counted?.calls).toBe(1);
    });

    it("carry what the app reads, the ids and what the account has not read, and a browser none of it", async () => {
      // A notice of reports that the account has not read either, at a break it keeps.
      await database.db.insert(surfBreak).values({
        id: "point",
        slug: "point",
        name: "La Point",
        latitude: 43.48,
        longitude: -1.56,
      });
      await database.db.insert(reportNotice).values({
        id: "a-notice",
        userId: "owner",
        breakId: "point",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await found();

      await pass();

      const [told] = await database.db.select().from(notification);
      const [ios] = apple.sent();
      expect(ios?.push).toMatchObject({
        thread: "alert:bay",
        ids: { notification: told?.id, alert: "bay" },
        level: "active",
        // This notification, and the notice.
        badge: 2,
      });
      // Its hours are tomorrow's: there is no "Not today".
      expect(ios?.push.category).toBeUndefined();
      expect(google.sent()[0]?.push).toEqual(ios?.push);
      expect(Object.keys(browsers.sent()[0]?.push ?? {}).sort()).toEqual([
        "body",
        "tag",
        "title",
        "url",
      ]);
    });

    it("are kept by Apple and Google until the hours they speak of are over", async () => {
      await found();
      await pass();

      // The clock of the test is on a whole second.
      const over = (SATURDAY + 12 * HOUR_MS) / 1000;
      expect(apple.sent()[0]?.expiration).toBe(over);
      expect(google.sent()[0]?.ttl).toBe(`${over - Date.now() / 1000}s`);
    });

    it("pass over a kind of device the worker does not reach", async () => {
      await found();

      expect(await pass({ ...out, ios: null })).toMatchObject({ pushes: 1 });

      expect(browsers.sent()).toHaveLength(1);
      expect(google.sent()).toHaveLength(1);
      expect(apple.asked()).toEqual([]);
      // Passed over, and kept: another worker may reach it.
      expect(await devices()).toEqual(["a-browser", "b-iphone", "c-android"]);
    });

    it("are given up when the account has no device the worker reaches", async () => {
      await database.db.delete(pushSubscription).where(eq(pushSubscription.kind, "web"));
      await found();

      expect(await pass({ web: browsers.pusher, webOrigin: out.webOrigin })).toMatchObject({
        pushes: 0,
      });

      expect(await states()).toEqual([["found", "expired"]]);
      expect([...browsers.asked(), ...apple.asked(), ...google.asked()]).toEqual([]);
    });

    it("leave to the phones of an account that has no browser, from a worker that holds no pair of keys", async () => {
      await database.db.delete(pushSubscription).where(eq(pushSubscription.kind, "web"));
      await found();

      expect(await pass({ ...out, web: null })).toMatchObject({ pushes: 1 });

      expect(apple.sent()).toHaveLength(1);
      expect(google.sent()).toHaveLength(1);
    });

    it("forget a phone whose service says its token is no more, and no other device", async () => {
      apple.answers.set(iphone.token, { status: 410, reason: "Unregistered" });
      google.answers.set(android.token, { status: 404, code: "UNREGISTERED" });
      await found();

      expect(await pass()).toMatchObject({ pushes: 1 });

      expect(await devices()).toEqual(["a-browser"]);
      expect(await states()).toEqual([["found", "sent"]]);
    });

    it("are given up, telling nothing, when every device is gone", async () => {
      await database.db.delete(pushSubscription).where(eq(pushSubscription.kind, "web"));
      apple.answers.set(iphone.token, { status: 400, reason: "BadDeviceToken" });
      google.answers.set(android.token, { status: 403, code: "SENDER_ID_MISMATCH" });
      await found();

      expect(await pass()).toMatchObject({ pushes: 0 });

      expect(await devices()).toEqual([]);
      expect(await states()).toEqual([["found", "expired"]]);
      expect(await pushedAt()).toEqual([]);
    });

    it("did not leave when every service said no, and are not tried again", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await database.db.delete(pushSubscription).where(eq(pushSubscription.kind, "web"));
      apple.answers.set(iphone.token, { status: 403, reason: "InvalidProviderToken" });
      google.answers.set(android.token, { status: 429, code: "QUOTA_EXCEEDED" });
      await found();

      expect(await pass()).toMatchObject({ pushes: 0, failed: 1 });

      expect(await states()).toEqual([["found", "failed"]]);
      expect(await pushedAt()).toEqual([]);
      expect(await devices()).toEqual(["b-iphone", "c-android"]);
    });

    it("are told when one service did not answer, as it may have taken them", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await database.db.delete(pushSubscription).where(eq(pushSubscription.kind, "web"));
      apple.answers.set(iphone.token, async () => ({ failure: "given up" }));
      google.answers.set(android.token, { status: 400, code: "INVALID_ARGUMENT" });
      await found();

      await pass();

      expect(await states()).toEqual([["found", "failed"]]);
      expect(await pushedAt()).toEqual([new Date(SATURDAY + 8 * HOUR_MS).toISOString()]);
    });
  });

  // "Not today": decision 072.
  describe("of an alert whose hours are today", () => {
    // This afternoon, in the account's time zone, which is UTC.
    const FRIDAY = Date.UTC(2026, 9, 9);
    beforeEach(() => {
      kept.provider.waves = (seconds: number) =>
        seconds * 1000 >= FRIDAY + 14 * HOUR_MS && seconds * 1000 < FRIDAY + 18 * HOUR_MS
          ? 1.2
          : 0.2;
    });
    const pause = () =>
      database.db
        .update(alert)
        .set({ awayUntil: new Date(Date.UTC(2026, 9, 10)) })
        .where(eq(alert.id, "bay"));
    const told = async () =>
      (await database.db.select().from(notification)).map((one) => one.moment);

    it("offer “Not today” on the phones, until the end of the account's day as it was written", async () => {
      await found();

      await pass();

      const midnight = new Date(Date.UTC(2026, 9, 10)).toISOString();
      expect(apple.sent()[0]?.push).toMatchObject({ category: "today", pauseUntil: midnight });
      expect(google.sent()[0]?.push).toMatchObject({ category: "today", pauseUntil: midnight });
    });

    it("tell nothing of today once the alert is paused, and the next look cuts what was told without a word", async () => {
      await found();
      await pass();
      await pause();

      vi.advanceTimersByTime(3 * HOUR_MS);
      await look();
      await pass();

      // No "gone" for hours the pause closed: one push, of the window as it was found.
      expect(await told()).toEqual(["found"]);
      expect(apple.sent()).toHaveLength(1);
      expect(browsers.sent()).toHaveLength(1);
      // What stands as told is cut as the hours are now: none of today.
      const [link] = await database.db.select().from(alertSpot);
      expect(link?.told).toEqual([]);
    });

    it("are not pushed once the alert is paused while its push waits, by any way out", async () => {
      await found();
      await pause();

      await pass();
      vi.advanceTimersByTime(3 * HOUR_MS);
      await look();
      await pass();

      expect(await told()).toEqual(["found"]);
      expect([...browsers.sent(), ...apple.sent(), ...google.sent()]).toEqual([]);
      expect(await pushedAt()).toEqual([]);
    });

    it("are not found at all by an alert that was paused before its looks", async () => {
      await pause();
      await found();

      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(await told()).toEqual([]);
    });
  });

  describe("of a notice of reports", () => {
    beforeEach(async () => {
      const { db } = database;
      // Ten in the morning in Biarritz, out of the default quiet hours.
      vi.setSystemTime(new Date("2026-10-18T08:00:00Z"));
      await db
        .insert(user)
        .values({ id: "author", name: "author", email: "a@example.org", username: "author" });
      await db.insert(surfBreak).values({
        id: "point",
        slug: "point",
        name: "La Point",
        latitude: 43.48,
        longitude: -1.56,
      });
      await db
        .insert(stationList)
        .values({ id: "favorites", userId: "owner", name: "Favorites", isDefault: true });
      await db.insert(stationListBreak).values({ listId: "favorites", breakId: "point" });
      await db.insert(surfReport).values({
        id: "a-report",
        userId: "author",
        breakId: "point",
        state: "published",
        waveSize: "shoulder",
        note: "Clean sets on the outside",
        terms: "2026-10-19",
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
        checkedAt: new Date(),
        publishedAt: new Date(),
      });
    });
    const run = (push: PushOut | null = out) =>
      runReportNotices(database.db, { push, storage: null });

    it("leaves to every device of the account, of every kind", async () => {
      expect(await run()).toMatchObject({ accounts: 1, sent: 1 });

      expect(browsers.sent()).toHaveLength(1);
      expect(apple.sent()[0]?.push).toMatchObject({ title: "Nuevo reporte en La Point" });
      expect(google.sent()[0]?.push).toMatchObject({ title: "Nuevo reporte en La Point" });
    });

    it("is made for an account whose devices the worker reaches, and for no other", async () => {
      await database.db.delete(pushSubscription).where(eq(pushSubscription.kind, "web"));

      expect(await run({ web: browsers.pusher, webOrigin: out.webOrigin })).toMatchObject({
        accounts: 1,
        sent: 0,
      });

      // The notice is in the list, and no push waits for it.
      const [notice] = await database.db.select().from(reportNotice);
      expect(notice?.pushState).toBeNull();
    });

    it("forgets a phone whose token is no more", async () => {
      google.answers.set(android.token, { status: 404, code: "UNREGISTERED" });

      await run();

      expect(await devices()).toEqual(["a-browser", "b-iphone"]);
    });
  });
});
