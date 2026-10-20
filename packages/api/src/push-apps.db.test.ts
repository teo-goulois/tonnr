import { randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";

import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { pushSubscription } from "@repo/db/schema/alerts";
import { session, user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
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

// The app on a phone as a device of its account: decision 072. A browser's rules hold for it,
// which `push.db.test.ts` tests: this tests what is a phone's own.
describe.skipIf(!TEST_DATABASE_URL)("the app on a phone, pushed to", () => {
  const WEB = "https://app.example.org";
  const AT = new Date("2026-10-19T08:00:00Z");
  const LONG_AGO = new Date("2026-01-01T00:00:00Z");
  const INSTANCE_KEY = makeVapidKeys().publicKey;
  // The bundle of the iOS app the instance pushes to, and its Android app's Firebase project.
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
    // Each is signed in on a phone, and Ana in a second place too.
    await db.insert(session).values(
      ["s-ana", "s-ben", "s-ana-elsewhere"].map((id) => ({
        id,
        userId: id.split("-")[1]!,
        token: `t-${id}`,
        expiresAt: new Date("2030-01-01"),
        updatedAt: AT,
      })),
    );
  });

  // An instance that pushes to both apps, unless a test says otherwise.
  type Instance = {
    appPush?: { ios?: string; android?: string };
    db?: Context["db"];
    session?: string;
  };
  const by = (
    id: string,
    { appPush = PUSHED_TO, db = database.db, session: sessionId = `s-${id}` }: Instance = {},
  ) => {
    const context: Context = {
      db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
        session: {
          id: sessionId,
          userId: id,
          token: `t-${sessionId}`,
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
      server: { startedAt: AT, webOrigin: WEB, pushKey: INSTANCE_KEY, appPush },
    };
    return { context };
  };
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;
  const told = (error: unknown) => `${JSON.stringify(error)} ${(error as Error).message}`;
  const caught = (work: Promise<unknown>) =>
    work.then(
      () => {
        throw new Error("answered");
      },
      (error: unknown) => error,
    );

  // What the app on a phone gives of itself: the token its service gave, its app, and the two
  // keys it made.
  const iphone = (token = Buffer.from(randomBytes(32)).toString("hex")) => ({
    kind: "ios" as const,
    token,
    environment: "production" as const,
    appId: BUNDLE,
    keys: testReceiver().keys,
  });
  const android = (
    token = `${Buffer.from(randomBytes(8)).toString("base64url")}:APA91b${"x".repeat(140)}`,
  ) => ({
    kind: "android" as const,
    token,
    appId: "org.example.app",
    keys: testReceiver().keys,
  });
  const browser = () => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    keys: testReceiver().keys,
  });
  type Phone = ReturnType<typeof iphone> | ReturnType<typeof android>;
  const register = (phone: Phone & { label?: string }, who = "ana", instance: Instance = {}) =>
    call(v1Router.push.registerApp, phone, by(who, instance));
  const devicesOf = async (who: string) =>
    (await call(v1Router.push.devices, undefined, by(who))).devices;
  const rows = () => database.db.select().from(pushSubscription);

  describe("the instance", () => {
    it("says which apps it pushes to", async () => {
      expect(await call(v1Router.push.key, undefined, by("ana"))).toEqual({
        publicKey: INSTANCE_KEY,
        apps: { ios: true, android: true, liveActivities: true },
      });
      expect(
        await call(v1Router.push.key, undefined, by("ana", { appPush: { android: "a-project" } })),
      ).toMatchObject({ apps: { ios: false, android: true, liveActivities: false } });
    });

    it("takes no device of an app it does not push to", async () => {
      for (const [phone, appPush] of [
        [iphone(), { android: "example-project" }],
        [android(), { ios: BUNDLE }],
      ] as const) {
        await expect(register(phone, "ana", { appPush })).rejects.toEqual(
          refusal("SERVICE_UNAVAILABLE"),
        );
      }
      expect(await rows()).toEqual([]);
    });

    it("takes an iPhone only of the app it pushes to", async () => {
      await expect(register({ ...iphone(), appId: "org.example.other" })).rejects.toEqual(
        refusal("BAD_REQUEST"),
      );
      expect(await rows()).toEqual([]);
    });
  });

  describe("switched on", () => {
    it("keeps an iPhone as a device of the account, and answers it without its token or its keys", async () => {
      const phone = iphone();

      const device = await register({ ...phone, label: "  iPhone 17  " });

      expect(device).toEqual({
        id: expect.any(String),
        kind: "ios",
        label: "iPhone 17",
        createdAt: expect.any(Date),
        seenAt: expect.any(Date),
      });
      expect(await rows()).toMatchObject([
        {
          id: device.id,
          userId: "ana",
          sessionId: "s-ana",
          kind: "ios",
          endpoint: null,
          token: phone.token,
          environment: "production",
          appId: BUNDLE,
          ...phone.keys,
        },
      ]);
      expect(await devicesOf("ana")).toEqual([device]);
      expect(await devicesOf("ben")).toEqual([]);
    });

    it("keeps an Android phone, with no environment", async () => {
      const phone = android();

      const device = await register(phone);

      expect(device.kind).toBe("android");
      expect(await rows()).toMatchObject([
        { kind: "android", token: phone.token, environment: null, appId: phone.appId },
      ]);
    });

    it("lists a phone beside a browser, each with its kind", async () => {
      await call(v1Router.push.subscribe, browser(), by("ana"));
      await register(iphone());
      await register(android());

      expect((await devicesOf("ana")).map((device) => device.kind).sort()).toEqual([
        "android",
        "ios",
        "web",
      ]);
    });

    it("keeps an iPhone's token in small letters, so that a phone is one device", async () => {
      const token = Buffer.from(randomBytes(32)).toString("hex");
      const first = await register(iphone(token.toUpperCase()));
      const again = await register(iphone(token));

      expect(again.id).toBe(first.id);
      expect((await rows()).map((row) => row.token)).toEqual([token]);
    });

    it.each([
      [
        "an iPhone's token that is not hexadecimal",
        { ...iphone(), token: `kept-out${"a".repeat(64)}` },
      ],
      ["an iPhone's token that is too short", { ...iphone(), token: "ab".repeat(31) }],
      ["an iPhone's token that is too long", { ...iphone(), token: "a".repeat(201) }],
      ["an iPhone with no environment", { ...iphone(), environment: undefined }],
      ["an iPhone of another environment", { ...iphone(), environment: "staging" }],
      ["an Android phone's token with a letter FCM has not", { ...android(), token: "kept-out/x" }],
      [
        "an Android phone's token that is too long",
        { ...android(), token: `kept-out${"a".repeat(1017)}` },
      ],
      ["an app that is no bundle", { ...android(), appId: "kept out" }],
      ["a kind that is no phone's", { ...android(), kind: "web" }],
    ])("refuses %s, and says nothing of it", async (_what, phone) => {
      const error = await caught(register(phone as Phone));

      expect(error).toEqual(refusal("BAD_REQUEST"));
      expect(told(error)).not.toContain("kept-out");
      expect(await rows()).toEqual([]);
    });

    it("refuses keys that are not a device's", async () => {
      const phone = iphone();
      await expect(
        register({
          ...phone,
          keys: {
            ...phone.keys,
            p256dh: Buffer.from([4, ...Array<number>(64).fill(1)]).toString("base64url"),
          },
        }),
      ).rejects.toEqual(refusal("BAD_REQUEST"));
      expect(await rows()).toEqual([]);
    });

    it("is the same device when the app says so again, seen now, with the name it had", async () => {
      const phone = iphone();
      const first = await register({ ...phone, label: "iPhone 17" });
      await database.db.update(pushSubscription).set({ seenAt: LONG_AGO, createdAt: LONG_AGO });

      const again = await register({ ...phone, keys: testReceiver().keys });

      expect(again).toMatchObject({ id: first.id, label: "iPhone 17", createdAt: LONG_AGO });
      expect(again.seenAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
      expect(await rows()).toHaveLength(1);
    });

    it("goes to the account that signs in on a phone another account was signed in on", async () => {
      const shared = iphone();
      const anas = await register({ ...shared, label: "Ana's phone" }, "ana");

      const bens = await register(shared, "ben");

      expect(bens.id).not.toBe(anas.id);
      expect(bens.label).toBeNull();
      expect(await devicesOf("ana")).toEqual([]);
      expect(await rows()).toMatchObject([{ userId: "ben", token: shared.token }]);
      await expect(
        call(v1Router.push.renewApp, { id: anas.id, ...shared }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));
    });

    it("counts every kind of device together against the ten an account keeps", async () => {
      for (let one = 0; one < 5; one += 1) {
        await call(v1Router.push.subscribe, browser(), by("ana"));
      }
      for (let one = 0; one < 5; one += 1) await register(one % 2 ? iphone() : android());

      expect(await caught(register(iphone()))).toMatchObject({
        code: "FORBIDDEN",
        data: { limit: 10 },
      });
      expect(await caught(call(v1Router.push.subscribe, browser(), by("ana")))).toMatchObject({
        code: "FORBIDDEN",
        data: { limit: 10 },
      });
      expect(await devicesOf("ana")).toHaveLength(10);
    });

    it("still lets one of the ten say its token again", async () => {
      const phones = Array.from({ length: 10 }, () => iphone());
      for (const phone of phones) await register(phone);

      await register(phones[0]!);

      expect(await devicesOf("ana")).toHaveLength(10);
    });
  });

  describe("said again when the app starts", () => {
    it("keeps the token the system gave since, for the same device", async () => {
      const before = iphone();
      const device = await register({ ...before, label: "iPhone 17" });
      await database.db.update(pushSubscription).set({ seenAt: LONG_AGO });
      const after = { ...iphone(), environment: "development" as const };

      const renewed = await call(v1Router.push.renewApp, { id: device.id, ...after }, by("ana"));

      expect(renewed).toMatchObject({ id: device.id, kind: "ios", label: "iPhone 17" });
      expect(renewed.seenAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
      expect(await rows()).toMatchObject([
        { id: device.id, token: after.token, environment: "development", ...after.keys },
      ]);
    });

    it("is the device of the caller's that has its token, without an id", async () => {
      const phone = android();
      const device = await register(phone);

      expect(await call(v1Router.push.renewApp, phone, by("ana"))).toMatchObject({
        id: device.id,
      });
    });

    it("makes no device of one that was removed from another, nor of a token nothing kept", async () => {
      const phone = iphone();
      const device = await register(phone);
      await call(v1Router.push.remove, { id: device.id }, by("ana"));

      for (const asked of [{ id: device.id, ...phone }, phone, iphone()]) {
        await expect(call(v1Router.push.renewApp, asked, by("ana"))).rejects.toEqual(
          refusal("NOT_FOUND"),
        );
      }
      expect(await rows()).toEqual([]);
    });

    it("leaves one device for a phone whose token something else kept", async () => {
      const mine = await register(iphone());
      const taken = iphone();
      await register(taken, "ben");

      await call(v1Router.push.renewApp, { id: mine.id, ...taken }, by("ana"));

      expect(await rows()).toMatchObject([{ id: mine.id, userId: "ana", token: taken.token }]);
    });

    it("does not take another account's phone, and leaves it as it was", async () => {
      const bens = android();
      await register(bens, "ben");
      const before = await rows();

      await expect(call(v1Router.push.renewApp, bens, by("ana"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      expect(await rows()).toEqual(before);
    });

    it("tells a phone from a browser: the id of one names no device of the other", async () => {
      const chrome = browser();
      const web = await call(v1Router.push.subscribe, chrome, by("ana"));
      const phone = iphone();
      const app = await register(phone);

      await expect(
        call(v1Router.push.renewApp, { id: web.id, ...iphone() }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));
      await expect(
        call(v1Router.push.renew, { id: app.id, ...browser() }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));
      // Nor does a phone of the other kind.
      await expect(
        call(v1Router.push.renewApp, { id: app.id, ...android() }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));
      expect(await rows()).toHaveLength(2);
    });

    it("is refused on an instance that no longer pushes to the app", async () => {
      const phone = iphone();
      const device = await register(phone);

      await expect(
        call(
          v1Router.push.renewApp,
          { id: device.id, ...phone },
          by("ana", { appPush: { android: "example-project" } }),
        ),
      ).rejects.toEqual(refusal("SERVICE_UNAVAILABLE"));
    });
  });

  describe("switched off", () => {
    it("is forgotten by its token, once, however an iPhone's is written", async () => {
      const phone = iphone();
      await register(phone);
      const other = await register(android());

      expect(
        await call(
          v1Router.push.forgetApp,
          { kind: "ios", token: phone.token.toUpperCase() },
          by("ana"),
        ),
      ).toEqual({ forgotten: true });
      expect(
        await call(v1Router.push.forgetApp, { kind: "ios", token: phone.token }, by("ana")),
      ).toEqual({ forgotten: false });
      expect(await devicesOf("ana")).toEqual([other]);
    });

    it("leaves another account's phone alone, and says nothing of it", async () => {
      const bens = android();
      await register(bens, "ben");

      expect(
        await call(v1Router.push.forgetApp, { kind: "android", token: bens.token }, by("ana")),
      ).toEqual({ forgotten: false });
      expect(await devicesOf("ben")).toHaveLength(1);
    });

    it("looks for no token that could not have been taken", async () => {
      const unasked = new Proxy(database.db, {
        get: (db, key) => {
          if (key === "delete") throw new Error("the database was asked");
          return Reflect.get(db, key) as unknown;
        },
      });

      expect(
        await call(
          v1Router.push.forgetApp,
          { kind: "ios", token: "not hexadecimal\u0000" },
          by("ana", { db: unasked }),
        ),
      ).toEqual({ forgotten: false });
    });

    it("is removed from another device by its id", async () => {
      const device = await register(iphone());

      expect(await call(v1Router.push.remove, { id: device.id }, by("ana"))).toEqual({
        id: device.id,
      });
      expect(await rows()).toEqual([]);
    });
  });

  describe("kept with the session of its app", () => {
    it("goes when its account signs out on the phone, and no other device does", async () => {
      await register(iphone());
      const elsewhere = await call(
        v1Router.push.registerApp,
        android(),
        by("ana", { session: "s-ana-elsewhere" }),
      );

      await database.db.delete(session).where(eq(session.id, "s-ana"));

      expect((await devicesOf("ana")).map((device) => device.id)).toEqual([elsewhere.id]);
    });

    it("is not made by a session that is no more", async () => {
      await expect(
        call(v1Router.push.registerApp, iphone(), by("ana", { session: "s-signed-out" })),
      ).rejects.toEqual(refusal("UNAUTHORIZED"));
      expect(await rows()).toEqual([]);
    });
  });

  describe("asked by an app that acts for another account", () => {
    it("makes, says again and forgets nothing for it", async () => {
      const phone = iphone();
      const device = await register(phone, "ben");
      const before = await rows();

      for (const asked of [
        call(v1Router.push.registerApp, { ...iphone(), account: "ana" }, by("ben")),
        call(v1Router.push.renewApp, { id: device.id, ...phone, account: "ana" }, by("ben")),
        call(
          v1Router.push.forgetApp,
          { kind: "ios", token: phone.token, account: "ana" },
          by("ben"),
        ),
      ]) {
        await expect(asked).rejects.toEqual(refusal("CONFLICT"));
      }
      expect(await rows()).toEqual(before);
    });
  });

  describe("held by the database", () => {
    it("in the shape of its kind", async () => {
      const keys = testReceiver().keys;
      const wrong = [
        // A browser with a token, a phone with an address, an iPhone without its environment,
        // an Android phone with one, and a phone with no app.
        { kind: "web" as const, endpoint: "https://fcm.googleapis.com/x", token: "a1" },
        {
          kind: "ios" as const,
          endpoint: "https://fcm.googleapis.com/y",
          token: "a2",
          environment: "production" as const,
          appId: BUNDLE,
        },
        { kind: "ios" as const, token: "a3", appId: BUNDLE },
        {
          kind: "android" as const,
          token: "a4",
          environment: "production" as const,
          appId: BUNDLE,
        },
        { kind: "android" as const, token: "a5" },
      ];
      for (const shape of wrong) {
        await expect(
          database.db
            .insert(pushSubscription)
            .values({ id: randomUUID(), userId: "ana", ...keys, ...shape }),
        ).rejects.toThrow();
      }
      expect(await rows()).toEqual([]);
    });
  });

  describe("when the database fails", () => {
    const KEPT_OUT = "ab".repeat(32);
    const failing = new Proxy({} as Context["db"], {
      get: () => {
        const failure = new Error(`Failed query: insert into … params: ${KEPT_OUT}`);
        return () => {
          throw failure;
        };
      },
    });
    const logged = async (work: Promise<unknown>) => {
      const error = await caught(work);
      expect(error).toEqual(refusal("INTERNAL_SERVER_ERROR"));
      return inspect(error, { depth: 10 });
    };

    it("passes on nothing of the token of a phone that registers, says it again or is forgotten", async () => {
      const failingDb = new Proxy(database.db, {
        get: (db, key) => {
          if (key === "transaction" || key === "delete") return Reflect.get(failing, key);
          return Reflect.get(db, key) as unknown;
        },
      });
      const context = by("ana", { db: failingDb });
      for (const work of [
        call(v1Router.push.registerApp, iphone(KEPT_OUT), context),
        call(v1Router.push.renewApp, { id: randomUUID(), ...iphone(KEPT_OUT) }, context),
        call(v1Router.push.forgetApp, { kind: "ios", token: KEPT_OUT }, context),
      ]) {
        expect(await logged(work)).not.toContain(KEPT_OUT);
      }
    });
  });
});
