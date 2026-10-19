import { testForecasts } from "@repo/conditions/forecasts/testing";
import { readAppLink } from "@repo/config/links";
import { countCalls } from "@repo/db/calls";
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
import { unitPreferences } from "@repo/db/schema/preferences";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { testMailer } from "@repo/mail/testing";
import { PUSH_BYTES } from "@repo/push/encrypt";
import { testPusher } from "@repo/push/testing";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateAlerts } from "./alerts";
import {
  ACCOUNT_DAILY_PUSHES,
  ALERT_PUSH_PROVIDER,
  type MailOut,
  type PushOut,
  hand,
  sendDeliveries,
  take,
} from "./deliveries";
import { tellMoments } from "./moments";

// The pushes of the alerts: decision 031, "Push". A push leaves as a mail does, and each rule
// of the mail that holds of it has its test here, beside those that are a push's alone. No test
// sends a push: a push service in memory takes what the instance's pusher signs and encrypts,
// and reads it as the browser it was for.
describe.skipIf(!TEST_DATABASE_URL)("the pushes of the alerts", () => {
  // A Friday morning, at the minute the looks run.
  const AT = new Date("2026-10-09T08:20:00Z");
  const HOUR_MS = 60 * 60 * 1000;
  const SATURDAY = Date.UTC(2026, 9, 10);
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let kept: ReturnType<typeof testForecasts>;
  let service: ReturnType<typeof testPusher>;
  let out: PushOut;
  // The address of the browser the account is subscribed from.
  let phone: string;

  const swellBetween = (from: number, to: number) => (seconds: number) =>
    seconds * 1000 >= SATURDAY + from * HOUR_MS && seconds * 1000 < SATURDAY + to * HOUR_MS
      ? 1.2
      : 0.2;

  /** A browser of an account that subscribed: its row, as the API writes it. */
  const subscribe = async (id: string, userId = "owner") => {
    const device = service.device();
    await database.db.insert(pushSubscription).values({ id, userId, ...device });
    return device.endpoint;
  };

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
    kept.provider.waves = swellBetween(8, 12);
    service = testPusher();
    out = { web: service.pusher, webOrigin: "https://app.example.org" };
    const { db } = database;
    await db.delete(user);
    await db.delete(providerCalls);
    // An address that is not checked: a push asks nothing of it.
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
    // An account that goes at any hour, never said yes to mail, and has no quiet hours.
    await db.insert(alertSettings).values({
      userId: "owner",
      daylightOnly: false,
      locale: "en",
      quietFrom: null,
      quietTo: null,
      // No evening here: one moment at a time.
      onEvening: false,
      onBegin: false,
    });
    phone = await subscribe("phone");
  });

  const look = () => Effect.runPromise(evaluateAlerts(database.db, kept.forecasts));
  /** The next look, three hours on. */
  const next = () => {
    vi.advanceTimersByTime(3 * HOUR_MS);
    return look();
  };
  /** The lighter pass, with the instance's pusher or with none, and with a mailer or none. */
  const pass = (push: PushOut | null = out, mail: MailOut | null = null) =>
    Effect.runPromise(tellMoments(database.db, mail, push));
  const deliveries = (channel: "mail" | "push" = "push") =>
    database.db
      .select({
        moment: notification.moment,
        state: notificationDelivery.state,
        dueAt: notificationDelivery.dueAt,
        expiresAt: notificationDelivery.expiresAt,
      })
      .from(notificationDelivery)
      .innerJoin(notification, eq(notification.id, notificationDelivery.notificationId))
      .where(eq(notificationDelivery.channel, channel))
      .orderBy(notification.createdAt, notification.moment);
  const states = async (channel: "mail" | "push" = "push") =>
    (await deliveries(channel)).map((one) => [one.moment, one.state]);
  const settings = (changes: Partial<typeof alertSettings.$inferInsert>) =>
    database.db.update(alertSettings).set(changes).where(eq(alertSettings.userId, "owner"));
  /** A window found by two looks: its notification is written, and its push is on its way. */
  const found = async () => {
    await look();
    await next();
  };
  /** What the browsers were sent, in the order it left. */
  const pushes = () => service.sent().map((sent) => sent.push);
  const devices = async () =>
    (await database.db.select().from(pushSubscription).orderBy(pushSubscription.id)).map(
      (row) => row.id,
    );
  const pushedAt = async () =>
    (await database.db.select().from(alertSpot))[0]?.pushed.map((piece) => piece.start);
  const hour = (at: number) => new Date(SATURDAY + at * HOUR_MS).toISOString();

  it("leave with what an alert told, once, to the browser the account subscribed from", async () => {
    await found();
    expect(await deliveries()).toMatchObject([
      {
        moment: "found",
        state: "pending",
        dueAt: new Date(),
        // Worth sending until the hours it speaks of are over.
        expiresAt: new Date(SATURDAY + 12 * HOUR_MS),
      },
    ]);

    expect(await pass()).toMatchObject({ pushes: 1, mails: 0, failed: 0 });
    expect(service.sent()).toEqual([
      {
        endpoint: phone,
        // The push service keeps it until the hours it speaks of are over, and no longer.
        keepSeconds: (SATURDAY + 12 * HOUR_MS - Date.now()) / 1000,
        push: {
          title: "The bay: a window is taking shape",
          body: expect.stringMatching(
            /^Home: Sat 10 Oct, 08:00 to 12:00\nForecast for Sat 10 Oct, 08:00: waves 1\.2 m, /,
          ),
          // Pressed, it opens the spot.
          url: "https://app.example.org/app?spot=home",
          tag: expect.stringMatching(/^[\w-]{22}$/),
        },
      },
    ]);
    // Pressed on a phone with the app, it opens the spot there: decision 073.
    expect(readAppLink(service.sent()[0]?.push.url ?? "", out.webOrigin)).toEqual({
      screen: "map",
      search: { spot: "home" },
    });
    expect(await states()).toEqual([["found", "sent"]]);
    expect(await pushedAt()).toEqual([hour(8)]);

    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(service.sent()).toHaveLength(1);
  });

  it("leave to every browser of the account, as one push of its day", async () => {
    const laptop = await subscribe("laptop");
    await found();

    expect(await pass()).toMatchObject({ pushes: 1, failed: 0 });
    const sent = service.sent();
    expect(sent.map((one) => one.endpoint).sort()).toEqual([phone, laptop].sort());
    expect(sent[0]?.push).toEqual(sent[1]?.push);
    expect(await states()).toEqual([["found", "sent"]]);
  });

  it("are written in the account's language, with its pages", async () => {
    await settings({ locale: "fr", zone: "Europe/Paris" });
    await found();
    await pass();

    const [push] = pushes();
    expect(push?.title).toBe("The bay : un créneau se dessine");
    expect(push?.body).toContain(
      "Home : sam. 10 oct., 10:00 à 14:00\nPrévu pour sam. 10 oct., 10:00",
    );
    expect(push?.url).toBe("https://app.example.org/fr/app?spot=home");
  });

  it("are written in the units the account reads its screens in, a direction with its figure", async () => {
    await database.db
      .insert(unitPreferences)
      .values({ userId: "owner", windSpeed: "kmh", height: "ft", savedAt: new Date() });
    await found();
    await pass();

    // Waves of 1.2 m are 3.9 ft, and 5 m/s of wind is 18 km/h.
    expect(pushes()[0]?.body).toContain("waves 3.9 ft");
    expect(pushes()[0]?.body).toMatch(/wind 18 km\/h, E 90°$/);
    expect(pushes()[0]?.body).not.toMatch(/\d kn\b/);
  });

  it("are not made for an account that no browser is subscribed from", async () => {
    await database.db.delete(pushSubscription);
    await found();

    expect(await deliveries()).toEqual([]);
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(service.asked()).toEqual([]);
  });

  it("are made from the notification that follows a subscription, and for no earlier one", async () => {
    await database.db.delete(pushSubscription);
    await found();
    // The account switches push on, on this device, after Saturday morning was told.
    await subscribe("phone");
    expect(await pass()).toMatchObject({ pushes: 0 });

    // What the alert tells next leaves by push, with what push never told: the morning too.
    kept.provider.waves = (seconds) =>
      Math.max(swellBetween(8, 12)(seconds), swellBetween(32, 36)(seconds));
    await next();
    await next();
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[0]?.body).toContain("Sat 10 Oct, 08:00 to 12:00 · Sun 11 Oct, 08:00 to 12:00");
  });

  it("wait for the end of the account's quiet hours", async () => {
    // Quiet from 10:00 to 13:00 UTC: the second look, at 11:20, falls in them.
    await settings({ quietFrom: 10 * 60, quietTo: 13 * 60 });
    await found();
    expect((await deliveries())[0]?.dueAt).toEqual(new Date("2026-10-09T13:00:00Z"));

    expect(await pass()).toMatchObject({ pushes: 0 });
    vi.setSystemTime(new Date("2026-10-09T13:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 1 });
  });

  it("are given up once the hours they spoke of are over", async () => {
    await settings({ quietFrom: 0, quietTo: 23 * 60 + 59 });
    await found();

    vi.setSystemTime(new Date(SATURDAY + 12 * HOUR_MS));
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
    expect(service.asked()).toEqual([]);
  });

  it("are not sent to an account whose browser was forgotten while they waited", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    await database.db.delete(pushSubscription);
    await settings({ quietFrom: null, quietTo: null });
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));

    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
    expect(service.asked()).toEqual([]);
    // Nothing was told: a browser that subscribes later is told these hours as new ones.
    expect(await pushedAt()).toEqual([]);
    // And nothing of the account's day was spent.
    expect(await database.db.select().from(providerCalls)).toEqual([]);
  });

  it("are not sent to an account that was kept out while they waited", async () => {
    const { accountSuspension } = await import("@repo/db/schema/access");
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    await database.db.insert(accountSuspension).values({ userId: "owner" });
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));

    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
    expect(service.asked()).toEqual([]);
  });

  it("do not keep those behind them waiting, however many cannot leave yet", async () => {
    // Sixty of an account whose alert no look has read lately, all written before the owner's.
    const { db } = database;
    await db.insert(user).values({ id: "late", name: "Late", email: "late@example.org" });
    await db.insert(alertSettings).values({ userId: "late" });
    await subscribe("late-phone", "late");
    await db
      .insert(spot)
      .values({ id: "far", userId: "late", name: "Far", latitude: 43.6, longitude: -1.47 });
    await db.insert(alert).values({
      id: "late-alert",
      userId: "late",
      name: "Late",
      criteria: { waveHeightMeters: { min: 9 } },
    });
    await db.insert(alertSpot).values({ spotId: "far", alertId: "late-alert", position: 0 });
    const earlier = new Date(AT.getTime() - HOUR_MS);
    const waiting = Array.from({ length: 60 }, (_, index) => `late-${index}`);
    await db.insert(notification).values(
      waiting.map((id) => ({
        id,
        userId: "late",
        alertId: "late-alert",
        moment: "found" as const,
        key: id,
        payload: { alertName: "Late", zone: "UTC", lines: [] },
      })),
    );
    await db.insert(notificationDelivery).values(
      waiting.map((notificationId) => ({
        notificationId,
        channel: "push" as const,
        dueAt: earlier,
        expiresAt: new Date(SATURDAY + 24 * HOUR_MS),
      })),
    );
    await found();
    // The look that came by read nothing of that alert's spot: its forecast is not fresh.
    await db.update(alertSpot).set({ lookedAt: null }).where(eq(alertSpot.alertId, "late-alert"));

    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(service.sent().map((sent) => sent.endpoint)).toEqual([phone]);
  });

  it("say that a window moved or went only when a push had told it", async () => {
    await found();
    await pass();
    kept.provider.waves = swellBetween(13, 17);
    await next();

    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[1]).toMatchObject({
      title: "The bay: the window has moved",
      body: expect.stringContaining(
        "Home: Moved: Sat 10 Oct, 13:00 to 17:00 (it was Sat 10 Oct, 08:00 to 12:00)\n",
      ),
      // The word that corrects takes the place of the one it corrects, in the browser.
      tag: pushes()[0]?.tag,
    });

    // A browser that subscribes after a window was told is not pushed its going.
    await database.db.delete(notification);
    await database.db.update(alertSpot).set({ pushed: [] });
    kept.provider.waves = () => 0.2;
    await next();
    await next();
    expect(await states()).toEqual([["gone", "pending"]]);
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["gone", "expired"]]);
    expect(pushes()).toHaveLength(2);
  });

  it("say where the hours are when they leave, and once, when a window moved as it waited", async () => {
    // Quiet all morning: nothing leaves before 15:00.
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    kept.provider.waves = swellBetween(13, 17);
    await next();

    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 1 });
    // The one that was written first leaves first, and says what there is to say: the other
    // has nothing left to tell, since no push ever told the hours it says have moved.
    expect(await states()).toEqual([
      ["found", "sent"],
      ["moved", "expired"],
    ]);
    expect(pushes()[0]?.title).toBe("The bay: a window is taking shape");
    expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 13:00 to 17:00\n");
    expect(pushes()[0]?.body).not.toContain("08:00");
  });

  it("say nothing of hours that came and went while they waited", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 20 * 60 });
    await found();
    kept.provider.waves = () => 0.2;
    await next();
    await next();

    vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([
      ["found", "expired"],
      ["gone", "expired"],
    ]);
    expect(service.asked()).toEqual([]);
  });

  it("tell the hours that still stand when others of the alert went as they waited", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 20 * 60 });
    // Saturday morning and Sunday morning.
    kept.provider.waves = (seconds) =>
      Math.max(swellBetween(8, 12)(seconds), swellBetween(32, 36)(seconds));
    await found();
    // Sunday's goes, and two looks say so.
    kept.provider.waves = swellBetween(8, 12);
    await next();
    await next();

    vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(await states()).toEqual([
      ["found", "sent"],
      ["gone", "expired"],
    ]);
    expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 08:00 to 12:00\n");
    expect(pushes()[0]?.body).not.toContain("Sun 11 Oct");
  });

  it("do not send hours that went without a word, for an account that switched changes off", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 20 * 60 });
    await found();
    await settings({ onChange: false });
    kept.provider.waves = () => 0.2;
    await next();
    await next();

    vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
  });

  it("do not say that it is on when the window went while that waited", async () => {
    // Nothing is told ahead: only that it is on, half an hour before.
    await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
    await found();
    for (let look = 0; look < 6; look += 1) await next();
    // Saturday, 07:45: it is said, in quiet hours that end at 09:00.
    await settings({ quietFrom: 7 * 60, quietTo: 9 * 60 });
    vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));
    expect(await pass()).toMatchObject({ begins: 1, pushes: 0 });
    expect(await states()).toEqual([["begins", "pending"]]);

    // The look of 08:20 finds no swell.
    kept.provider.waves = () => 0.2;
    vi.setSystemTime(new Date(SATURDAY + 8 * HOUR_MS + 20 * 60 * 1000));
    await look();
    vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["begins", "expired"]]);
    expect(service.asked()).toEqual([]);
  });

  it("say that it is on with what the last look read of the sea, for the browser to keep until it is over", async () => {
    await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
    await found();
    for (let look = 0; look < 6; look += 1) await next();
    vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));

    expect(await pass()).toMatchObject({ begins: 1, pushes: 1 });
    const [sent] = service.sent();
    expect(sent?.push.title).toBe("The bay: it is on");
    expect(sent?.push.body).toContain(
      "Home: Sat 10 Oct, 08:00 to 12:00\nForecast for Sat 10 Oct, 08:00: waves 1.2 m",
    );
    expect(sent?.keepSeconds).toBe(4.25 * 60 * 60);
    expect(await database.db.select().from(alertSpot)).toMatchObject([
      { pushBegun: [{ start: hour(8), end: hour(12) }], mailBegun: [] },
    ]);
  });

  it("are not sent for an alert that was switched off or deleted while they waited", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    await database.db.update(alert).set({ enabled: false });
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "expired"]]);

    await database.db.update(alert).set({ enabled: true, lookedAt: null });
    await database.db.delete(notification);
    await database.db.update(alertSpot).set({ told: [] });
    await settings({ quietFrom: 8 * 60, quietTo: 23 * 60 });
    await next();
    await database.db.delete(alert);
    vi.setSystemTime(new Date("2026-10-09T23:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
    expect(service.asked()).toEqual([]);
  });

  it("tell hours that a change of the account's hours opened, and nothing of those it closed", async () => {
    // The sea works from 08:00 to 17:00, and the account goes on Saturday mornings.
    const week = (from: number, to: number) =>
      Array.from({ length: 7 }, (_, day) =>
        day === 5 ? [{ from: from * 60, to: to * 60 }] : [{ from: 0, to: 24 * 60 }],
      );
    kept.provider.waves = swellBetween(8, 17);
    await settings({ week: week(8, 10) });
    await found();
    await pass();
    expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 08:00 to 10:00\n");

    // It now goes in the afternoon: those hours are new, to push as to the list.
    await settings({ week: week(13, 17) });
    await next();
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[1]?.title).toBe("The bay: a window is taking shape");
    expect(pushes()[1]?.body).toContain("Home: Sat 10 Oct, 13:00 to 17:00\n");
    expect(pushes()[1]?.body).not.toContain("No longer forecast");
    // Other hours: it stands beside what was said of the morning, and does not replace it.
    expect(pushes()[1]?.tag).not.toBe(pushes()[0]?.tag);
  });

  it("tell hours that outlasted what was written, when the push leaves after those were over", async () => {
    // Quiet from Friday 11:00 until Saturday 10:45: the hours told, 08:00 to 10:00, are over.
    await settings({ quietFrom: 11 * 60, quietTo: 10 * 60 + 45 });
    kept.provider.waves = swellBetween(8, 10);
    await found();
    // Two hours more: not a move that is told.
    kept.provider.waves = swellBetween(8, 12);
    for (let look = 0; look < 6; look += 1) await next();
    expect(await states()).toEqual([["found", "pending"]]);

    vi.setSystemTime(new Date(SATURDAY + 10.75 * HOUR_MS));
    expect(await pass()).toMatchObject({ pushes: 1 });
    const [sent] = service.sent();
    expect(sent?.push.body).toContain("Home: Sat 10 Oct, 08:00 to 12:00\n");
    // Kept for the hours it speaks of as they are now, not as they were written.
    expect(sent?.keepSeconds).toBe(1.25 * 60 * 60);
  });

  it("tell nothing of a move that an account was not told while it had changes switched off", async () => {
    await found();
    await pass();
    await settings({ onChange: false });
    kept.provider.waves = swellBetween(13, 17);
    await next();
    await settings({ onChange: true });
    // Sunday morning is new: its push says that, and nothing of Saturday's move.
    kept.provider.waves = (seconds) =>
      Math.max(swellBetween(13, 17)(seconds), swellBetween(32, 36)(seconds));
    await next();
    await next();

    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[1]?.title).toBe("The bay: a window is taking shape");
    expect(pushes()[1]?.body).toContain("Home: Sun 11 Oct, 08:00 to 12:00\n");
    expect(pushes()[1]?.body).not.toContain("Moved");
  });

  describe("that it is on, when it waited", () => {
    // Saturday, 07:45: said in quiet hours that end at 09:00.
    const waiting = async () => {
      await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
      await found();
      for (let look = 0; look < 6; look += 1) await next();
      await settings({ quietFrom: 7 * 60, quietTo: 9 * 60 });
      vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));
      expect(await pass()).toMatchObject({ begins: 1, pushes: 0 });
      expect(await states()).toEqual([["begins", "pending"]]);
    };

    it("leaves once the quiet hours end, while the hours are on", async () => {
      await waiting();
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(pushes()[0]?.title).toBe("The bay: it is on");
      // The sea of the hour it leaves in, which the push names.
      expect(pushes()[0]?.body).toContain("Forecast for Sat 10 Oct, 09:00: waves 1.2 m");
    });

    it("is not sent by an account that switched it off meanwhile", async () => {
      await waiting();
      await settings({ onBegin: false });
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(await states()).toEqual([["begins", "expired"]]);
    });

    it("waits for hours that have become later ones, and is sent when they begin", async () => {
      await waiting();
      // The look of 08:20 finds the swell from 11:00 on.
      kept.provider.waves = swellBetween(11, 15);
      vi.setSystemTime(new Date(SATURDAY + 8 * HOUR_MS + 20 * 60 * 1000));
      await look();
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      // Not on yet: it waits for the hours as they are now, and says so when they begin.
      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(await deliveries()).toMatchObject([
        {
          moment: "begins",
          state: "pending",
          dueAt: new Date(SATURDAY + 10.5 * HOUR_MS),
          expiresAt: new Date(SATURDAY + 15 * HOUR_MS),
        },
      ]);

      vi.setSystemTime(new Date(SATURDAY + 10.5 * HOUR_MS));
      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 11:00 to 15:00\n");
    });

    it("is not sent once its alert is gone, wherever its spot is then", async () => {
      await waiting();
      await database.db.delete(alert);
      await database.db.insert(alert).values({
        id: "other",
        userId: "owner",
        name: "Another",
        criteria: { waveHeightMeters: { min: 1 } },
      });
      await database.db.insert(alertSpot).values({ spotId: "home", alertId: "other", position: 0 });
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(await states()).toEqual([["begins", "expired"]]);
    });

    it("says what is on, then what was written with it once that begins, each once", async () => {
      // The sea works in the morning and again in the afternoon.
      await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
      kept.provider.waves = (seconds) =>
        Math.max(swellBetween(8, 10)(seconds), swellBetween(13, 15)(seconds));
      await found();
      for (let look = 0; look < 6; look += 1) await next();
      vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));
      await settings({ quietFrom: 7 * 60, quietTo: 8 * 60 });
      expect(await pass()).toMatchObject({ begins: 1, pushes: 0 });
      // The one that waits was written for the whole day, as one that waited longer would be.
      const [made] = await database.db.select().from(notification);
      const [line] = made?.payload.lines ?? [];
      if (!made || !line) throw new Error("no notification");
      await database.db
        .update(notification)
        .set({
          payload: {
            ...made.payload,
            lines: [{ ...line, open: [{ start: hour(8), end: hour(15) }] }],
          },
        })
        .where(eq(notification.id, made.id));

      vi.setSystemTime(new Date(SATURDAY + 8 * HOUR_MS));
      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 08:00 to 10:00\n");
      expect(pushes()[0]?.body).not.toContain("13:00");
      // It stays on its way for the afternoon.
      expect((await deliveries()).filter((one) => one.state === "pending")).toMatchObject([
        {
          dueAt: new Date(SATURDAY + 12.5 * HOUR_MS),
          expiresAt: new Date(SATURDAY + 15 * HOUR_MS),
        },
      ]);

      // Looked at again through the morning, it says the afternoon when it begins, and not
      // the morning once more.
      vi.setSystemTime(new Date(SATURDAY + 8 * HOUR_MS + 20 * 60 * 1000));
      await look();
      vi.setSystemTime(new Date(SATURDAY + 11 * HOUR_MS + 20 * 60 * 1000));
      await look();
      vi.setSystemTime(new Date(SATURDAY + 12.5 * HOUR_MS));
      await pass();
      const afternoon = pushes().filter((push) => push.body.includes("13:00 to 15:00"));
      expect(afternoon).toHaveLength(1);
      expect(afternoon[0]?.body).not.toContain("08:00 to 10:00");
    });

    it("takes what a stopped worker left without holding a delivery before the settings", async () => {
      await waiting();
      const [made] = await database.db.select().from(notification);
      const [due] = await database.db.select().from(notificationDelivery);
      if (!made || !due) throw new Error("no notification");
      await database.db.insert(notification).values({ ...made, id: "second", key: "second" });
      await database.db.insert(notificationDelivery).values({ ...due, notificationId: "second" });
      // The first is written to be leaving, for both, and its worker stops there.
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));
      expect(typeof (await take(database.db, out, made.id))).toBe("object");
      vi.advanceTimersByTime(20 * 60 * 1000);

      // An account that changes its quiet hours holds its settings, then its deliveries. The
      // worker that takes the other one meanwhile waits for the settings, holding neither.
      let taken: Awaited<ReturnType<typeof take>> | undefined;
      await database.db.transaction(async (changing) => {
        await changing.select().from(alertSettings).for("update");
        const taking = take(database.db, out, "second").then((outcome) => {
          taken = outcome;
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(taken).toBeUndefined();
        await changing.update(notificationDelivery).set({ dueAt: new Date() });
        // Its transaction ends here, and the worker goes on.
        void taking;
      });
      await vi.waitFor(() => expect(taken).toBe("skipped"));
      // What the first told is taken as told, and the second has nothing left to say.
      expect((await states()).map(([, state]) => state).sort()).toEqual(["expired", "sending"]);
      expect(await database.db.select().from(alertSpot)).toMatchObject([
        { pushBegun: [{ start: hour(8), end: hour(12) }] },
      ]);
    });

    it("leaves as one push when two of an alert waited for hours that are now the same", async () => {
      await waiting();
      // Another one of the alert, written for the end of the same morning.
      const [made] = await database.db.select().from(notification);
      const [due] = await database.db.select().from(notificationDelivery);
      const [line] = made?.payload.lines ?? [];
      if (!made || !due || !line) throw new Error("no notification");
      await database.db.insert(notification).values({
        ...made,
        id: "second",
        key: "second",
        payload: {
          ...made.payload,
          lines: [{ ...line, open: [{ start: hour(10), end: hour(12) }] }],
        },
      });
      await database.db.insert(notificationDelivery).values({ ...due, notificationId: "second" });
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(service.sent()).toHaveLength(1);
      expect((await states()).map(([, state]) => state).sort()).toEqual(["expired", "sent"]);
      expect(await pass()).toMatchObject({ pushes: 0 });
    });
  });

  describe("the evening before", () => {
    // Friday, 20:00, for an account that is told then: the last look was at 17:20.
    const evening = async (more: Parameters<typeof settings>[0] = {}) => {
      await settings({ onFound: false, onEvening: true, eveningMinutes: 20 * 60, ...more });
      await found();
      await next();
      await next();
      vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
    };

    it("leaves that evening, with the day it lists and each spot's alert, to keep until midnight", async () => {
      await evening();

      expect(await pass()).toMatchObject({ evenings: 1, pushes: 1 });
      const [sent] = service.sent();
      expect(sent?.push).toMatchObject({
        title: "Saturday 10 October: what is forecast",
        body: expect.stringContaining("Home (The bay): Sat 10 Oct, 08:00 to 12:00\n"),
        url: "https://app.example.org/app?spot=home",
      });
      // An evening is said the evening before: a browser that is off until the morning is not
      // told it.
      expect(sent?.keepSeconds).toBe(4 * 60 * 60);
    });

    it("is not sent the morning after, when quiet hours kept it past midnight", async () => {
      await evening({ quietFrom: 19 * 60, quietTo: 7 * 60 });
      expect(await pass()).toMatchObject({ evenings: 1, pushes: 0 });
      // Worth sending until the day it lists begins.
      expect((await deliveries())[0]).toMatchObject({ expiresAt: new Date(SATURDAY) });

      for (let look = 0; look < 3; look += 1) await next();
      vi.setSystemTime(new Date(SATURDAY + 7 * HOUR_MS));
      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(await states()).toEqual([["evening", "expired"]]);
      expect(service.asked()).toEqual([]);
    });

    it("is not sent by an account that switched it off, or whose next day is another by then", async () => {
      await evening({ quietFrom: 19 * 60, quietTo: 21 * 60 });
      await pass();
      await settings({ onEvening: false });
      vi.setSystemTime(new Date("2026-10-09T21:00:00Z"));
      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(await states()).toEqual([["evening", "expired"]]);

      // And one that moved east, where it is already Saturday.
      await database.db.delete(notification);
      await settings({ onEvening: true, eveningUntil: null, quietFrom: 19 * 60, quietTo: 21 * 60 });
      vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
      await pass();
      expect(await states()).toEqual([["evening", "pending"]]);
      await settings({ zone: "Pacific/Auckland", quietFrom: null, quietTo: null });
      expect(await pass()).toMatchObject({ pushes: 0 });
      expect((await states()).filter(([, state]) => state === "sent")).toEqual([]);
    });
  });

  describe("between the moment they are written and the moment they are handed over", () => {
    // The first step alone: the push is written, and marked as leaving.
    const written = async () => {
      const [due] = await database.db.select().from(notificationDelivery);
      const taken = await take(database.db, out, due?.notificationId ?? "");
      if (typeof taken === "string") throw new Error(`not taken: ${taken}`);
      return { id: due?.notificationId ?? "", taken };
    };

    it("are put back whole when a setting changed, and say what stands under it", async () => {
      await found();
      const { id, taken } = await written();
      // It is leaving, and nothing is told yet.
      expect(await states()).toEqual([["found", "sending"]]);
      expect(await pushedAt()).toEqual([]);

      // The account switches "found" off, and is answered.
      await settings({ onFound: false });
      expect(await hand(database.db, out, id, taken)).toBe("skipped");
      expect(service.asked()).toEqual([]);
      expect(await states()).toEqual([["found", "pending"]]);
      expect(await pushedAt()).toEqual([]);

      // Read again, it has nothing to say to an account that is told no new hours.
      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(await states()).toEqual([["found", "expired"]]);
    });

    it("are put back whole when a look changed the hours, and say where they are", async () => {
      await found();
      const { id, taken } = await written();
      kept.provider.waves = swellBetween(13, 17);
      await next();

      expect(await hand(database.db, out, id, taken)).toBe("skipped");
      expect(service.asked()).toEqual([]);
      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 13:00 to 17:00\n");
      expect(pushes()[0]?.body).not.toContain("08:00");
    });

    it("are put back whole when what push told at the spot changed, as a look that cuts it again does", async () => {
      await found();
      const { id, taken } = await written();
      await database.db
        .update(alertSpot)
        .set({ pushed: [{ start: hour(9), end: hour(12), missed: 0 }] });

      expect(await hand(database.db, out, id, taken)).toBe("skipped");
      expect(service.asked()).toEqual([]);
      expect(await states()).toEqual([["found", "pending"]]);
    });

    it("are handed over whatever mail told meanwhile: a mail that left changes nothing of a push", async () => {
      await found();
      const { id, taken } = await written();
      await database.db.update(alertSpot).set({
        mailed: [{ start: hour(8), end: hour(12), missed: 0 }],
        mailBegun: [{ start: hour(8), end: hour(12) }],
      });

      expect(await hand(database.db, out, id, taken)).toBe("sent");
      expect(service.sent()).toHaveLength(1);
    });

    it("wait for the end of quiet hours that began between the two", async () => {
      // Quiet from 11:21, a minute after the look that found the window.
      await settings({ quietFrom: 11 * 60 + 21, quietTo: 13 * 60 });
      await found();
      const { id, taken } = await written();
      expect(await states()).toEqual([["found", "sending"]]);

      vi.setSystemTime(new Date("2026-10-09T11:21:30Z"));
      expect(await hand(database.db, out, id, taken)).toBe("skipped");
      expect(service.asked()).toEqual([]);
      expect(await pushedAt()).toEqual([]);
      expect(await deliveries()).toMatchObject([
        { state: "pending", dueAt: new Date("2026-10-09T13:00:00Z") },
      ]);

      vi.setSystemTime(new Date("2026-10-09T13:00:00Z"));
      expect(await pass()).toMatchObject({ pushes: 1 });
    });

    it("are handed over when nothing changed", async () => {
      await found();
      const { id, taken } = await written();

      expect(await hand(database.db, out, id, taken)).toBe("sent");
      expect(service.sent()).toHaveLength(1);
      expect(await states()).toEqual([["found", "sent"]]);
      // What it told is told once it has left.
      expect(await pushedAt()).toEqual([hour(8)]);
    });

    it("are given up when the account's browser was forgotten between the two", async () => {
      await found();
      const { id, taken } = await written();
      await database.db.delete(pushSubscription);

      expect(await hand(database.db, out, id, taken)).toBe("expired");
      expect(service.asked()).toEqual([]);
      // Nothing was told: a browser that subscribes again is told these hours as new ones.
      expect(await pushedAt()).toEqual([]);
      await subscribe("phone-again");
      kept.provider.waves = swellBetween(13, 17);
      await next();
      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(pushes()[0]?.title).toBe("The bay: a window is taking shape");
    });

    it("go to a browser that subscribed between the two, and to none that was removed", async () => {
      const laptop = await subscribe("laptop");
      await found();
      const { id, taken } = await written();
      // The laptop is removed from the settings, and a tablet switches push on.
      await database.db.delete(pushSubscription).where(eq(pushSubscription.id, "laptop"));
      const tablet = await subscribe("tablet");

      expect(await hand(database.db, out, id, taken)).toBe("sent");
      expect(service.asked().map((asked) => asked.endpoint)).not.toContain(laptop);
      expect(
        service
          .sent()
          .map((sent) => sent.endpoint)
          .sort(),
      ).toEqual([phone, tablet].sort());
    });

    it("are given up, for an evening, once the day it lists has begun", async () => {
      await settings({ onFound: false, onEvening: true, eveningMinutes: 20 * 60 });
      await found();
      // Looked at until 23:20, and told at 23:59, a minute before the day it lists.
      for (let look = 0; look < 4; look += 1) await next();
      vi.setSystemTime(new Date("2026-10-09T23:59:00Z"));
      expect(await pass(null)).toMatchObject({ evenings: 1 });
      const { id, taken } = await written();

      vi.setSystemTime(new Date(SATURDAY + 60 * 1000));
      expect(await hand(database.db, out, id, taken)).toBe("expired");
      expect(service.asked()).toEqual([]);
    });

    it("are not handed to a way out they were not written for", async () => {
      await found();
      const { id, taken } = await written();
      const post = testMailer();
      const mail = {
        mailer: post.mailer,
        webOrigin: "https://app.example.org",
        apiOrigin: "https://api.example.org",
        dailyLimit: 200,
      };

      expect(await hand(database.db, mail, id, taken)).toBe("skipped");
      expect(post.sent()).toEqual([]);
      expect(service.asked()).toEqual([]);
      expect(await pushedAt()).toEqual([]);
    });
  });

  it("say later what a spot that could not be read has to say, after the others", async () => {
    // Two spots of one alert, told at the same looks.
    await database.db
      .insert(spot)
      .values({ id: "away", userId: "owner", name: "Away", latitude: 43.6, longitude: -1.47 });
    await database.db.insert(alertSpot).values({ spotId: "away", alertId: "bay", position: 1 });
    await found();
    // The look at one of them is too old to be believed.
    await database.db
      .update(alertSpot)
      .set({ lookedAt: new Date(Date.now() - 7 * HOUR_MS) })
      .where(eq(alertSpot.spotId, "away"));

    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 08:00 to 12:00\n");
    expect(pushes()[0]?.body).not.toContain("Away");
    expect(await states()).toEqual([["found", "pending"]]);

    // It is read again, and says the rest.
    await database.db.update(alertSpot).set({ lookedAt: new Date() });
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[1]?.body).toContain("Away: Sat 10 Oct, 08:00 to 12:00\n");
    expect(pushes()[1]?.body).not.toContain("Home");
    // With nothing left to say, it has been sent.
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "sent"]]);
  });

  it("say later what a spot that could not be read has to say, when the push service refused the others", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await database.db
      .insert(spot)
      .values({ id: "away", userId: "owner", name: "Away", latitude: 43.6, longitude: -1.47 });
    await database.db.insert(alertSpot).values({ spotId: "away", alertId: "bay", position: 1 });
    await found();
    await database.db
      .update(alertSpot)
      .set({ lookedAt: new Date(Date.now() - 7 * HOUR_MS) })
      .where(eq(alertSpot.spotId, "away"));
    service.answers.set(phone, 500);

    expect(await pass()).toMatchObject({ pushes: 0, failed: 1 });
    expect(await states()).toEqual([["found", "pending"]]);

    // What was refused is not said again, and the spot that waited is.
    service.answers.delete(phone);
    await database.db.update(alertSpot).set({ lookedAt: new Date() });
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[0]?.body).toContain("Away: Sat 10 Oct, 08:00 to 12:00\n");
    expect(pushes()[0]?.body).not.toContain("Home");
  });

  it("leave at the pass that wrote them, when another spot of the alert had hours of its own to forget", async () => {
    await database.db
      .insert(spot)
      .values({ id: "away", userId: "owner", name: "Away", latitude: 43.6, longitude: -1.47 });
    await database.db.insert(alertSpot).values({ spotId: "away", alertId: "bay", position: 1 });
    await found();
    // Push told one of them these hours already, with others that are over since: it has
    // nothing to say of that spot, and something to forget there.
    await database.db
      .update(alertSpot)
      .set({
        pushed: [
          { start: hour(-20), end: hour(-18), missed: 0 },
          { start: hour(8), end: hour(12), missed: 0 },
        ],
      })
      .where(eq(alertSpot.spotId, "away"));

    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 08:00 to 12:00\n");
    expect(pushes()[0]?.body).not.toContain("Away");
    const [away] = await database.db.select().from(alertSpot).where(eq(alertSpot.spotId, "away"));
    expect(away?.pushed.map((piece) => piece.start)).toEqual([hour(8)]);
  });

  it("follow the quiet hours as they are when they leave, not as they were", async () => {
    await found();
    // Due at once, and the account then asks for quiet until 13:00.
    await settings({ quietFrom: 10 * 60, quietTo: 13 * 60 });
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect((await deliveries())[0]).toMatchObject({
      state: "pending",
      dueAt: new Date("2026-10-09T13:00:00Z"),
    });

    vi.setSystemTime(new Date("2026-10-09T13:00:00Z"));
    expect(await pass()).toMatchObject({ pushes: 1 });
  });

  it("are written in the account's time zone as it is when they leave", async () => {
    await found();
    await settings({ zone: "Europe/Paris" });
    // The hours were cut on another clock: the push waits for a look that cuts them on this one.
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([["found", "pending"]]);

    await next();
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 10:00 to 14:00\n");
  });

  it("are not sent again, nor is what they said, when the worker stopped as one was leaving", async () => {
    // Two that wait together, of one alert.
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    kept.provider.waves = swellBetween(13, 17);
    await next();
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    let stops = true;
    const stopping = {
      ...out,
      web: {
        // The push service takes the first, and the worker stops before it can write so.
        send: async (...given: Parameters<typeof service.pusher.send>) => {
          const outcome = await service.pusher.send(...given);
          if (!stops) return outcome;
          stops = false;
          throw new Error("The worker stopped");
        },
      },
    };

    expect(await pass(stopping)).toMatchObject({ pushes: 0, failed: 1 });
    // It left, and nobody knows: it is kept as on its way, with what it tells. The other push
    // of the alert waits, since what it says depends on that.
    expect(service.sent()).toHaveLength(1);
    expect(await states()).toEqual([
      ["found", "sending"],
      ["moved", "pending"],
    ]);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(await pass()).toMatchObject({ pushes: 0, failed: 0 });
    expect(await states()).toEqual([
      ["found", "sending"],
      ["moved", "pending"],
    ]);

    // Long enough after, it is known to have been left behind: what it told is taken as told,
    // and the other has nothing left to say.
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ pushes: 0, failed: 0 });
    expect(await states()).toEqual([
      ["found", "sending"],
      ["moved", "expired"],
    ]);
    expect(service.sent()).toHaveLength(1);
    expect(await pushedAt()).toEqual([hour(13)]);
  });

  it("let go of the account only once every browser has answered, when one of them fails as none should", async () => {
    await subscribe("laptop");
    await found();
    let answered = 0;
    const failing = {
      ...out,
      web: {
        // The first fails at once, as a pusher never does. The other takes its time.
        send: async (...given: Parameters<typeof service.pusher.send>) => {
          if (given[0].endpoint === phone) throw new Error("A fault of the program");
          await new Promise((resolve) => setTimeout(resolve, 200));
          answered += 1;
          return service.pusher.send(...given);
        },
      },
    };

    expect(await pass(failing)).toMatchObject({ pushes: 0, failed: 1 });
    // Nothing is left to send once the pass has ended, and the account's settings are free.
    expect(answered).toBe(1);
    expect(await states()).toEqual([["found", "sending"]]);
  });

  it("make a browser that is forgotten wait for the push that is leaving to it", async () => {
    await found();
    let release = () => {};
    const leaving = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = () => {};
    const taken = new Promise<void>((resolve) => {
      entered = resolve;
    });
    // A push service that takes its time to answer.
    service.answers.set(phone, async () => {
      entered();
      await leaving;
      return { status: 201 };
    });

    const passing = pass();
    await taken;
    let forgotten = false;
    const forget = database.db
      .delete(pushSubscription)
      .where(eq(pushSubscription.endpoint, phone))
      .then(() => {
        forgotten = true;
      });
    // The clock of the test is held, and timers are not: the removal has time to pass if it can.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(forgotten).toBe(false);

    release();
    expect(await passing).toMatchObject({ pushes: 1 });
    await forget;
    expect(forgotten).toBe(true);
    // Once it is answered, nothing leaves to that browser.
    service.answers.delete(phone);
    kept.provider.waves = swellBetween(13, 17);
    await next();
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(service.asked()).toHaveLength(1);
  });

  it("make an account that changes its settings wait for the push that is leaving", async () => {
    await found();
    let release = () => {};
    const leaving = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = () => {};
    const taken = new Promise<void>((resolve) => {
      entered = resolve;
    });
    service.answers.set(phone, async () => {
      entered();
      await leaving;
      return { status: 201 };
    });

    const passing = pass();
    await taken;
    let changed = false;
    const change = settings({ onFound: false }).then(() => {
      changed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(changed).toBe(false);

    release();
    expect(await passing).toMatchObject({ pushes: 1 });
    await change;
    expect(changed).toBe(true);
  });

  it("stop at the account's pushes for the day, and say later what a push held back had to say", async () => {
    // All of the account's pushes for the day but one have left.
    for (let index = 1; index < ACCOUNT_DAILY_PUSHES; index += 1) {
      await countCalls(database.db, [
        {
          provider: `${ALERT_PUSH_PROVIDER}:owner`,
          bucket: "day",
          span: "day",
          limit: ACCOUNT_DAILY_PUSHES,
        },
      ]);
    }
    // Two browsers, and one push of the day: a push is counted once, whatever it goes to.
    await subscribe("laptop");
    await found();
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(service.sent()).toHaveLength(2);
    kept.provider.waves = swellBetween(11, 15);
    await next();

    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(await states()).toEqual([
      ["found", "sent"],
      ["moved", "held"],
    ]);
    // What was held back is not tried again.
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(service.sent()).toHaveLength(2);

    // Another day: the alert's next push says where the hours are, against what push told.
    await database.db.delete(providerCalls);
    kept.provider.waves = swellBetween(14, 18);
    await next();
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[2]?.body).toContain(
      "Home: Moved: Sat 10 Oct, 14:00 to 18:00 (it was Sat 10 Oct, 08:00 to 12:00)\n",
    );
  });

  it("stop at 24 pushes a day for an account, whatever its mails are", async () => {
    expect(ACCOUNT_DAILY_PUSHES).toBe(24);
    // Twenty-four notifications of the day, each with something new to say.
    const { db } = database;
    await found();
    const [made] = await db.select().from(notification);
    const [due] = await db.select().from(notificationDelivery);
    if (!made || !due) throw new Error("no notification");
    let sent = 0;
    for (let index = 0; index < ACCOUNT_DAILY_PUSHES + 1; index += 1) {
      // What push told is forgotten each time, so that each has the morning to say.
      await db.update(alertSpot).set({ pushed: [] });
      await db.delete(notificationDelivery);
      await db.insert(notificationDelivery).values({ ...due, state: "pending" });
      sent += (await pass()).pushes;
    }

    expect(sent).toBe(ACCOUNT_DAILY_PUSHES);
    expect(await states()).toEqual([["found", "held"]]);
    // Its mails are counted apart: none was sent, and none of its day is spent.
    const counted = await db.select().from(providerCalls);
    expect(counted.map((row) => [row.provider, row.calls])).toEqual([
      [`${ALERT_PUSH_PROVIDER}:owner`, ACCOUNT_DAILY_PUSHES],
    ]);
  });

  it("are not tried again when the browser's push service refuses them, and nothing was told", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await found();
    service.answers.set(phone, 403);

    expect(await pass()).toMatchObject({ pushes: 0, failed: 1 });
    expect(await states()).toEqual([["found", "failed"]]);
    // A browser that refuses is not one that is gone: its subscription stays.
    expect(await devices()).toEqual(["phone"]);
    // It did not leave: what it had to say is not said to have been told.
    expect(await pushedAt()).toEqual([]);
    service.answers.delete(phone);
    expect(await pass()).toMatchObject({ pushes: 0 });
    expect(service.sent()).toEqual([]);
    // The log says how it failed, and nothing of the address or of the alert.
    const said = logged.mock.calls.flat().join(" ");
    expect(said).toContain("push: not taken (status 403)");
    expect(said).not.toContain("invented");
    expect(said).not.toContain("Home");

    // The alert's next push says it: hours that push never told, where they are then.
    kept.provider.waves = swellBetween(13, 17);
    await next();
    expect(await pass()).toMatchObject({ pushes: 1 });
    expect(pushes()[0]).toMatchObject({
      title: "The bay: a window is taking shape",
      body: expect.stringContaining("Home: Sat 10 Oct, 13:00 to 17:00\n"),
    });
  });

  it("are not tried again when the push service does not answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await found();
    service.answers.set(phone, async () => ({ failure: "ETIMEDOUT" }));

    expect(await pass()).toMatchObject({ pushes: 0, failed: 1 });
    expect(await states()).toEqual([["found", "failed"]]);
    // It may have left all the same: what it told is told.
    expect(await pushedAt()).toEqual([hour(8)]);
    expect(await devices()).toEqual(["phone"]);
  });

  it("stay where they are on an instance whose worker has no keys, until they are over", async () => {
    await found();
    expect(await pass(null)).toMatchObject({ pushes: 0, failed: 0 });
    expect(await states()).toEqual([["found", "pending"]]);

    vi.setSystemTime(new Date(SATURDAY + 13 * HOUR_MS));
    await pass(null);
    expect(await states()).toEqual([["found", "expired"]]);
  });

  it("keep no mail waiting, however many of them a pass hands over", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const post = testMailer();
    const mail = {
      mailer: post.mailer,
      webOrigin: "https://app.example.org",
      apiOrigin: "https://api.example.org",
      dailyLimit: 200,
    };
    const { db } = database;
    // The owner is told by mail alone.
    await db.delete(pushSubscription);
    await db.update(user).set({ emailVerified: true });
    await settings({ byMail: true, mailKey: "the-key" });
    // Three other accounts, each with an alert on a spot and a browser whose push service
    // says no: nothing is told, so that each of their pushes has the same hours to say.
    const others = ["one", "two", "three"];
    for (const id of others) {
      await db.insert(user).values({ id, name: id, email: `${id}@example.org` });
      await db.insert(alertSettings).values({
        userId: id,
        daylightOnly: false,
        quietFrom: null,
        quietTo: null,
        onEvening: false,
        onBegin: false,
      });
      await db.insert(spot).values({
        id: `spot-${id}`,
        userId: id,
        name: id,
        latitude: 43.63,
        longitude: -1.46,
      });
      await db.insert(alert).values({
        id: `alert-${id}`,
        userId: id,
        name: id,
        criteria: { waveHeightMeters: { min: 1 } },
      });
      await db
        .insert(alertSpot)
        .values({ spotId: `spot-${id}`, alertId: `alert-${id}`, position: 0 });
      service.answers.set(await subscribe(`browser-${id}`, id), 403);
    }
    await found();
    // Each has a day's pushes that waited since before the owner's mail was written.
    const earlier = new Date(Date.now() - HOUR_MS);
    for (const id of others) {
      const [made] = await db.select().from(notification).where(eq(notification.userId, id));
      if (!made) throw new Error("no notification");
      const copies = Array.from({ length: ACCOUNT_DAILY_PUSHES }, (_, index) => `${id}-${index}`);
      await db
        .insert(notification)
        .values(copies.map((copy) => ({ ...made, id: copy, key: copy })));
      await db.insert(notificationDelivery).values(
        copies.map((notificationId) => ({
          notificationId,
          channel: "push" as const,
          dueAt: earlier,
          expiresAt: new Date(SATURDAY + 12 * HOUR_MS),
        })),
      );
    }

    // As many pushes as a run may hand over were, and the mail left at that pass all the same.
    expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 0, failed: 60 });
    expect(post.sent()).toHaveLength(1);
    expect(service.asked()).toHaveLength(60);
  });

  it("do not stand before the mails, however many wait on an instance that has no keys", async () => {
    // An account with a browser and with mail, on an instance whose worker sends mail alone.
    const post = testMailer();
    const mail = {
      mailer: post.mailer,
      webOrigin: "https://app.example.org",
      apiOrigin: "https://api.example.org",
      dailyLimit: 200,
    };
    const { db } = database;
    await db.update(user).set({ emailVerified: true });
    await settings({ byMail: true, mailKey: "the-key" });
    // Sixty-five pushes that nothing can send, all due before the mail.
    const earlier = new Date(AT.getTime() - HOUR_MS);
    const waiting = Array.from({ length: 65 }, (_, index) => `waiting-${index}`);
    await db.insert(notification).values(
      waiting.map((id) => ({
        id,
        userId: "owner",
        alertId: "bay",
        moment: "found" as const,
        key: id,
        payload: { alertName: "The bay", zone: "UTC", lines: [] },
      })),
    );
    await db.insert(notificationDelivery).values(
      waiting.map((notificationId) => ({
        notificationId,
        channel: "push" as const,
        dueAt: earlier,
        expiresAt: new Date(SATURDAY + 24 * HOUR_MS),
      })),
    );
    await found();

    expect(await pass(null, mail)).toMatchObject({ mails: 1, pushes: 0, failed: 0 });
    expect(post.sent()).toHaveLength(1);
    // What waits by push stays where it is, until its hours are over.
    expect((await states()).filter(([, state]) => state === "pending")).toHaveLength(66);
  });

  describe("to browsers whose push service says what became of them", () => {
    it("are sent when one browser of two took them, and the one that is gone is forgotten", async () => {
      const laptop = await subscribe("laptop");
      await found();
      // The laptop's subscription is no more: its push service says so.
      service.answers.set(laptop, 410);

      expect(await pass()).toMatchObject({ pushes: 1, failed: 0 });
      expect(await states()).toEqual([["found", "sent"]]);
      expect(service.sent().map((sent) => sent.endpoint)).toEqual([phone]);
      expect(await devices()).toEqual(["phone"]);
      expect(await pushedAt()).toEqual([hour(8)]);

      // The next push goes to the browser that is left, and asks nothing of the other.
      kept.provider.waves = swellBetween(13, 17);
      await next();
      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(service.asked().filter((asked) => asked.endpoint === laptop)).toHaveLength(1);
    });

    it("are given up when every browser is gone, with nothing told, and the account has none left", async () => {
      const laptop = await subscribe("laptop");
      await found();
      service.answers.set(phone, 404);
      service.answers.set(laptop, 410);

      // No failure of the instance: the subscriptions ended.
      expect(await pass()).toMatchObject({ pushes: 0, failed: 0 });
      expect(await states()).toEqual([["found", "expired"]]);
      expect(await devices()).toEqual([]);
      expect(await pushedAt()).toEqual([]);

      // No push is made for an account that has no browser left.
      kept.provider.waves = swellBetween(13, 17);
      await next();
      expect(await states()).toEqual([["found", "expired"]]);
      // A browser that subscribes again is told the hours as they are, as new ones: push
      // never told them, whatever the list says has moved.
      const again = await subscribe("phone-again");
      kept.provider.waves = swellBetween(16, 20);
      await next();
      expect(await states()).toEqual([
        ["found", "expired"],
        ["moved", "pending"],
      ]);
      expect(await pass()).toMatchObject({ pushes: 1 });
      expect(service.sent()).toMatchObject([
        { endpoint: again, push: { title: "The bay: a window is taking shape" } },
      ]);
      expect(pushes()[0]?.body).toContain("Home: Sat 10 Oct, 16:00 to 20:00\n");
    });

    it("are sent when one browser took them, whatever another refused", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const laptop = await subscribe("laptop");
      await found();
      service.answers.set(laptop, 403);

      expect(await pass()).toMatchObject({ pushes: 1, failed: 0 });
      expect(await states()).toEqual([["found", "sent"]]);
      // A browser that refuses keeps its subscription.
      expect(await devices()).toEqual(["laptop", "phone"]);
    });

    it("failed when one browser is gone and the other's push service failed: told, since it may have left", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const laptop = await subscribe("laptop");
      await found();
      service.answers.set(phone, 410);
      service.answers.set(laptop, 500);

      expect(await pass()).toMatchObject({ pushes: 0, failed: 1 });
      expect(await states()).toEqual([["found", "failed"]]);
      // The one that is gone is forgotten, and the other stays.
      expect(await devices()).toEqual(["laptop"]);
      expect(await pushedAt()).toEqual([hour(8)]);
    });

    it("failed with nothing told when one browser is gone and the other refused: it did not leave", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const laptop = await subscribe("laptop");
      await found();
      service.answers.set(phone, 410);
      service.answers.set(laptop, 400);

      expect(await pass()).toMatchObject({ pushes: 0, failed: 1 });
      expect(await states()).toEqual([["found", "failed"]]);
      expect(await devices()).toEqual(["laptop"]);
      expect(await pushedAt()).toEqual([]);
    });

    it("told when one push service refused and another did not answer: nobody knows", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const laptop = await subscribe("laptop");
      await found();
      service.answers.set(phone, 403);
      service.answers.set(laptop, async () => ({ failure: "ETIMEDOUT" }));

      expect(await pass()).toMatchObject({ pushes: 0, failed: 1 });
      expect(await states()).toEqual([["found", "failed"]]);
      expect(await pushedAt()).toEqual([hour(8)]);
      expect(await devices()).toEqual(["laptop", "phone"]);
    });
  });

  it("fit one push when the alert is too long for one, and say how many more spots there are", async () => {
    // Twelve spots of names as long as they come, all told at the same look.
    const { db } = database;
    const long = (index: number) => `${index} ${"🌊 plage du grand large ".repeat(8)}`;
    await db.update(alert).set({ name: "Tout le littoral, de la pointe au phare ".repeat(2) });
    await db.update(spot).set({ name: long(0) });
    for (let index = 1; index < 12; index += 1) {
      await db.insert(spot).values({
        id: `spot-${index}`,
        userId: "owner",
        name: long(index),
        latitude: 43.63,
        longitude: -1.46,
      });
      await db
        .insert(alertSpot)
        .values({ spotId: `spot-${index}`, alertId: "bay", position: index });
    }
    await found();

    expect(await pass()).toMatchObject({ pushes: 1, failed: 0 });
    const [push] = pushes();
    if (!push) throw new Error("no push");
    expect(Buffer.byteLength(JSON.stringify(push))).toBeLessThan(PUSH_BYTES);
    expect(push.title).toMatch(/^Tout le littoral.*…: a window is taking shape$/);
    const rows = push.body.split("\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^0 🌊 plage du grand large.*…: Sat 10 Oct, 08:00 to 12:00$/u);
    expect(rows[1]).toMatch(/^1 🌊 plage du grand large.*…: Sat 10 Oct, 08:00 to 12:00$/u);
    expect(rows[2]).toBe("and 10 more");
    // Several spots: it opens what the alerts told.
    expect(push.url).toBe("https://app.example.org/app?panel=alerts");
    expect(readAppLink(push.url, out.webOrigin)).toEqual({
      screen: "map",
      search: { panel: "alerts" },
    });
    // What push told is kept for all twelve.
    const links = await db.select().from(alertSpot);
    expect(links.filter((link) => link.pushed.length === 1)).toHaveLength(12);
  });

  describe("are shown under the name of their window, so that the newest word takes the place of the others", () => {
    it("whatever the window became: moved, moved again, then gone", async () => {
      await found();
      await pass();
      for (const [from, to] of [
        [13, 17],
        [18, 22],
      ] as const) {
        kept.provider.waves = swellBetween(from, to);
        await next();
        await pass();
      }
      kept.provider.waves = () => 0.2;
      await next();
      await next();
      await pass();

      expect(pushes().map((push) => push.title)).toEqual([
        "The bay: a window is taking shape",
        "The bay: the window has moved",
        "The bay: the window has moved",
        "The bay: the window is no longer forecast",
      ]);
      expect(pushes()[2]?.body).toContain(
        "Moved: Sat 10 Oct, 18:00 to 22:00 (it was Sat 10 Oct, 13:00",
      );
      // One tag for all four: the last is what a screen shows of the window.
      expect(new Set(pushes().map((push) => push.tag)).size).toBe(1);
    });

    it("and when it begins, wherever it moved meanwhile", async () => {
      await settings({ onBegin: true, noticeMinutes: 30 });
      await found();
      await pass();
      kept.provider.waves = swellBetween(13, 17);
      await next();
      await pass();
      // Looked at until Saturday, 11:20.
      for (let look = 0; look < 7; look += 1) await next();
      vi.setSystemTime(new Date(SATURDAY + 12.5 * HOUR_MS));

      expect(await pass()).toMatchObject({ begins: 1, pushes: 1 });
      expect(pushes().map((push) => push.title)).toEqual([
        "The bay: a window is taking shape",
        "The bay: the window has moved",
        "The bay: it is on",
      ]);
      expect(new Set(pushes().map((push) => push.tag)).size).toBe(1);
    });

    it("and when it moved without a word, for an account that switched changes off", async () => {
      await settings({ onBegin: true, noticeMinutes: 30 });
      await found();
      await pass();
      // The look follows the window to where it is, and says nothing of it.
      await settings({ onChange: false });
      kept.provider.waves = swellBetween(11, 15);
      for (let look = 0; look < 7; look += 1) await next();
      expect(await database.db.select().from(alertSpot)).toMatchObject([
        { pushed: [{ start: hour(11), end: hour(15), since: hour(8) }] },
      ]);
      vi.setSystemTime(new Date(SATURDAY + 10.5 * HOUR_MS));

      expect(await pass()).toMatchObject({ begins: 1, pushes: 1 });
      expect(pushes().map((push) => push.title)).toEqual([
        "The bay: a window is taking shape",
        "The bay: it is on",
      ]);
      expect(pushes()[1]?.tag).toBe(pushes()[0]?.tag);
    });

    it("and when it moved without a word to hours that are nowhere near those it was told at", async () => {
      await settings({ onBegin: true, noticeMinutes: 30 });
      await found();
      await pass();
      await settings({ onChange: false });
      kept.provider.waves = swellBetween(13, 17);
      for (let look = 0; look < 8; look += 1) await next();
      expect(await database.db.select().from(alertSpot)).toMatchObject([
        { pushed: [{ start: hour(13), end: hour(17), since: hour(8) }] },
      ]);
      vi.setSystemTime(new Date(SATURDAY + 12.5 * HOUR_MS));

      expect(await pass()).toMatchObject({ begins: 1, pushes: 1 });
      expect(pushes()[1]).toMatchObject({ title: "The bay: it is on", tag: pushes()[0]?.tag });
    });

    it("and when a change of the account's hours cut it shorter", async () => {
      // The sea works from 08:00 to 17:00, and the account goes at any hour.
      const week = Array.from({ length: 7 }, (_, day) =>
        day === 5 ? [{ from: 13 * 60, to: 17 * 60 }] : [{ from: 0, to: 24 * 60 }],
      );
      kept.provider.waves = swellBetween(8, 17);
      await settings({ onBegin: true, noticeMinutes: 30 });
      await found();
      await pass();
      // It now goes on Saturday afternoons alone: what push told is cut as the hours are.
      await settings({ week });
      for (let look = 0; look < 8; look += 1) await next();
      expect(await database.db.select().from(alertSpot)).toMatchObject([
        { pushed: [{ start: hour(13), end: hour(17), since: hour(8) }] },
      ]);
      vi.setSystemTime(new Date(SATURDAY + 12.5 * HOUR_MS));

      expect(await pass()).toMatchObject({ begins: 1, pushes: 1 });
      expect(pushes()[1]).toMatchObject({ title: "The bay: it is on", tag: pushes()[0]?.tag });
    });

    it("and beside what was said of other hours of the spot, which it does not replace", async () => {
      // Saturday morning, then Sunday morning two looks later.
      await found();
      await pass();
      kept.provider.waves = (seconds) =>
        Math.max(swellBetween(8, 12)(seconds), swellBetween(32, 36)(seconds));
      await next();
      await next();
      await pass();
      // Sunday's moves: said under Sunday's name, and Saturday's stays where it is.
      kept.provider.waves = (seconds) =>
        Math.max(swellBetween(8, 12)(seconds), swellBetween(35, 39)(seconds));
      await next();
      await pass();

      const [saturday, sunday, moved] = pushes();
      expect(moved?.body).toContain("Moved: Sun 11 Oct, 11:00 to 15:00");
      expect(sunday?.tag).not.toBe(saturday?.tag);
      expect(moved?.tag).toBe(sunday?.tag);
    });
  });

  describe("beside the mail of the same notification", () => {
    let post: ReturnType<typeof testMailer>;
    let mail: MailOut;
    beforeEach(async () => {
      post = testMailer();
      mail = {
        mailer: post.mailer,
        webOrigin: "https://app.example.org",
        apiOrigin: "https://api.example.org",
        dailyLimit: 200,
      };
      // An account that said yes to mail, with a checked address, and has a browser too.
      await database.db.update(user).set({ emailVerified: true });
      await settings({ byMail: true, mailKey: "the-key" });
    });
    const told = async () => {
      const [link] = await database.db.select().from(alertSpot);
      return {
        mailed: link?.mailed.map((piece) => piece.start),
        pushed: link?.pushed.map((piece) => piece.start),
      };
    };

    it("leave both, each once, and each keeps what it told", async () => {
      await found();
      expect(await states("mail")).toEqual([["found", "pending"]]);
      expect(await states("push")).toEqual([["found", "pending"]]);

      expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 1, failed: 0 });
      expect(post.sent()).toHaveLength(1);
      expect(service.sent()).toHaveLength(1);
      expect(await told()).toEqual({ mailed: [hour(8)], pushed: [hour(8)] });
      expect(await pass(out, mail)).toMatchObject({ mails: 0, pushes: 0 });
    });

    it("leave the push when the mail's provider refuses, and the mail when the push service does", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await found();
      const refusing = testMailer({ failing: true });

      expect(await pass(out, { ...mail, mailer: refusing.mailer })).toMatchObject({
        mails: 0,
        pushes: 1,
        failed: 1,
      });
      expect(await states("mail")).toEqual([["found", "failed"]]);
      expect(await states("push")).toEqual([["found", "sent"]]);

      // The other way round, at the alert's next word.
      kept.provider.waves = swellBetween(13, 17);
      await next();
      service.answers.set(phone, 500);
      expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 0, failed: 1 });
      expect(post.sent()[0]?.subject).toBe("The bay: the window has moved");
    });

    it("do not wait for one another: a mail left behind by a stopped worker does not hold the push", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await found();
      // The worker stops as the mail is handed over: its claim stays, and nobody knows.
      const stopping = {
        ...mail,
        mailer: {
          send: async () => {
            throw new Error("The worker stopped");
          },
        } as unknown as MailOut["mailer"],
      };

      expect(await pass(out, stopping)).toMatchObject({ mails: 0, pushes: 1, failed: 1 });
      expect(await states("mail")).toEqual([["found", "sending"]]);
      expect(await states("push")).toEqual([["found", "sent"]]);
      // What push told is told, and what mail told is not yet: each keeps its own.
      expect(await told()).toEqual({ mailed: [], pushed: [hour(8)] });

      // The mail's claim is taken as told ten minutes later, and changes nothing of the push.
      vi.advanceTimersByTime(20 * 60 * 1000);
      await database.db
        .update(notificationDelivery)
        .set({ state: "pending", dueAt: new Date() })
        .where(eq(notificationDelivery.channel, "push"));
      expect(await pass(out, mail)).toMatchObject({ mails: 0, pushes: 0 });
      expect(await states("mail")).toEqual([["found", "sending"]]);
      expect(service.sent()).toHaveLength(1);
    });

    it("do not wait for one another: a push left behind by a stopped worker does not hold the mail", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await found();
      const stopping = {
        ...out,
        web: {
          send: async () => {
            throw new Error("The worker stopped");
          },
        },
      };

      expect(await pass(stopping, mail)).toMatchObject({ mails: 1, pushes: 0, failed: 1 });
      expect(await states("mail")).toEqual([["found", "sent"]]);
      expect(await states("push")).toEqual([["found", "sending"]]);
      expect(await told()).toEqual({ mailed: [hour(8)], pushed: [] });

      // Within ten minutes, another mail of the alert leaves, and another push waits.
      const [made] = await database.db.select().from(notification);
      if (!made) throw new Error("no notification");
      await database.db.update(alertSpot).set({ mailed: [] });
      await database.db.insert(notification).values({ ...made, id: "second", key: "second" });
      await database.db.insert(notificationDelivery).values(
        (["mail", "push"] as const).map((channel) => ({
          notificationId: "second",
          channel,
          dueAt: new Date(),
          expiresAt: new Date(SATURDAY + 12 * HOUR_MS),
        })),
      );
      vi.advanceTimersByTime(60 * 1000);
      expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 0, failed: 0 });
      expect((await states("push")).map(([, state]) => state).sort()).toEqual([
        "pending",
        "sending",
      ]);
      expect(service.sent()).toEqual([]);
    });

    it("say by each what it never told: a push of hours that mail told long before", async () => {
      // Mail alone at first: the browser subscribes after Saturday morning was mailed.
      await database.db.delete(pushSubscription);
      await found();
      expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 0 });
      await subscribe("phone-later");

      // The window moves: mail says that it moved, and push, which never told it, that it is.
      kept.provider.waves = swellBetween(13, 17);
      await next();
      expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 1 });
      expect(post.sent()[1]?.subject).toBe("The bay: the window has moved");
      expect(pushes()[0]).toMatchObject({
        title: "The bay: a window is taking shape",
        body: expect.stringContaining("Home: Sat 10 Oct, 13:00 to 17:00\n"),
      });
      expect(await told()).toEqual({ mailed: [hour(13)], pushed: [hour(13)] });
    });

    it("wait each for its own: a mail for a checked address, a push for nothing of the kind", async () => {
      await database.db.update(user).set({ emailVerified: false });
      await found();

      expect(await pass(out, mail)).toMatchObject({ mails: 0, pushes: 1 });
      expect(await states("mail")).toEqual([["found", "pending"]]);
      expect(await states("push")).toEqual([["found", "sent"]]);
    });

    it("stop each for its own: mail that is switched off goes on by push, and a browser forgotten by mail", async () => {
      await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
      await found();
      await settings({ byMail: false, mailKey: null, quietFrom: null, quietTo: null });
      vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));

      expect(await pass(out, mail)).toMatchObject({ mails: 0, pushes: 1 });
      expect(await states("mail")).toEqual([["found", "expired"]]);

      await settings({ byMail: true });
      await database.db.delete(pushSubscription);
      kept.provider.waves = swellBetween(13, 17);
      await next();
      expect(await states("push")).toEqual([["found", "sent"]]);
      expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 0 });
    });

    it("say that it is on by each, whatever the other has said to begin", async () => {
      await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
      await found();
      for (let look = 0; look < 6; look += 1) await next();
      vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));
      // The mail leaves first, on a pass whose worker has no keys.
      expect(await pass(null, mail)).toMatchObject({ begins: 1, mails: 1, pushes: 0 });
      expect(await database.db.select().from(alertSpot)).toMatchObject([
        { mailBegun: [{ start: hour(8), end: hour(12) }], pushBegun: [] },
      ]);

      // What mail said to begin is not said by push: the browser is told too, a moment later.
      vi.advanceTimersByTime(60 * 1000);
      expect(await pass(out, mail)).toMatchObject({ mails: 0, pushes: 1 });
      expect(pushes()[0]?.title).toBe("The bay: it is on");
      expect(await database.db.select().from(alertSpot)).toMatchObject([
        {
          mailBegun: [{ start: hour(8), end: hour(12) }],
          pushBegun: [{ start: hour(8), end: hour(12) }],
        },
      ]);
    });

    it("wait both for the end of quiet hours that began between their two steps", async () => {
      await settings({ quietFrom: 11 * 60 + 21, quietTo: 13 * 60 });
      await found();
      const due = await database.db.select().from(notificationDelivery);
      const id = due[0]?.notificationId ?? "";
      const byMail = await take(database.db, mail, id);
      const byPush = await take(database.db, out, id);
      if (typeof byMail === "string" || typeof byPush === "string") throw new Error("not taken");

      vi.setSystemTime(new Date("2026-10-09T11:21:30Z"));
      expect(await hand(database.db, mail, id, byMail)).toBe("skipped");
      expect(await hand(database.db, out, id, byPush)).toBe("skipped");
      expect(post.sent()).toEqual([]);
      expect(service.asked()).toEqual([]);
      expect(await told()).toEqual({ mailed: [], pushed: [] });
      for (const channel of ["mail", "push"] as const) {
        expect(await deliveries(channel)).toMatchObject([
          { state: "pending", dueAt: new Date("2026-10-09T13:00:00Z") },
        ]);
      }

      vi.setSystemTime(new Date("2026-10-09T13:00:00Z"));
      expect(await pass(out, mail)).toMatchObject({ mails: 1, pushes: 1 });
    });

    it("leave the mail at the pass that wrote it, when another spot had hours of its own to forget", async () => {
      await database.db
        .insert(spot)
        .values({ id: "away", userId: "owner", name: "Away", latitude: 43.6, longitude: -1.47 });
      await database.db.insert(alertSpot).values({ spotId: "away", alertId: "bay", position: 1 });
      await found();
      await database.db
        .update(alertSpot)
        .set({
          mailed: [
            { start: hour(-20), end: hour(-18), missed: 0 },
            { start: hour(8), end: hour(12), missed: 0 },
          ],
        })
        .where(eq(alertSpot.spotId, "away"));

      expect(await pass(null, mail)).toMatchObject({ mails: 1 });
      expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 12:00\n");
      expect(post.sent()[0]?.text).not.toContain("Away");
    });

    it("go to the end of what is being handed over when the other could not read what is due", async () => {
      await found();
      // A push service that takes a moment, and a database that fails the first time it is
      // asked what is due: by mail, whose turn begins first.
      service.answers.set(phone, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { status: 201 };
      });
      let asked = 0;
      const failing = new Proxy(database.db, {
        get(target, property) {
          const value: unknown = Reflect.get(target, property, target);
          if (property !== "select" || typeof value !== "function") return value;
          return (...given: unknown[]) => {
            asked += 1;
            if (asked === 1) throw new Error("The database is away");
            return Reflect.apply(value, target, given);
          };
        },
      });

      const told = await Effect.runPromise(
        Effect.result(sendDeliveries(failing, { mail, push: out })),
      );

      // The pass says that it failed, once the push that was leaving has left and is written.
      expect(told._tag).toBe("Failure");
      expect(service.sent()).toHaveLength(1);
      expect(await states("push")).toEqual([["found", "sent"]]);
      expect(await states("mail")).toEqual([["found", "pending"]]);
    });

    it("count each in its own day", async () => {
      await found();
      await pass(out, mail);

      const counted = await database.db.select().from(providerCalls);
      expect(counted.map((row) => [row.provider, row.calls]).sort()).toEqual([
        ["alert-mail", 1],
        ["alert-mail:owner", 1],
        ["alert-push:owner", 1],
        ["mail", 1],
      ]);
    });
  });

  describe("of a spot that is in two alerts", () => {
    beforeEach(async () => {
      await database.db.insert(alert).values({
        id: "big",
        userId: "owner",
        name: "Big days",
        criteria: { waveHeightMeters: { min: 2 } },
      });
      await database.db.insert(alertSpot).values({ spotId: "home", alertId: "big", position: 0 });
      // Small on Saturday morning, big in its afternoon.
      kept.provider.waves = (seconds) => {
        const at = (seconds * 1000 - SATURDAY) / HOUR_MS;
        return at >= 8 && at < 12 ? 1.2 : at >= 14 && at < 18 ? 2.5 : 0.2;
      };
    });
    const pushOf = (title: string) => pushes().find((push) => push.title === title);
    const pushedBy = async () =>
      (await database.db.select().from(alertSpot).orderBy(alertSpot.alertId)).map((row) => [
        row.alertId,
        row.pushed.map((piece) => piece.start),
      ]);

    it("leave apart, each under its alert's name with its hours, and each keeps what it told", async () => {
      await found();

      expect(await pass()).toMatchObject({ pushes: 2, failed: 0 });
      const small = pushOf("The bay: a window is taking shape");
      const big = pushOf("Big days: a window is taking shape");
      expect(small?.body).toContain("Sat 10 Oct, 08:00 to 12:00");
      expect(small?.body).toContain("Sat 10 Oct, 14:00 to 18:00");
      expect(big?.body).toContain("Sat 10 Oct, 14:00 to 18:00");
      expect(big?.body).not.toContain("08:00 to 12:00");
      // Two alerts, two things: neither takes the other's place on the device.
      expect(small?.tag).not.toBe(big?.tag);

      expect(await pushedBy()).toEqual([
        ["bay", [hour(8), hour(14)]],
        ["big", [hour(14)]],
      ]);
      // Nothing is left to say: what one told is not news to the other.
      expect(await pass()).toMatchObject({ pushes: 0 });
      expect(pushes()).toHaveLength(2);
    });

    it("say that hours went under the alert that lost them, and nothing under the other", async () => {
      await found();
      await pass();
      // The big days go: the small ones stay as they were.
      kept.provider.waves = swellBetween(8, 12);
      await next();
      await next();

      expect(await pass()).toMatchObject({ pushes: 2 });
      expect(
        pushes()
          .slice(2)
          .map((push) => push.title)
          .sort(),
      ).toEqual([
        "Big days: the window is no longer forecast",
        "The bay: the window is no longer forecast",
      ]);
      expect(await pushedBy()).toEqual([
        ["bay", [hour(8)]],
        ["big", []],
      ]);
    });

    it("list it under each alert in the evening's push, with that alert's hours", async () => {
      await settings({ onFound: false, onEvening: true, eveningMinutes: 20 * 60 });
      await found();
      await next();
      await next();
      vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));

      expect(await pass()).toMatchObject({ evenings: 1, pushes: 1 });
      // One row for the spot, with each alert's name before its hours, then the sea there.
      expect(pushes()[0]?.body.split("\n")).toEqual([
        "Home: (The bay) Sat 10 Oct, 08:00 to 12:00 · Sat 10 Oct, 14:00 to 18:00 · (Big days) Sat 10 Oct, 14:00 to 18:00",
        expect.stringMatching(/^Forecast for Sat 10 Oct, 08:00: waves 1\.2 m, /),
      ]);
      expect(pushes()[0]?.url).toBe("https://app.example.org/app?spot=home");
    });

    it("say that it is on under the alert whose hours begin, and keep it for that alert alone", async () => {
      await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
      await found();
      for (let look = 0; look < 6; look += 1) await next();
      vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));

      expect(await pass()).toMatchObject({ begins: 1, pushes: 1 });
      expect(pushes()[0]?.title).toBe("The bay: it is on");
      const links = await database.db
        .select()
        .from(alertSpot)
        .where(and(eq(alertSpot.spotId, "home")))
        .orderBy(alertSpot.alertId);
      expect(links.map((row) => [row.alertId, row.pushBegun.length])).toEqual([
        ["bay", 1],
        ["big", 0],
      ]);
    });
  });
});
