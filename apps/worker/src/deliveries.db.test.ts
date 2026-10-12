import { testForecasts } from "@repo/conditions/forecasts/testing";
import {
  alert,
  alertSettings,
  alertSpot,
  notification,
  notificationDelivery,
} from "@repo/db/schema/alerts";
import { countCalls } from "@repo/db/calls";
import { user } from "@repo/db/schema/auth";
import { providerCalls } from "@repo/db/schema/forecasts";
import { unitPreferences } from "@repo/db/schema/preferences";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { testMailer } from "@repo/mail/testing";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateAlerts } from "./alerts";
import { ACCOUNT_DAILY_MAILS, ALERT_MAIL_PROVIDER, type MailOut, hand, take } from "./deliveries";
import { tellMoments } from "./moments";

// The mails of the alerts: decision 031, "What is sent, and how". No test sends a mail: the
// library's adapter in memory takes the place of the provider, and a function of the forecast's.
describe.skipIf(!TEST_DATABASE_URL)("the mails of the alerts", () => {
  // A Friday morning, at the minute the looks run.
  const AT = new Date("2026-10-09T08:20:00Z");
  const HOUR_MS = 60 * 60 * 1000;
  const SATURDAY = Date.UTC(2026, 9, 10);
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let kept: ReturnType<typeof testForecasts>;
  let post: ReturnType<typeof testMailer>;
  let out: MailOut;

  const swellBetween = (from: number, to: number) => (seconds: number) =>
    seconds * 1000 >= SATURDAY + from * HOUR_MS && seconds * 1000 < SATURDAY + to * HOUR_MS
      ? 1.2
      : 0.2;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
    kept.provider.waves = swellBetween(8, 12);
    post = testMailer();
    out = {
      mailer: post.mailer,
      webOrigin: "https://app.example.org",
      apiOrigin: "https://api.example.org",
      dailyLimit: 200,
    };
    const { db } = database;
    await db.delete(user);
    await db.delete(providerCalls);
    await db
      .insert(user)
      .values({ id: "owner", name: "Owner", email: "owner@example.org", emailVerified: true });
    await db
      .insert(spot)
      .values({ id: "home", userId: "owner", name: "Home", latitude: 43.63, longitude: -1.46 });
    await db.insert(alert).values({
      id: "bay",
      userId: "owner",
      name: "The bay",
      criteria: { swellHeightMeters: { min: 1 } },
    });
    await db.insert(alertSpot).values({ spotId: "home", alertId: "bay", position: 0 });
    // An account that goes at any hour, wants its alerts by mail, and has no quiet hours.
    await db.insert(alertSettings).values({
      userId: "owner",
      daylightOnly: false,
      byMail: true,
      mailKey: "the-key",
      locale: "en",
      quietFrom: null,
      quietTo: null,
      // No evening here: one moment at a time.
      onEvening: false,
      onBegin: false,
    });
  });

  const look = () => Effect.runPromise(evaluateAlerts(database.db, kept.forecasts));
  /** The next look, three hours on. */
  const next = () => {
    vi.advanceTimersByTime(3 * HOUR_MS);
    return look();
  };
  /** The lighter pass, with the instance's way out or with none. */
  const pass = (mail: MailOut | null = out) => Effect.runPromise(tellMoments(database.db, mail));
  const deliveries = () =>
    database.db
      .select({
        moment: notification.moment,
        state: notificationDelivery.state,
        dueAt: notificationDelivery.dueAt,
        expiresAt: notificationDelivery.expiresAt,
      })
      .from(notificationDelivery)
      .innerJoin(notification, eq(notification.id, notificationDelivery.notificationId))
      .orderBy(notification.createdAt, notification.moment);
  const states = async () => (await deliveries()).map((one) => [one.moment, one.state]);
  const settings = (changes: Partial<typeof alertSettings.$inferInsert>) =>
    database.db.update(alertSettings).set(changes).where(eq(alertSettings.userId, "owner"));
  /** A window found by two looks: its notification is written, and its mail is on its way. */
  const found = async () => {
    await look();
    await next();
  };

  it("leave with what an alert told, once, to the account's address", async () => {
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

    expect(await pass()).toMatchObject({ mails: 1, failed: 0 });
    const [mail] = post.sent();
    expect(mail).toMatchObject({
      to: "owner@example.org",
      subject: "The bay: a window is taking shape",
    });
    expect(mail?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 12:00");
    expect(mail?.text).toContain("Open the spot: https://app.example.org/app?spot=home");
    expect(mail?.text).toContain(
      "Stop these mails: https://app.example.org/mail-off?u=owner&k=the-key",
    );
    expect(mail?.headers).toEqual([
      {
        name: "List-Unsubscribe",
        // The page a mail program is led to is in the mail's language.
        value: "<https://api.example.org/v1/alert-mails/off?u=owner&k=the-key&l=en>",
      },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ]);
    expect(await states()).toEqual([["found", "sent"]]);

    expect(await pass()).toMatchObject({ mails: 0 });
    expect(post.sent()).toHaveLength(1);
  });

  it("are written in the account's language, with its pages", async () => {
    await settings({ locale: "fr", zone: "Europe/Paris" });
    await found();
    await pass();

    const [mail] = post.sent();
    expect(mail?.subject).toBe("The bay : un créneau se dessine");
    expect(mail?.text).toContain("sam. 10 oct., 10:00 à 14:00");
    expect(mail?.text).toContain("https://app.example.org/fr/app?spot=home");
    expect(mail?.text).toContain("https://app.example.org/fr/mail-off?u=owner&k=the-key");
  });

  it("are written in the units the account reads its screens in", async () => {
    await database.db
      .insert(unitPreferences)
      .values({ userId: "owner", windSpeed: "kmh", height: "ft", savedAt: new Date() });
    await found();
    await pass();

    // 1.2 m of swell is 3.9 ft.
    expect(post.sent()[0]?.text).toContain("waves 3.9 ft");
    expect(post.sent()[0]?.text).not.toMatch(/\d kn\b/);
  });

  it("are not made for an account that did not say yes to mail", async () => {
    await settings({ byMail: null });
    await found();
    expect(await deliveries()).toEqual([]);

    await settings({ byMail: false });
    kept.provider.waves = swellBetween(13, 17);
    await next();
    expect(await deliveries()).toEqual([]);
    expect(await pass()).toMatchObject({ mails: 0 });
  });

  it("wait for the end of the account's quiet hours", async () => {
    // Quiet from 10:00 to 13:00 UTC: the second look, at 11:20, falls in them.
    await settings({ quietFrom: 10 * 60, quietTo: 13 * 60 });
    await found();
    expect((await deliveries())[0]?.dueAt).toEqual(new Date("2026-10-09T13:00:00Z"));

    expect(await pass()).toMatchObject({ mails: 0 });
    vi.setSystemTime(new Date("2026-10-09T13:00:00Z"));
    expect(await pass()).toMatchObject({ mails: 1 });
  });

  it("are given up once the hours they spoke of are over", async () => {
    await settings({ quietFrom: 0, quietTo: 23 * 60 + 59 });
    await found();

    vi.setSystemTime(new Date(SATURDAY + 12 * HOUR_MS));
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
    expect(post.sent()).toEqual([]);
  });

  it("wait for an address to be checked, and leave once it is", async () => {
    await database.db.update(user).set({ emailVerified: false });
    await found();
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "pending"]]);

    // Checked a while later, while the hours are still ahead.
    await database.db.update(user).set({ emailVerified: true });
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 12:00\n");
  });

  it("are given up for an address that is still not checked when the hours are over", async () => {
    await database.db.update(user).set({ emailVerified: false });
    await found();
    await pass();

    vi.setSystemTime(new Date(SATURDAY + 13 * HOUR_MS));
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
  });

  it("are not sent to an account that stopped them", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    await settings({ byMail: false, quietFrom: null, quietTo: null });
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));

    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
    expect(post.sent()).toEqual([]);
  });

  it("do not keep those behind them waiting, however many cannot leave yet", async () => {
    // Sixty of an account whose address is not checked, all written before the owner's.
    await database.db.insert(user).values({ id: "late", name: "Late", email: "late@example.org" });
    await database.db.insert(alertSettings).values({ userId: "late", byMail: true });
    const earlier = new Date(AT.getTime() - HOUR_MS);
    const waiting = Array.from({ length: 60 }, (_, index) => `late-${index}`);
    await database.db.insert(notification).values(
      waiting.map((id) => ({
        id,
        userId: "late",
        alertId: null,
        moment: "evening" as const,
        key: id,
        payload: { alertName: null, zone: "UTC", day: "2026-10-10", lines: [] },
      })),
    );
    await database.db.insert(notificationDelivery).values(
      waiting.map((notificationId) => ({
        notificationId,
        channel: "mail" as const,
        dueAt: earlier,
        expiresAt: new Date(SATURDAY),
      })),
    );
    await found();

    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[0]?.to).toBe("owner@example.org");
  });

  it("say that a window moved or went only when a mail had told it", async () => {
    await found();
    await pass();
    kept.provider.waves = swellBetween(13, 17);
    await next();

    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[1]?.subject).toBe("The bay: the window has moved");
    expect(post.sent()[1]?.text).toContain(
      "Home\n  Moved: Sat 10 Oct, 13:00 to 17:00 (it was Sat 10 Oct, 08:00 to 12:00)\n",
    );

    // An account that says yes to mail after a window was told is not mailed its going.
    await database.db.delete(notification);
    await database.db.update(alertSpot).set({ mailed: [] });
    kept.provider.waves = () => 0.2;
    await next();
    await next();
    expect(await states()).toEqual([["gone", "pending"]]);
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["gone", "expired"]]);
    expect(post.sent()).toHaveLength(2);
  });

  it("say where the hours are when they leave, and once, when a window moved as it waited", async () => {
    // Quiet all morning: nothing leaves before 15:00.
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    kept.provider.waves = swellBetween(13, 17);
    await next();

    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    expect(await pass()).toMatchObject({ mails: 1 });
    // The one that was written first leaves first, and says what there is to say: the other
    // has nothing left to tell, since no mail ever told the hours it says have moved.
    expect(await states()).toEqual([
      ["found", "sent"],
      ["moved", "expired"],
    ]);
    expect(post.sent()[0]?.subject).toBe("The bay: a window is taking shape");
    expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 13:00 to 17:00\n");
    expect(post.sent()[0]?.text).not.toContain("08:00");
  });

  it("say nothing of hours that came and went while they waited", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 20 * 60 });
    await found();
    kept.provider.waves = () => 0.2;
    await next();
    await next();

    vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([
      ["found", "expired"],
      ["gone", "expired"],
    ]);
    expect(post.sent()).toEqual([]);
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
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(await states()).toEqual([
      ["found", "sent"],
      ["gone", "expired"],
    ]);
    expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 12:00\n");
    expect(post.sent()[0]?.text).not.toContain("Sun 11 Oct");
  });

  it("do not send hours that went without a word, for an account that switched changes off", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 20 * 60 });
    await found();
    await settings({ onChange: false });
    kept.provider.waves = () => 0.2;
    await next();
    await next();

    vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
    expect(await pass()).toMatchObject({ mails: 0 });
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
    expect(await pass()).toMatchObject({ begins: 1, mails: 0 });
    expect(await states()).toEqual([["begins", "pending"]]);

    // The look of 08:20 finds no swell.
    kept.provider.waves = () => 0.2;
    vi.setSystemTime(new Date(SATURDAY + 8 * HOUR_MS + 20 * 60 * 1000));
    await look();
    vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["begins", "expired"]]);
    expect(post.sent()).toEqual([]);
  });

  it("say that it is on with what the last look read of the sea, and when it was fetched", async () => {
    await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
    await found();
    for (let look = 0; look < 6; look += 1) await next();
    vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));

    expect(await pass()).toMatchObject({ begins: 1, mails: 1 });
    const [mail] = post.sent();
    expect(mail?.subject).toBe("The bay: it is on");
    expect(mail?.text).toContain(
      "Home\n  Sat 10 Oct, 08:00 to 12:00\n  Forecast for Sat 10 Oct, 08:00: waves 1.2 m",
    );
    expect(mail?.text).toMatch(/\(forecast fetched Sat 10 Oct, 05:20\)/);
  });

  it("are not sent for an alert that was switched off or deleted while they waited", async () => {
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    await database.db.update(alert).set({ enabled: false });
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "expired"]]);

    await database.db.update(alert).set({ enabled: true, lookedAt: null });
    await database.db.delete(notification);
    await database.db.update(alertSpot).set({ told: [] });
    await settings({ quietFrom: 8 * 60, quietTo: 23 * 60 });
    await next();
    await database.db.delete(alert);
    vi.setSystemTime(new Date("2026-10-09T23:00:00Z"));
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "expired"]]);
    expect(post.sent()).toEqual([]);
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
    expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 10:00\n");

    // It now goes in the afternoon: those hours are new, to mail as to the list.
    await settings({ week: week(13, 17) });
    await next();
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[1]?.subject).toBe("The bay: a window is taking shape");
    expect(post.sent()[1]?.text).toContain("Home\n  Sat 10 Oct, 13:00 to 17:00\n");
    expect(post.sent()[1]?.text).not.toContain("No longer forecast");
  });

  it("tell hours that outlasted what was written, when the mail leaves after those were over", async () => {
    // Quiet from Friday 11:00 until Saturday 10:45: the hours told, 08:00 to 10:00, are over.
    await settings({ quietFrom: 11 * 60, quietTo: 10 * 60 + 45 });
    kept.provider.waves = swellBetween(8, 10);
    await found();
    // Two hours more: not a move that is told.
    kept.provider.waves = swellBetween(8, 12);
    for (let look = 0; look < 6; look += 1) await next();
    expect(await states()).toEqual([["found", "pending"]]);

    vi.setSystemTime(new Date(SATURDAY + 10.75 * HOUR_MS));
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 12:00\n");
  });

  it("tell nothing of a move that an account was not told while it had changes switched off", async () => {
    await found();
    await pass();
    await settings({ onChange: false });
    kept.provider.waves = swellBetween(13, 17);
    await next();
    await settings({ onChange: true });
    // Sunday morning is new: its mail says that, and nothing of Saturday's move.
    kept.provider.waves = (seconds) =>
      Math.max(swellBetween(13, 17)(seconds), swellBetween(32, 36)(seconds));
    await next();
    await next();

    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[1]?.subject).toBe("The bay: a window is taking shape");
    expect(post.sent()[1]?.text).toContain("Home\n  Sun 11 Oct, 08:00 to 12:00\n");
    expect(post.sent()[1]?.text).not.toContain("Moved");
  });

  describe("that it is on, when it waited", () => {
    // Saturday, 07:45: said in quiet hours that end at 09:00.
    const waiting = async () => {
      await settings({ onFound: false, onBegin: true, noticeMinutes: 30 });
      await found();
      for (let look = 0; look < 6; look += 1) await next();
      await settings({ quietFrom: 7 * 60, quietTo: 9 * 60 });
      vi.setSystemTime(new Date(SATURDAY + 7.75 * HOUR_MS));
      expect(await pass()).toMatchObject({ begins: 1, mails: 0 });
      expect(await states()).toEqual([["begins", "pending"]]);
    };

    it("leaves once the quiet hours end, while the hours are on", async () => {
      await waiting();
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ mails: 1 });
      expect(post.sent()[0]?.subject).toBe("The bay: it is on");
      // The sea of the hour it leaves in, which the mail names.
      expect(post.sent()[0]?.text).toContain("Forecast for Sat 10 Oct, 09:00: waves 1.2 m");
    });

    it("is not sent by an account that switched it off meanwhile", async () => {
      await waiting();
      await settings({ onBegin: false });
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ mails: 0 });
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
      expect(await pass()).toMatchObject({ mails: 0 });
      expect(await deliveries()).toMatchObject([
        {
          moment: "begins",
          state: "pending",
          dueAt: new Date(SATURDAY + 10.5 * HOUR_MS),
          expiresAt: new Date(SATURDAY + 15 * HOUR_MS),
        },
      ]);

      vi.setSystemTime(new Date(SATURDAY + 10.5 * HOUR_MS));
      expect(await pass()).toMatchObject({ mails: 1 });
      expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 11:00 to 15:00\n");
    });

    it("is not sent once its alert is gone, wherever its spot is then", async () => {
      await waiting();
      await database.db.delete(alert);
      await database.db.insert(alert).values({
        id: "other",
        userId: "owner",
        name: "Another",
        criteria: { swellHeightMeters: { min: 1 } },
      });
      await database.db.insert(alertSpot).values({ spotId: "home", alertId: "other", position: 0 });
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ mails: 0 });
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
      expect(await pass()).toMatchObject({ begins: 1, mails: 0 });
      // The one that waits was written for the whole day, as one that waited longer would be.
      const [made] = await database.db.select().from(notification);
      const [line] = made?.payload.lines ?? [];
      if (!made || !line) throw new Error("no notification");
      await database.db
        .update(notification)
        .set({
          payload: {
            ...made.payload,
            lines: [
              {
                ...line,
                open: [
                  {
                    start: new Date(SATURDAY + 8 * HOUR_MS).toISOString(),
                    end: new Date(SATURDAY + 15 * HOUR_MS).toISOString(),
                  },
                ],
              },
            ],
          },
        })
        .where(eq(notification.id, made.id));

      vi.setSystemTime(new Date(SATURDAY + 8 * HOUR_MS));
      expect(await pass()).toMatchObject({ mails: 1 });
      expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 10:00\n");
      expect(post.sent()[0]?.text).not.toContain("13:00");
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
      const afternoon = post.sent().filter((mail) => mail.text.includes("13:00 to 15:00"));
      expect(afternoon).toHaveLength(1);
      expect(afternoon[0]?.text).not.toContain("08:00 to 10:00");
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
    });

    it("leaves as one mail when two of an alert waited for hours that are now the same", async () => {
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
          lines: [
            {
              ...line,
              open: [
                {
                  start: new Date(SATURDAY + 10 * HOUR_MS).toISOString(),
                  end: new Date(SATURDAY + 12 * HOUR_MS).toISOString(),
                },
              ],
            },
          ],
        },
      });
      await database.db.insert(notificationDelivery).values({ ...due, notificationId: "second" });
      vi.setSystemTime(new Date(SATURDAY + 9 * HOUR_MS));

      expect(await pass()).toMatchObject({ mails: 1 });
      expect(post.sent()).toHaveLength(1);
      expect((await states()).map(([, state]) => state).sort()).toEqual(["expired", "sent"]);
      expect(await pass()).toMatchObject({ mails: 0 });
    });
  });

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
    const mailOf = (subject: string) => post.sent().find((mail) => mail.subject === subject);
    const hour = (at: number) => new Date(SATURDAY + at * HOUR_MS).toISOString();

    it("leave apart, each under its alert's name with its hours, and each keeps what it told", async () => {
      await found();

      expect(await pass()).toMatchObject({ mails: 2, failed: 0 });
      const small = mailOf("The bay: a window is taking shape");
      const big = mailOf("Big days: a window is taking shape");
      expect(small?.text).toContain("Sat 10 Oct, 08:00 to 12:00");
      expect(small?.text).toContain("Sat 10 Oct, 14:00 to 18:00");
      expect(big?.text).toContain("Sat 10 Oct, 14:00 to 18:00");
      expect(big?.text).not.toContain("08:00 to 12:00");

      const links = await database.db.select().from(alertSpot).orderBy(alertSpot.alertId);
      expect(links.map((row) => [row.alertId, row.mailed.map((piece) => piece.start)])).toEqual([
        ["bay", [hour(8), hour(14)]],
        ["big", [hour(14)]],
      ]);
      // Nothing is left to say: what one told is not news to the other.
      expect(await pass()).toMatchObject({ mails: 0 });
      expect(post.sent()).toHaveLength(2);
    });

    it("say that hours went under the alert that lost them, and nothing under the other", async () => {
      await found();
      await pass();
      // The big days go: the small ones stay as they were.
      kept.provider.waves = swellBetween(8, 12);
      await next();
      await next();

      expect(await pass()).toMatchObject({ mails: 2 });
      expect(
        post
          .sent()
          .slice(2)
          .map((mail) => mail.subject)
          .sort(),
      ).toEqual([
        "Big days: the window is no longer forecast",
        "The bay: the window is no longer forecast",
      ]);
      const links = await database.db.select().from(alertSpot).orderBy(alertSpot.alertId);
      expect(links.map((row) => [row.alertId, row.mailed.map((piece) => piece.start)])).toEqual([
        ["bay", [hour(8)]],
        ["big", []],
      ]);
    });

    it("list it under each alert in the evening's mail, with that alert's hours", async () => {
      await settings({ onFound: false, onEvening: true, eveningMinutes: 20 * 60 });
      await found();
      await next();
      await next();
      vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));

      expect(await pass()).toMatchObject({ evenings: 1, mails: 1 });
      const text = post.sent()[0]?.text ?? "";
      expect(text).toContain(
        "Home (The bay)\n  Sat 10 Oct, 08:00 to 12:00\n  Sat 10 Oct, 14:00 to 18:00\n",
      );
      expect(text).toContain("Home (Big days)\n  Sat 10 Oct, 14:00 to 18:00\n");
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

    it("leaves that evening, with the day it lists and each spot's alert", async () => {
      await evening();

      expect(await pass()).toMatchObject({ evenings: 1, mails: 1 });
      expect(post.sent()[0]?.subject).toBe("Saturday 10 October: what is forecast");
      expect(post.sent()[0]?.text).toContain("Home (The bay)\n  Sat 10 Oct, 08:00 to 12:00\n");
    });

    it("is not sent the morning after, when quiet hours kept it past midnight", async () => {
      await evening({ quietFrom: 19 * 60, quietTo: 7 * 60 });
      expect(await pass()).toMatchObject({ evenings: 1, mails: 0 });
      // Worth sending until the day it lists begins.
      expect((await deliveries())[0]).toMatchObject({ expiresAt: new Date(SATURDAY) });

      for (let look = 0; look < 3; look += 1) await next();
      vi.setSystemTime(new Date(SATURDAY + 7 * HOUR_MS));
      expect(await pass()).toMatchObject({ mails: 0 });
      expect(await states()).toEqual([["evening", "expired"]]);
      expect(post.sent()).toEqual([]);
    });

    it("is not sent by an account that switched it off, or whose next day is another by then", async () => {
      await evening({ quietFrom: 19 * 60, quietTo: 21 * 60 });
      await pass();
      await settings({ onEvening: false });
      vi.setSystemTime(new Date("2026-10-09T21:00:00Z"));
      expect(await pass()).toMatchObject({ mails: 0 });
      expect(await states()).toEqual([["evening", "expired"]]);

      // And one that moved east, where it is already Saturday.
      await database.db.delete(notification);
      await settings({ onEvening: true, eveningUntil: null, quietFrom: 19 * 60, quietTo: 21 * 60 });
      vi.setSystemTime(new Date("2026-10-09T20:00:00Z"));
      await pass();
      expect(await states()).toEqual([["evening", "pending"]]);
      await settings({ zone: "Pacific/Auckland", quietFrom: null, quietTo: null });
      expect(await pass()).toMatchObject({ mails: 0 });
      expect((await states()).filter(([, state]) => state === "sent")).toEqual([]);
    });
  });

  describe("between the moment they are written and the moment they are handed over", () => {
    // The first step alone: the mail is written, and marked as leaving.
    const written = async () => {
      const [due] = await database.db.select().from(notificationDelivery);
      const taken = await take(database.db, out, due?.notificationId ?? "");
      if (typeof taken === "string") throw new Error(`not taken: ${taken}`);
      return { id: due?.notificationId ?? "", taken };
    };
    const mailedAt = async () =>
      (await database.db.select().from(alertSpot))[0]?.mailed.map((piece) => piece.start);

    it("are put back whole when a setting changed, and say what stands under it", async () => {
      await found();
      const { id, taken } = await written();
      // It is leaving, and nothing is told yet.
      expect(await states()).toEqual([["found", "sending"]]);
      expect(await mailedAt()).toEqual([]);

      // The account switches "found" off, and is answered.
      await settings({ onFound: false });
      expect(await hand(database.db, out, id, taken)).toBe("skipped");
      expect(post.sent()).toEqual([]);
      expect(await states()).toEqual([["found", "pending"]]);
      expect(await mailedAt()).toEqual([]);

      // Read again, it has nothing to say to an account that is told no new hours.
      expect(await pass()).toMatchObject({ mails: 0 });
      expect(await states()).toEqual([["found", "expired"]]);
    });

    it("are put back whole when a look changed the hours, and say where they are", async () => {
      await found();
      const { id, taken } = await written();
      kept.provider.waves = swellBetween(13, 17);
      await next();

      expect(await hand(database.db, out, id, taken)).toBe("skipped");
      expect(post.sent()).toEqual([]);
      expect(await pass()).toMatchObject({ mails: 1 });
      expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 13:00 to 17:00\n");
      expect(post.sent()[0]?.text).not.toContain("08:00");
    });

    it("are handed over when nothing changed", async () => {
      await found();
      const { id, taken } = await written();

      expect(await hand(database.db, out, id, taken)).toBe("sent");
      expect(post.sent()).toHaveLength(1);
      expect(await states()).toEqual([["found", "sent"]]);
      // What it told is told once it has left.
      expect(await mailedAt()).toEqual(["2026-10-10T08:00:00.000Z"]);
    });

    it("are given up when the account stopped its mails", async () => {
      await found();
      const { id, taken } = await written();
      await settings({ byMail: false, mailKey: null });

      expect(await hand(database.db, out, id, taken)).toBe("expired");
      expect(post.sent()).toEqual([]);
      // Nothing was told: an account that says yes again is told these hours as new ones.
      expect(await mailedAt()).toEqual([]);
      await settings({ byMail: true });
      kept.provider.waves = swellBetween(13, 17);
      await next();
      expect(await pass()).toMatchObject({ mails: 1 });
      expect(post.sent()[0]?.subject).toBe("The bay: a window is taking shape");
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
      expect(post.sent()).toEqual([]);
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

    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 08:00 to 12:00\n");
    expect(post.sent()[0]?.text).not.toContain("Away");
    expect(await states()).toEqual([["found", "pending"]]);

    // It is read again, and says the rest.
    await database.db.update(alertSpot).set({ lookedAt: new Date() });
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[1]?.text).toContain("Away\n  Sat 10 Oct, 08:00 to 12:00\n");
    expect(post.sent()[1]?.text).not.toContain("Home");
    // With nothing left to say, it has been sent.
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "sent"]]);
  });

  it("say later what a spot that could not be read has to say, when the provider refused the others", async () => {
    await database.db
      .insert(spot)
      .values({ id: "away", userId: "owner", name: "Away", latitude: 43.6, longitude: -1.47 });
    await database.db.insert(alertSpot).values({ spotId: "away", alertId: "bay", position: 1 });
    await found();
    await database.db
      .update(alertSpot)
      .set({ lookedAt: new Date(Date.now() - 7 * HOUR_MS) })
      .where(eq(alertSpot.spotId, "away"));
    const refusing = testMailer({ failing: true });
    const said = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await pass({ ...out, mailer: refusing.mailer })).toMatchObject({ mails: 0, failed: 1 });
    expect(await states()).toEqual([["found", "pending"]]);
    said.mockRestore();

    // What was refused is not said again, and the spot that waited is.
    await database.db.update(alertSpot).set({ lookedAt: new Date() });
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[0]?.text).toContain("Away\n  Sat 10 Oct, 08:00 to 12:00\n");
    expect(post.sent()[0]?.text).not.toContain("Home");
  });

  it("follow the quiet hours as they are when they leave, not as they were", async () => {
    await found();
    // Due at once, and the account then asks for quiet until 13:00.
    await settings({ quietFrom: 10 * 60, quietTo: 13 * 60 });
    expect(await pass()).toMatchObject({ mails: 0 });
    expect((await deliveries())[0]).toMatchObject({
      state: "pending",
      dueAt: new Date("2026-10-09T13:00:00Z"),
    });

    vi.setSystemTime(new Date("2026-10-09T13:00:00Z"));
    expect(await pass()).toMatchObject({ mails: 1 });
  });

  it("are written in the account's time zone as it is when they leave", async () => {
    await found();
    await settings({ zone: "Europe/Paris" });
    // The hours were cut on another clock: the mail waits for a look that cuts them on this one.
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "pending"]]);

    await next();
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[0]?.text).toContain("Home\n  Sat 10 Oct, 10:00 to 14:00\n");
  });

  it("are not sent again, nor is what they said, when the worker stopped as one was leaving", async () => {
    // Two that wait together, of one alert.
    await settings({ quietFrom: 8 * 60, quietTo: 15 * 60 });
    await found();
    kept.provider.waves = swellBetween(13, 17);
    await next();
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    let stops = true;
    const stopping = {
      ...out,
      mailer: {
        // The provider takes the first, and the worker stops before it can write so.
        send: async (mail: Parameters<MailOut["mailer"]["send"]>[0]) => {
          const outcome = await post.mailer.send(mail);
          if (!stops) return outcome;
          stops = false;
          throw new Error("The worker stopped");
        },
      } as unknown as MailOut["mailer"],
    };

    expect(await pass(stopping)).toMatchObject({ mails: 0, failed: 1 });
    // It left, and nobody knows: it is kept as on its way, with what it tells. The other mail
    // of the alert waits, since what it says depends on that.
    expect(post.sent()).toHaveLength(1);
    expect(await states()).toEqual([
      ["found", "sending"],
      ["moved", "pending"],
    ]);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(await pass()).toMatchObject({ mails: 0, failed: 0 });
    expect(await states()).toEqual([
      ["found", "sending"],
      ["moved", "pending"],
    ]);

    // Long enough after, it is known to have been left behind: what it told is taken as told,
    // and the other has nothing left to say.
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(await pass()).toMatchObject({ mails: 0, failed: 0 });
    expect(await states()).toEqual([
      ["found", "sending"],
      ["moved", "expired"],
    ]);
    expect(post.sent()).toHaveLength(1);
    said.mockRestore();
  });

  it("make an account that stops its mails wait for the one that is leaving", async () => {
    await found();
    let release = () => {};
    const leaving = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = () => {};
    const taken = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const slow = {
      ...out,
      mailer: {
        send: async (mail: Parameters<MailOut["mailer"]["send"]>[0]) => {
          entered();
          await leaving;
          return post.mailer.send(mail);
        },
      } as unknown as MailOut["mailer"],
    };

    const passing = pass(slow);
    await taken;
    let stopped = false;
    const stop = settings({ byMail: false, mailKey: null }).then(() => {
      stopped = true;
    });
    // The clock of the test is held, and timers are not: the stop has time to pass if it can.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(stopped).toBe(false);

    release();
    expect(await passing).toMatchObject({ mails: 1 });
    await stop;
    expect(stopped).toBe(true);
    // Once it is answered, nothing leaves.
    kept.provider.waves = swellBetween(13, 17);
    await next();
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(post.sent()).toHaveLength(1);
  });

  it("stop at the account's mails for the day, and say later what a mail held back had to say", async () => {
    // All of the account's mails for the day but one have left.
    for (let index = 1; index < ACCOUNT_DAILY_MAILS; index += 1) {
      await countCalls(database.db, [
        {
          provider: `${ALERT_MAIL_PROVIDER}:owner`,
          bucket: "day",
          span: "day",
          limit: ACCOUNT_DAILY_MAILS,
        },
      ]);
    }
    await found();
    expect(await pass()).toMatchObject({ mails: 1 });
    kept.provider.waves = swellBetween(11, 15);
    await next();

    expect(await pass()).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([
      ["found", "sent"],
      ["moved", "held"],
    ]);
    // What was held back is not tried again.
    expect(await pass()).toMatchObject({ mails: 0 });

    // Another day: the alert's next mail says where the hours are, against what mail told.
    await database.db.delete(providerCalls);
    kept.provider.waves = swellBetween(14, 18);
    await next();
    expect(await pass()).toMatchObject({ mails: 1 });
    expect(post.sent()[1]?.text).toContain(
      "Home\n  Moved: Sat 10 Oct, 14:00 to 18:00 (it was Sat 10 Oct, 08:00 to 12:00)\n",
    );
  });

  it("hold everything back on an instance whose day has no mail to spare for alerts", async () => {
    await found();
    // Four fifths of one mail is none.
    expect(await pass({ ...out, dailyLimit: 1 })).toMatchObject({ mails: 0 });
    expect(await states()).toEqual([["found", "held"]]);
    expect(post.sent()).toEqual([]);
  });

  it("are not tried again when the provider does not take them", async () => {
    await found();
    const failing = testMailer({ failing: true });
    const said = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await pass({ ...out, mailer: failing.mailer })).toMatchObject({ mails: 0, failed: 1 });
    expect(await states()).toEqual([["found", "failed"]]);
    expect(await pass()).toMatchObject({ mails: 0 });
    expect(post.sent()).toEqual([]);
    said.mockRestore();
  });

  it("stay where they are on an instance whose worker has no way out, until they are over", async () => {
    await found();
    expect(await pass(null)).toMatchObject({ mails: 0, failed: 0 });
    expect(await states()).toEqual([["found", "pending"]]);

    vi.setSystemTime(new Date(SATURDAY + 13 * HOUR_MS));
    await pass(null);
    expect(await states()).toEqual([["found", "expired"]]);
  });

  it("make the key of their link for an account that has none yet", async () => {
    await settings({ mailKey: null });
    await found();
    await pass();

    const [row] = await database.db.select().from(alertSettings);
    expect(row?.mailKey).toEqual(expect.any(String));
    expect(post.sent()[0]?.text).toContain(`&k=${row?.mailKey}`);
  });
});
