import { randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";

import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { alert, liveActivity, notification, pushSubscription } from "@repo/db/schema/alerts";
import { session, user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import {
  makeVapidKeys,
  testForecasts,
  testPlaces,
  testReceiver,
  testVerification,
} from "./testing";
import { createUsage, type Usage } from "./usage";

// What an iPhone gives of its Live Activities: decision 074. The token that starts one comes with
// the device, as decision 072 keeps it, and the token of each activity the worker started comes
// with `push.activityStarted`. `push-apps.db.test.ts` tests the device itself.
describe.skipIf(!TEST_DATABASE_URL)("the Live Activities of an iPhone", () => {
  const WEB = "https://app.example.org";
  const AT = new Date("2026-10-20T08:00:00Z");
  const INSTANCE_KEY = makeVapidKeys().publicKey;
  const BUNDLE = "org.example.app";
  const PUSHED_TO = { ios: BUNDLE, android: "example-project" };

  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  const { forecasts } = testForecasts();

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(user);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    await db.insert(session).values(
      ["s-ana", "s-ben"].map((id) => ({
        id,
        userId: id.split("-")[1]!,
        token: `t-${id}`,
        expiresAt: new Date("2030-01-01"),
        updatedAt: AT,
      })),
    );
  });

  const by = (id: string, { db = database.db }: { db?: Context["db"] } = {}) => {
    const context: Context = {
      db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
        session: {
          id: `s-${id}`,
          userId: id,
          token: `t-s-${id}`,
          expiresAt: new Date("2030-01-01"),
        },
      } as Session,
      authorization: null,
      site: "app.tonnr://",
      adminSites: [],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: AT, webOrigin: WEB, pushKey: INSTANCE_KEY, appPush: PUSHED_TO },
    };
    return { context };
  };
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;
  const caught = (work: Promise<unknown>) =>
    work.then(
      () => {
        throw new Error("answered");
      },
      (error: unknown) => error,
    );
  const told = (error: unknown) => `${JSON.stringify(error)} ${(error as Error).message}`;

  const hex = () => Buffer.from(randomBytes(32)).toString("hex");
  const iphone = (token = hex()) => ({
    kind: "ios" as const,
    token,
    environment: "production" as const,
    appId: BUNDLE,
    keys: testReceiver().keys,
  });
  type Phone = ReturnType<typeof iphone> & { activityStartToken?: string | null };
  const register = (phone: Phone, who = "ana") => call(v1Router.push.registerApp, phone, by(who));
  const renew = (phone: Phone & { id?: string }, who = "ana") =>
    call(v1Router.push.renewApp, phone, by(who));
  const startTokens = async () =>
    (
      await database.db
        .select({ id: pushSubscription.id, start: pushSubscription.activityStartToken })
        .from(pushSubscription)
        .orderBy(asc(pushSubscription.createdAt))
    ).map((row) => row.start);

  // What the worker wrote as "it is on" started an activity on the device: decision 074.
  const startedOn = async (deviceId: string, userId = "ana") => {
    const alertId = randomUUID();
    const notificationId = randomUUID();
    await database.db.insert(alert).values({ id: alertId, userId, name: "Dawn", criteria: {} });
    await database.db.insert(notification).values({
      id: notificationId,
      userId,
      alertId,
      moment: "begins",
      key: `begins:${alertId}`,
      payload: { alertName: "Dawn", zone: "UTC", lines: [] },
    });
    const id = randomUUID();
    await database.db.insert(liveActivity).values({
      id,
      userId,
      deviceId,
      environment: "production",
      appId: BUNDLE,
      notificationId,
      alertId,
      alertRevision: 0,
      placeId: "home",
      startsAt: new Date(),
      lastsUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    return { id, notificationId };
  };
  const activities = () =>
    database.db.select().from(liveActivity).orderBy(asc(liveActivity.createdAt));

  describe("the token that starts one", () => {
    it("is said whether the instance starts them, with the key that pushes to its iPhones", async () => {
      expect((await call(v1Router.push.key, undefined, by("ana"))).apps).toEqual({
        ios: true,
        android: true,
        liveActivities: true,
      });
      const { context } = by("ana");
      context.server.appPush = { android: "example-project" };
      expect((await call(v1Router.push.key, undefined, { context })).apps.liveActivities).toBe(
        false,
      );
    });

    it("is kept with the iPhone that gives it, and never given back", async () => {
      const start = hex();

      const device = await register({ ...iphone(), activityStartToken: start.toUpperCase() });

      expect(JSON.stringify(device)).not.toContain(start);
      expect(await startTokens()).toEqual([start]);
      const listed = await call(v1Router.push.devices, undefined, by("ana"));
      expect(JSON.stringify(listed)).not.toContain(start);
    });

    it("is kept when the app says nothing of it, and taken back by null", async () => {
      const phone = iphone();
      const start = hex();
      const device = await register({ ...phone, activityStartToken: start });

      await register(phone);
      await renew({ id: device.id, ...phone });
      expect(await startTokens()).toEqual([start]);

      await renew({ id: device.id, ...phone, activityStartToken: null });
      expect(await startTokens()).toEqual([null]);

      const again = hex();
      await renew({ id: device.id, ...phone, activityStartToken: again });
      expect(await startTokens()).toEqual([again]);
      await register({ ...phone, activityStartToken: null });
      expect(await startTokens()).toEqual([null]);
    });

    it("is held by a new device only when it is given", async () => {
      await register(iphone());

      expect(await startTokens()).toEqual([null]);
    });

    it("is one phone's: a device that kept it lets go of it", async () => {
      const start = hex();
      await register({ ...iphone(), activityStartToken: start });

      const other = iphone();
      await register({ ...other, activityStartToken: start });
      expect(await startTokens()).toEqual([null, start]);

      const third = await register(iphone());
      await renew({ id: third.id, ...iphone(), activityStartToken: start });
      expect(await startTokens()).toEqual([null, null, start]);
    });

    it("is not the next account's on a phone, which lets go of what ran there for the account before", async () => {
      const shared = iphone();
      const anas = await register({ ...shared, activityStartToken: hex() });
      const running = await startedOn(anas.id);
      const ended = await startedOn(anas.id);
      await database.db
        .update(liveActivity)
        .set({ endedAt: new Date() })
        .where(eq(liveActivity.id, ended.id));

      const bens = await register(shared, "ben");

      expect(bens.id).not.toBe(anas.id);
      expect(await startTokens()).toEqual([null]);
      // Ana's are hers still, on no device: the worker ends the one that runs on the phone.
      expect(await activities()).toMatchObject([
        { id: running.id, userId: "ana", deviceId: null, endedAt: null, environment: "production" },
        { id: ended.id, userId: "ana", deviceId: null },
      ]);
    });

    it("lets go of what runs on the iPhone when it is taken back", async () => {
      const phone = iphone();
      const device = await register({ ...phone, activityStartToken: hex() });
      const running = await startedOn(device.id);
      const ended = await startedOn(device.id);
      await database.db
        .update(liveActivity)
        .set({ endedAt: new Date() })
        .where(eq(liveActivity.id, ended.id));

      // Said nothing of, it keeps them.
      await renew({ id: device.id, ...phone });
      expect((await activities()).map((row) => row.deviceId)).toEqual([device.id, device.id]);

      await renew({ id: device.id, ...phone, activityStartToken: null });

      // The one that runs is let go of, for the worker to end; the one that ended stays.
      expect(await activities()).toMatchObject([
        { id: running.id, deviceId: null, endedAt: null },
        { id: ended.id, deviceId: device.id },
      ]);
      await renew({ id: device.id, ...phone, activityStartToken: hex() });
      const again = await startedOn(device.id);
      await register({ ...phone, activityStartToken: null });
      expect((await activities()).find((row) => row.id === again.id)?.deviceId).toBeNull();
    });

    it.each([
      ["that is not hexadecimal", `kept-out${"a".repeat(64)}`],
      ["that is too short", "ab".repeat(31)],
    ])("is refused when it is a token %s, and nothing is said of it", async (_what, token) => {
      const error = await caught(register({ ...iphone(), activityStartToken: token }));

      expect(error).toEqual(refusal("BAD_REQUEST"));
      expect(told(error)).not.toContain("kept-out");
      expect(await startTokens()).toEqual([]);
    });

    it("is no part of what an Android phone gives", async () => {
      await call(
        v1Router.push.registerApp,
        {
          kind: "android",
          token: `${Buffer.from(randomBytes(8)).toString("base64url")}:APA91b${"x".repeat(140)}`,
          appId: BUNDLE,
          keys: testReceiver().keys,
          // Not an Android phone's to give: it is not read.
          activityStartToken: hex(),
        } as never,
        by("ana"),
      );

      expect(await startTokens()).toEqual([null]);
    });
  });

  describe("an activity that started", () => {
    it("is given its token, which no answer holds", async () => {
      const device = await register(iphone());
      const started = await startedOn(device.id);
      const token = hex();

      const answer = await call(
        v1Router.push.activityStarted,
        { id: device.id, notification: started.notificationId, token: token.toUpperCase() },
        by("ana"),
      );

      expect(answer).toEqual({ running: true });
      expect(await activities()).toMatchObject([{ id: started.id, token, endedAt: null }]);
    });

    it("is given a token anew when iOS changes it, which another activity lets go of", async () => {
      const device = await register(iphone());
      const first = await startedOn(device.id);
      const second = await startedOn(device.id);
      const token = hex();
      await call(
        v1Router.push.activityStarted,
        { id: device.id, notification: first.notificationId, token },
        by("ana"),
      );

      await call(
        v1Router.push.activityStarted,
        { id: device.id, notification: second.notificationId, token },
        by("ana"),
      );

      expect((await activities()).map((row) => row.token)).toEqual([null, token]);
    });

    it("is said to have ended when it has, and keeps no token then", async () => {
      const device = await register(iphone());
      const started = await startedOn(device.id);
      await database.db.update(liveActivity).set({ endedAt: AT });

      expect(
        await call(
          v1Router.push.activityStarted,
          { id: device.id, notification: started.notificationId, token: hex() },
          by("ana"),
        ),
      ).toEqual({ running: false });
      expect(await activities()).toMatchObject([{ token: null }]);
    });

    it("is another account's, or of no device, for the account that asks", async () => {
      const anas = await register(iphone());
      const started = await startedOn(anas.id);
      const bens = await register(iphone(), "ben");
      const browser = await call(
        v1Router.push.subscribe,
        {
          endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
          keys: testReceiver().keys,
        },
        by("ana"),
      );

      for (const [who, id, notificationId] of [
        ["ben", anas.id, started.notificationId],
        ["ben", bens.id, started.notificationId],
        ["ana", anas.id, randomUUID()],
        ["ana", browser.id, started.notificationId],
      ] as const) {
        const named = { id, notification: notificationId };
        await expect(
          call(v1Router.push.activityStarted, { ...named, token: hex() }, by(who)),
        ).rejects.toEqual(refusal("NOT_FOUND"));
        await expect(call(v1Router.push.activityEnded, named, by(who))).rejects.toEqual(
          refusal("NOT_FOUND"),
        );
      }
      expect(await activities()).toMatchObject([{ token: null, endedAt: null }]);
    });

    it("is refused for an app that acts for another account", async () => {
      const device = await register(iphone());
      const started = await startedOn(device.id);

      const named = { id: device.id, notification: started.notificationId, account: "ben" };
      await expect(
        call(v1Router.push.activityStarted, { ...named, token: hex() }, by("ana")),
      ).rejects.toEqual(refusal("CONFLICT"));
      await expect(call(v1Router.push.activityEnded, named, by("ana"))).rejects.toEqual(
        refusal("CONFLICT"),
      );
    });

    it("refuses a token that is none, and says nothing of it", async () => {
      const device = await register(iphone());
      const started = await startedOn(device.id);

      const error = await caught(
        call(
          v1Router.push.activityStarted,
          {
            id: device.id,
            notification: started.notificationId,
            token: `kept-out${"a".repeat(64)}`,
          },
          by("ana"),
        ),
      );

      expect(error).toEqual(refusal("BAD_REQUEST"));
      expect(told(error)).not.toContain("kept-out");
    });
  });

  describe("an activity that ends on the phone", () => {
    it("is sent nothing more: it ends, and lets go of its token", async () => {
      const device = await register(iphone());
      const started = await startedOn(device.id);
      await call(
        v1Router.push.activityStarted,
        { id: device.id, notification: started.notificationId, token: hex() },
        by("ana"),
      );

      const named = { id: device.id, notification: started.notificationId };
      expect(await call(v1Router.push.activityEnded, named, by("ana"))).toEqual({ ended: true });
      expect(await call(v1Router.push.activityEnded, named, by("ana"))).toEqual({ ended: false });
      expect(await activities()).toMatchObject([{ token: null, endedAt: expect.any(Date) }]);
    });

    it("outlives its device, which lets go of it for the worker to end it on the phone", async () => {
      const phone = iphone();
      const device = await register(phone);
      const started = await startedOn(device.id);
      await call(
        v1Router.push.activityStarted,
        { id: device.id, notification: started.notificationId, token: hex() },
        by("ana"),
      );

      await call(v1Router.push.forgetApp, { kind: "ios", token: phone.token }, by("ana"));

      expect(await activities()).toMatchObject([
        { deviceId: null, endedAt: null, token: expect.any(String), appId: BUNDLE },
      ]);
      // The app reads it as gone: the iPhone is no device of the caller's now.
      const named = { id: device.id, notification: started.notificationId };
      expect(await caught(call(v1Router.push.activityEnded, named, by("ana")))).toEqual(
        refusal("NOT_FOUND"),
      );
    });
  });

  describe("held in the order of decision 031", () => {
    it("waits for the worker that holds the iPhone, and writes after it", async () => {
      const device = await register(iphone());
      const started = await startedOn(device.id);
      const token = hex();
      let release: () => void = () => {};
      const holding = new Promise<void>((resolve) => {
        release = resolve;
      });
      let isHeld: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        isHeld = resolve;
      });
      // A worker that holds the account, then the device, then the activity, as it sends to it.
      const worker = database.db.transaction(async (tx) => {
        await tx.select().from(user).where(eq(user.id, "ana")).for("share");
        await tx
          .select()
          .from(pushSubscription)
          .where(eq(pushSubscription.id, device.id))
          .for("update");
        await tx.select().from(liveActivity).where(eq(liveActivity.id, started.id)).for("update");
        isHeld();
        await holding;
        await tx.update(liveActivity).set({ endedAt: AT }).where(eq(liveActivity.id, started.id));
      });
      await held;

      const asked = call(
        v1Router.push.activityStarted,
        { id: device.id, notification: started.notificationId, token },
        by("ana"),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      release();
      await worker;

      // The worker ended it meanwhile: the app is told so, and its token is not kept.
      expect(await asked).toEqual({ running: false });
      expect(await activities()).toMatchObject([{ token: null }]);
    });
  });

  describe("when the database fails", () => {
    it("passes on nothing of the tokens", async () => {
      const KEPT_OUT = "cd".repeat(32);
      const failing = new Proxy(database.db, {
        get: (db, key) => {
          if (key === "transaction") {
            return () => {
              throw new Error(`Failed query: update … params: ${KEPT_OUT}`);
            };
          }
          return Reflect.get(db, key) as unknown;
        },
      });
      const context = by("ana", { db: failing });
      for (const work of [
        call(v1Router.push.registerApp, { ...iphone(), activityStartToken: KEPT_OUT }, context),
        call(
          v1Router.push.activityStarted,
          { id: randomUUID(), notification: randomUUID(), token: KEPT_OUT },
          context,
        ),
        call(
          v1Router.push.activityEnded,
          { id: randomUUID(), notification: randomUUID() },
          context,
        ),
      ]) {
        const error = await caught(work);
        expect(error).toEqual(refusal("INTERNAL_SERVER_ERROR"));
        expect(inspect(error, { depth: 10 })).not.toContain(KEPT_OUT);
      }
    });
  });
});
