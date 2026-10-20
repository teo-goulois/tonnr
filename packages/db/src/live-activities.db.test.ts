import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { alert, liveActivity, notification, pushSubscription } from "./schema/alerts";
import { user } from "./schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "./testing";

// What the database holds of a Live Activity that "it is on" starts on an iPhone: decision 074.
describe.skipIf(!TEST_DATABASE_URL)("a Live Activity, as the database keeps it", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());

  const hex = () => Buffer.from(randomBytes(32)).toString("hex");
  const keys = { p256dh: `B${"A".repeat(85)}A`, auth: `${"A".repeat(21)}A` };
  const UNTIL = new Date("2026-10-20T12:00:00Z");

  beforeEach(async () => {
    const { db } = database;
    await db.delete(user);
    await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.org" });
    await db.insert(alert).values({ id: "alert-1", userId: "ana", name: "Dawn", criteria: {} });
    await db.insert(notification).values({
      id: "told-1",
      userId: "ana",
      alertId: "alert-1",
      moment: "begins",
      key: "begins:alert-1:1",
      payload: { alertName: "Dawn", zone: "UTC", lines: [] },
    });
    await db.insert(pushSubscription).values({
      id: "iphone",
      userId: "ana",
      kind: "ios",
      token: hex(),
      environment: "production",
      appId: "org.example.app",
      activityStartToken: hex(),
      ...keys,
    });
  });

  const started = (values: Partial<typeof liveActivity.$inferInsert> = {}) =>
    database.db.insert(liveActivity).values({
      id: crypto.randomUUID(),
      userId: "ana",
      deviceId: "iphone",
      notificationId: "told-1",
      alertId: "alert-1",
      alertRevision: 0,
      lastsUntil: UNTIL,
      ...values,
    });

  it("keeps the token that starts one on an iPhone, and on no other kind of device", async () => {
    const { db } = database;
    await expect(
      db.insert(pushSubscription).values({
        id: "browser",
        userId: "ana",
        endpoint: "https://fcm.googleapis.com/fcm/send/invented",
        activityStartToken: hex(),
        ...keys,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(pushSubscription).values({
        id: "android",
        userId: "ana",
        kind: "android",
        token: "invented:APA91b",
        appId: "org.example.app",
        activityStartToken: hex(),
        ...keys,
      }),
    ).rejects.toThrow();
    // An iPhone whose switch is off holds none.
    await db.insert(pushSubscription).values({
      id: "iphone-off",
      userId: "ana",
      kind: "ios",
      token: hex(),
      environment: "development",
      appId: "org.example.app",
      ...keys,
    });
    const [off] = await db
      .select({ token: pushSubscription.activityStartToken })
      .from(pushSubscription)
      .where(eq(pushSubscription.id, "iphone-off"));
    expect(off?.token).toBeNull();
  });

  it("gives a phone's token that starts one to one device alone", async () => {
    const { db } = database;
    const [iphone] = await db
      .select({ token: pushSubscription.activityStartToken })
      .from(pushSubscription);
    await expect(
      db.insert(pushSubscription).values({
        id: "iphone-2",
        userId: "ana",
        kind: "ios",
        token: hex(),
        environment: "production",
        appId: "org.example.app",
        activityStartToken: iphone?.token ?? "",
        ...keys,
      }),
    ).rejects.toThrow();
  });

  it("is one for a notification on a device, with a token of its own", async () => {
    const token = hex();
    await started({ token });
    await expect(started()).rejects.toThrow();
    await database.db.insert(notification).values({
      id: "told-2",
      userId: "ana",
      alertId: "alert-1",
      moment: "begins",
      key: "begins:alert-1:2",
      payload: { alertName: "Dawn", zone: "UTC", lines: [] },
    });
    await expect(started({ notificationId: "told-2", token })).rejects.toThrow();
    await expect(started({ notificationId: "told-2" })).resolves.toBeDefined();
  });

  it("keeps its alert's place empty once the alert is deleted, so that it can still be ended", async () => {
    const { db } = database;
    await started();
    await db.delete(alert).where(eq(alert.id, "alert-1"));
    const kept = await db.select().from(liveActivity);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.alertId).toBeNull();
  });

  it("goes with its device, and with its account", async () => {
    const { db } = database;
    await started();
    await db.delete(pushSubscription).where(eq(pushSubscription.id, "iphone"));
    expect(await db.select().from(liveActivity)).toHaveLength(0);

    await db.insert(pushSubscription).values({
      id: "iphone",
      userId: "ana",
      kind: "ios",
      token: hex(),
      environment: "production",
      appId: "org.example.app",
      ...keys,
    });
    await started();
    await db.delete(user).where(eq(user.id, "ana"));
    expect(await db.select().from(liveActivity)).toHaveLength(0);
  });
});
