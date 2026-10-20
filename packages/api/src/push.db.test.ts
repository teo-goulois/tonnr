import { randomUUID } from "node:crypto";
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

// The browsers an account's alerts are pushed to: decision 031, "Push".
describe.skipIf(!TEST_DATABASE_URL)("a browser's push subscription", () => {
  const WEB = "https://app.example.org";
  const AT = new Date("2026-10-12T08:00:00Z");
  const LONG_AGO = new Date("2026-01-01T00:00:00Z");
  // The public key of the instance's pair, made for these tests.
  const INSTANCE_KEY = makeVapidKeys().publicKey;

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
    // Their devices go with the accounts.
    await db.delete(user);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    // Each is signed in in a browser: a device is kept with the session it is made in. Ana
    // is signed in in a second one too.
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

  // An instance that sends push, unless a test says that it holds no key. The caller is in the
  // session a test names, and otherwise in the first of its account.
  type Instance = { pushKey?: string | null; db?: Context["db"]; session?: string };
  const by = (
    id: string,
    { pushKey = INSTANCE_KEY, db = database.db, session: sessionId = `s-${id}` }: Instance = {},
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
      site: WEB,
      adminSites: [],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: AT, webOrigin: WEB, pushKey: pushKey ?? undefined },
    };
    return { context };
  };
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;

  // What a browser's subscription holds: an address at a push service, and two keys of its own.
  const browser = (address = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`) => ({
    endpoint: address,
    keys: testReceiver().keys,
  });
  type Browser = ReturnType<typeof browser>;
  const subscribe = (subscription: Browser & { label?: string }, who = "ana") =>
    call(v1Router.push.subscribe, subscription, by(who));
  const devicesOf = async (who: string) =>
    (await call(v1Router.push.devices, undefined, by(who))).devices;
  const rows = () => database.db.select().from(pushSubscription);
  // What a refusal gives its caller, and what a fault's line in the log would hold.
  const told = (error: unknown) => `${JSON.stringify(error)} ${(error as Error).message}`;
  const caught = (work: Promise<unknown>) =>
    work.then(
      () => {
        throw new Error("answered");
      },
      (error: unknown) => error,
    );

  describe("the instance", () => {
    it("gives the public key of its pair, for a browser to subscribe with", async () => {
      expect(await call(v1Router.push.key, undefined, by("ana"))).toEqual({
        publicKey: INSTANCE_KEY,
        apps: { ios: false, android: false, liveActivities: false },
      });
    });

    it("says that it sends no push when it holds no key, and then takes no subscription", async () => {
      const without = by("ana", { pushKey: null });

      expect(await call(v1Router.push.key, undefined, without)).toEqual({
        publicKey: null,
        apps: { ios: false, android: false, liveActivities: false },
      });
      await expect(call(v1Router.push.subscribe, browser(), without)).rejects.toEqual(
        refusal("SERVICE_UNAVAILABLE"),
      );
      expect(await rows()).toEqual([]);
    });
  });

  describe("switched on", () => {
    it("is kept as a device of the account, and answered without its address or its keys", async () => {
      const chrome = browser();

      const device = await subscribe({ ...chrome, label: "  Chrome · macOS  " });

      expect(device).toEqual({
        id: expect.any(String),
        kind: "web",
        label: "Chrome · macOS",
        createdAt: expect.any(Date),
        seenAt: expect.any(Date),
      });
      expect(await rows()).toMatchObject([
        {
          id: device.id,
          userId: "ana",
          sessionId: "s-ana",
          endpoint: chrome.endpoint,
          ...chrome.keys,
        },
      ]);
      expect(await devicesOf("ana")).toEqual([device]);
      expect(await devicesOf("ben")).toEqual([]);
    });

    it.each([
      "https://fcm.googleapis.com/fcm/send/invented",
      "https://updates.push.services.mozilla.com/wpush/v2/invented",
      "https://web.push.apple.com/invented",
      "https://wns2-par02p.notify.windows.com/w/?token=invented",
    ])("takes the address of a browser's push service: %s", async (address) => {
      await subscribe(browser(address));

      expect((await rows()).map((row) => row.endpoint)).toEqual([address]);
    });

    it.each([
      ["plain http", "http://fcm.googleapis.com/fcm/send/kept-out"],
      ["another host", "https://push.example.org/kept-out"],
      ["this machine", "https://localhost/kept-out"],
      ["a host that only begins like one", "https://fcm.googleapis.com.example.org/kept-out"],
      // A fragment is never sent to the service: with one, a browser would be two devices.
      ["a fragment", "https://fcm.googleapis.com/fcm/send/kept-out#another"],
      ["more than 2048 characters", `https://fcm.googleapis.com/kept-out/${"a".repeat(2013)}`],
      ["no address", "kept-out"],
    ])("refuses %s, and says nothing of the address", async (_what, address) => {
      const error = await caught(subscribe(browser(address)));

      expect(error).toEqual(refusal("BAD_REQUEST"));
      expect(told(error)).not.toContain("kept-out");
      expect(await rows()).toEqual([]);
    });

    it("takes an address of 2048 characters", async () => {
      const long = `https://fcm.googleapis.com/fcm/send/${"a".repeat(2012)}`;
      expect(long).toHaveLength(2048);

      await subscribe(browser(long));

      expect(await rows()).toHaveLength(1);
    });

    it("keeps an address as a URL spells it, so that a browser is one device", async () => {
      const chrome = browser("https://FCM.googleapis.com/fcm/send/one-browser");

      const first = await subscribe(chrome);
      const again = await subscribe({
        ...chrome,
        endpoint: "https://fcm.googleapis.com/fcm/send/one-browser",
      });

      expect(again.id).toBe(first.id);
      expect((await rows()).map((row) => row.endpoint)).toEqual([
        "https://fcm.googleapis.com/fcm/send/one-browser",
      ]);
    });

    it.each([
      ["a public key that is too short", { p256dh: "BAAA" }],
      // 65 bytes that begin with 0, where a point of the curve begins with 4.
      ["a public key that is not an uncompressed point", { p256dh: "A".repeat(87) }],
      // 65 bytes that begin with 4, and are on no curve.
      [
        "a public key that is on no curve",
        { p256dh: Buffer.from([4, ...Array<number>(64).fill(1)]).toString("base64url") },
      ],
      ["a secret that is too short", { auth: "AAAA" }],
      ["a secret with a letter base64url has not", { auth: `${"A".repeat(20)}+A` }],
    ])("refuses %s", async (_what, wrong) => {
      const chrome = browser();

      await expect(subscribe({ ...chrome, keys: { ...chrome.keys, ...wrong } })).rejects.toEqual(
        refusal("BAD_REQUEST"),
      );
      expect(await rows()).toEqual([]);
    });

    // The last letter of a key holds bits that stand for nothing, and are written as zeros: with
    // others, the same bytes would have several spellings.
    it.each(["p256dh", "auth"] as const)(
      "refuses a key whose last letter is not the one its bytes are written with: %s",
      async (name) => {
        const chrome = browser();
        const key = chrome.keys[name];
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        const next = letters[letters.indexOf(key.at(-1)!) + 1]!;
        const respelled = `${key.slice(0, -1)}${next}`;
        expect(Buffer.from(respelled, "base64url")).toEqual(Buffer.from(key, "base64url"));

        await expect(
          subscribe({ ...chrome, keys: { ...chrome.keys, [name]: respelled } }),
        ).rejects.toEqual(refusal("BAD_REQUEST"));
      },
    );

    it.each([
      ["with a control character", "Chrome\u0007"],
      ["of more than 80 characters", "c".repeat(81)],
      ["of blanks alone", "   "],
    ])("refuses a name %s", async (_what, label) => {
      await expect(subscribe({ ...browser(), label })).rejects.toEqual(refusal("BAD_REQUEST"));
    });

    it("is the same device when the browser says so again, seen now, with the name it had", async () => {
      const chrome = browser();
      const first = await subscribe({ ...chrome, label: "Chrome · macOS" });
      await database.db.update(pushSubscription).set({ seenAt: LONG_AGO, createdAt: LONG_AGO });

      // With new keys, as a browser that subscribed anew at the same address would give.
      const again = await subscribe({ ...chrome, keys: browser().keys });

      expect(again).toMatchObject({ id: first.id, label: "Chrome · macOS", createdAt: LONG_AGO });
      expect(again.seenAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
      const kept = await rows();
      expect(kept).toHaveLength(1);
      expect(kept[0]?.p256dh).not.toBe(chrome.keys.p256dh);
    });

    it("goes to the account that subscribes from a browser another account was signed in on", async () => {
      const shared = browser();
      const anas = await subscribe({ ...shared, label: "Ana's name for it" }, "ana");
      await database.db.update(pushSubscription).set({ createdAt: LONG_AGO });

      const bens = await subscribe(shared, "ben");

      // A device of its own: another id, made now, without the name the account before gave.
      expect(bens.id).not.toBe(anas.id);
      expect(bens.label).toBeNull();
      expect(bens.createdAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
      expect(await devicesOf("ana")).toEqual([]);
      expect(await devicesOf("ben")).toEqual([bens]);
      expect(await rows()).toMatchObject([{ userId: "ben", endpoint: shared.endpoint }]);
      // The account before can no longer name it.
      await expect(call(v1Router.push.remove, { id: anas.id }, by("ana"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      await expect(
        call(v1Router.push.renew, { id: anas.id, ...shared }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));
      expect(await devicesOf("ben")).toEqual([bens]);
    });

    describe("ten times", () => {
      const ten = async (who = "ana") => {
        const browsers = Array.from({ length: 10 }, () => browser());
        for (const one of browsers) await subscribe(one, who);
        return browsers;
      };

      it("refuses an eleventh device, and takes one again once another is removed", async () => {
        await ten();
        const eleventh = browser();

        // With how many an account keeps, which tells this refusal from another 403.
        expect(await caught(subscribe(eleventh))).toMatchObject({
          code: "FORBIDDEN",
          data: { limit: 10 },
        });
        expect(await devicesOf("ana")).toHaveLength(10);

        const [first] = await devicesOf("ana");
        await call(v1Router.push.remove, { id: first!.id }, by("ana"));
        await subscribe(eleventh);
        expect(await devicesOf("ana")).toHaveLength(10);
      });

      it("still lets one of the ten say its subscription again", async () => {
        const [first] = await ten();

        await subscribe(first!);

        expect(await devicesOf("ana")).toHaveLength(10);
      });

      it("refuses a browser of another account's as it refuses a new one, and leaves it there", async () => {
        await ten();
        const bens = browser();
        await subscribe(bens, "ben");

        await expect(subscribe(bens, "ana")).rejects.toEqual(refusal("FORBIDDEN"));

        expect(await devicesOf("ben")).toHaveLength(1);
      });

      it("waits for a subscription under way before it counts, so that two at once cannot both pass", async () => {
        const [first] = await ten();
        await call(v1Router.push.forget, { endpoint: first!.endpoint }, by("ana"));
        let go!: () => void;
        let ready!: () => void;
        const gate = new Promise<void>((resolve) => (go = resolve));
        const isReady = new Promise<void>((resolve) => (ready = resolve));

        // A subscription under way, as the API makes it: the account is held, then its tenth
        // device is written. It has not ended when the next one is asked.
        const underWay = database.db.transaction(async (tx) => {
          await tx.select().from(user).where(eq(user.id, "ana")).for("update");
          const tenth = browser();
          await tx.insert(pushSubscription).values({
            id: crypto.randomUUID(),
            userId: "ana",
            endpoint: tenth.endpoint,
            ...tenth.keys,
          });
          ready();
          await gate;
        });
        await isReady;
        const asked = caught(subscribe(browser()));
        await new Promise((resolve) => setTimeout(resolve, 150));
        go();
        await underWay;

        expect(await asked).toEqual(refusal("FORBIDDEN"));
        expect(await devicesOf("ana")).toHaveLength(10);
      });
    });
  });

  describe("said again when the app loads", () => {
    it("keeps the address the push service gave since, for the same device", async () => {
      const before = browser();
      const device = await subscribe({ ...before, label: "Firefox · Linux" });
      await database.db.update(pushSubscription).set({ seenAt: LONG_AGO });
      const after = browser("https://updates.push.services.mozilla.com/wpush/v2/another");

      const renewed = await call(v1Router.push.renew, { id: device.id, ...after }, by("ana"));

      expect(renewed).toMatchObject({ id: device.id, label: "Firefox · Linux" });
      expect(renewed.seenAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
      expect(await rows()).toMatchObject([
        { id: device.id, userId: "ana", endpoint: after.endpoint, ...after.keys },
      ]);
    });

    it("makes no device of one that was removed from another", async () => {
      const chrome = browser();
      const device = await subscribe(chrome);
      await call(v1Router.push.remove, { id: device.id }, by("ana"));

      await expect(
        call(v1Router.push.renew, { id: device.id, ...chrome }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));

      expect(await rows()).toEqual([]);
    });

    it("says nothing of another account's device, and leaves it as it was", async () => {
      const bens = browser();
      const device = await subscribe(bens, "ben");
      const before = await rows();

      await expect(
        call(v1Router.push.renew, { id: device.id, ...browser() }, by("ana")),
      ).rejects.toEqual(refusal("NOT_FOUND"));

      expect(await rows()).toEqual(before);
    });

    it("leaves one device for a browser whose address something else kept", async () => {
      const mine = await subscribe(browser());
      const taken = browser();
      await subscribe(taken, "ben");

      await call(v1Router.push.renew, { id: mine.id, ...taken }, by("ana"));

      expect(await rows()).toMatchObject([
        { id: mine.id, userId: "ana", endpoint: taken.endpoint },
      ]);
    });

    it("is refused on an instance that holds no key any more", async () => {
      const chrome = browser();
      const device = await subscribe(chrome);

      await expect(
        call(v1Router.push.renew, { id: device.id, ...chrome }, by("ana", { pushKey: null })),
      ).rejects.toEqual(refusal("SERVICE_UNAVAILABLE"));
    });

    describe("by a browser that kept no id", () => {
      it("is the device of the caller's that has its address", async () => {
        const chrome = browser();
        const device = await subscribe({ ...chrome, label: "Chrome · macOS" });
        await subscribe(browser());
        await database.db.update(pushSubscription).set({ seenAt: LONG_AGO });

        const renewed = await call(
          v1Router.push.renew,
          { ...chrome, keys: browser().keys },
          by("ana"),
        );

        expect(renewed).toMatchObject({ id: device.id, label: "Chrome · macOS" });
        expect(renewed.seenAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
        expect(await devicesOf("ana")).toHaveLength(2);
      });

      it("is that device too for a browser whose id names none of the caller's", async () => {
        const chrome = browser();
        const device = await subscribe(chrome);
        const bens = await subscribe(browser(), "ben");

        for (const id of [crypto.randomUUID(), bens.id]) {
          expect(await call(v1Router.push.renew, { id, ...chrome }, by("ana"))).toMatchObject({
            id: device.id,
          });
        }
        expect(await devicesOf("ben")).toEqual([bens]);
      });

      it("makes no device, of an address nothing kept or of one that was removed", async () => {
        const chrome = browser();
        const device = await subscribe(chrome);
        await call(v1Router.push.remove, { id: device.id }, by("ana"));

        for (const one of [chrome, browser()]) {
          await expect(call(v1Router.push.renew, one, by("ana"))).rejects.toEqual(
            refusal("NOT_FOUND"),
          );
        }

        expect(await rows()).toEqual([]);
      });

      it("does not take another account's browser, and leaves it as it was", async () => {
        const bens = browser();
        await subscribe(bens, "ben");
        const before = await rows();

        await expect(call(v1Router.push.renew, bens, by("ana"))).rejects.toEqual(
          refusal("NOT_FOUND"),
        );

        expect(await rows()).toEqual(before);
      });
    });

    it("waits for a subscription of its account under way, which then counts the device once", async () => {
      const device = await subscribe(browser());
      let go!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>((resolve) => (go = resolve));
      const isReady = new Promise<void>((resolve) => (ready = resolve));

      // A subscription under way, as the API makes it: the account is held while its devices
      // are counted and one is written.
      const underWay = database.db.transaction(async (tx) => {
        await tx.select().from(user).where(eq(user.id, "ana")).for("update");
        ready();
        await gate;
      });
      await isReady;
      let answered = false;
      const asked = call(v1Router.push.renew, { id: device.id, ...browser() }, by("ana")).then(
        () => (answered = true),
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      const waited = !answered;
      go();
      await Promise.all([underWay, asked]);

      expect(waited).toBe(true);
    });

    it("holds nothing while it waits for what else kept the address, so that two cannot wait for one another", async () => {
      // Two devices whose ids are in a known order: the caller's comes last.
      const [first, last] = [crypto.randomUUID(), crypto.randomUUID()].sort();
      const mine = browser();
      const other = browser();
      await database.db.insert(pushSubscription).values([
        { id: last!, userId: "ana", endpoint: mine.endpoint, ...mine.keys },
        { id: first!, userId: "ben", endpoint: other.endpoint, ...other.keys },
      ]);
      let go!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>((resolve) => (go = resolve));
      const isReady = new Promise<void>((resolve) => (ready = resolve));

      // Someone holds the other device, as a request that says its address again does.
      const underWay = database.db.transaction(async (tx) => {
        await tx
          .select()
          .from(pushSubscription)
          .where(eq(pushSubscription.id, first!))
          .for("update");
        ready();
        await gate;
      });
      await isReady;
      // The caller's browser says the other device's address: it waits for that device.
      const asked = call(v1Router.push.renew, { id: last!, ...other }, by("ana"));
      await new Promise((resolve) => setTimeout(resolve, 150));
      // Meanwhile its own device is free: whoever holds the other one could take it.
      const free = await database.db.transaction((tx) =>
        tx
          .select({ id: pushSubscription.id })
          .from(pushSubscription)
          .where(eq(pushSubscription.id, last!))
          .for("update", { noWait: true }),
      );
      go();
      await Promise.all([underWay, asked]);

      expect(free).toEqual([{ id: last }]);
      expect(await rows()).toMatchObject([{ id: last, userId: "ana", endpoint: other.endpoint }]);
    });

    it("lets two browsers that say one another's address both be answered", async () => {
      for (let round = 0; round < 5; round += 1) {
        await database.db.delete(pushSubscription);
        const [anas, bens] = [browser(), browser()];
        const [a, b] = [await subscribe(anas, "ana"), await subscribe(bens, "ben")];

        const both = await Promise.allSettled([
          call(v1Router.push.renew, { id: a.id, ...bens }, by("ana")),
          call(v1Router.push.renew, { id: b.id, ...anas }, by("ben")),
        ]);

        // One takes the other's address, and the other is told that its device is gone: never
        // a fault.
        const codes = both.map((one) =>
          one.status === "fulfilled" ? "answered" : (one.reason as { code?: string }).code,
        );
        expect(codes.sort()).toEqual(["NOT_FOUND", "answered"]);
        expect(await rows()).toHaveLength(1);
      }
    });
  });

  describe("named", () => {
    // An id goes into a URL and into what is logged of a query that failed: it is one the API
    // made, and never a text a caller chose, such as an address.
    const ADDRESS = "https://fcm.googleapis.com/fcm/send/kept-out";

    it.each([
      ["an address", ADDRESS],
      ["a text the database refuses", "kept-out\u0000"],
      ["a name", "kept-out"],
    ])("by no id that is %s", async (_what, id) => {
      for (const asked of [
        call(v1Router.push.renew, { id, ...browser() }, by("ana")),
        call(v1Router.push.remove, { id }, by("ana")),
      ]) {
        const error = await caught(asked);
        expect(error).toEqual(refusal("BAD_REQUEST"));
        expect(told(error)).not.toContain("kept-out");
      }
    });

    it("in the same words for a device that never was as for another account's", async () => {
      const bens = await subscribe(browser(), "ben");
      const never = crypto.randomUUID();

      const refusals = [
        await caught(call(v1Router.push.remove, { id: bens.id }, by("ana"))),
        await caught(call(v1Router.push.remove, { id: never }, by("ana"))),
        await caught(call(v1Router.push.renew, { id: bens.id, ...browser() }, by("ana"))),
        await caught(call(v1Router.push.renew, { id: never, ...browser() }, by("ana"))),
      ].map(told);

      expect(new Set(refusals).size).toBe(1);
      expect(refusals[0]).not.toContain(never);
    });
  });

  describe("kept with the session of its browser", () => {
    const signOut = (id: string) => database.db.delete(session).where(eq(session.id, id));

    it("goes when its account signs out there, and no other device does", async () => {
      const here = await subscribe(browser());
      const elsewhere = await call(
        v1Router.push.subscribe,
        browser(),
        by("ana", { session: "s-ana-elsewhere" }),
      );
      await subscribe(browser(), "ben");

      // As signing out does: the session is deleted.
      await signOut("s-ana");

      expect((await devicesOf("ana")).map((device) => device.id)).toEqual([elsewhere.id]);
      expect(await devicesOf("ben")).toHaveLength(1);
      expect((await rows()).map((row) => row.id)).not.toContain(here.id);
    });

    it("is the device of the session that last said it again, and goes with that one", async () => {
      const chrome = browser();
      const device = await subscribe(chrome);

      // The browser signed in anew, and its app loads.
      await call(
        v1Router.push.renew,
        { id: device.id, ...chrome },
        by("ana", { session: "s-ana-elsewhere" }),
      );
      await signOut("s-ana");
      expect(await devicesOf("ana")).toHaveLength(1);

      await signOut("s-ana-elsewhere");
      expect(await rows()).toEqual([]);
    });

    it("is the device of the session that subscribes again from the same browser", async () => {
      const chrome = browser();
      await subscribe(chrome);

      await call(v1Router.push.subscribe, chrome, by("ana", { session: "s-ana-elsewhere" }));

      expect((await rows()).map((row) => row.sessionId)).toEqual(["s-ana-elsewhere"]);
    });

    it("is not made, nor said again, by a session that is no more", async () => {
      const chrome = browser();
      const device = await subscribe(chrome);
      const gone = by("ana", { session: "s-signed-out" });

      await expect(call(v1Router.push.subscribe, browser(), gone)).rejects.toEqual(
        refusal("UNAUTHORIZED"),
      );
      await expect(call(v1Router.push.renew, { id: device.id, ...chrome }, gone)).rejects.toEqual(
        refusal("UNAUTHORIZED"),
      );
      expect(await rows()).toMatchObject([{ id: device.id, sessionId: "s-ana" }]);
    });

    it("is not made by another account's session, whatever the caller is said to be", async () => {
      // A session of Ben's, in a request that says it is Ana's.
      await expect(
        call(v1Router.push.subscribe, browser(), by("ana", { session: "s-ben" })),
      ).rejects.toEqual(refusal("UNAUTHORIZED"));
      expect(await rows()).toEqual([]);
    });

    it("waits for a sign-out under way, and is then refused", async () => {
      let go!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>((resolve) => (go = resolve));
      const isReady = new Promise<void>((resolve) => (ready = resolve));

      // A sign-out under way: the session is being deleted, and its devices with it.
      const signingOut = database.db.transaction(async (tx) => {
        await tx.delete(session).where(eq(session.id, "s-ana"));
        ready();
        await gate;
      });
      await isReady;
      const asked = caught(subscribe(browser()));
      await new Promise((resolve) => setTimeout(resolve, 150));
      go();
      await signingOut;

      expect(await asked).toEqual(refusal("UNAUTHORIZED"));
      expect(await rows()).toEqual([]);
    });
  });

  describe("asked by a page that was opened for another account", () => {
    it("makes no device for the account that is signed in now, and says so", async () => {
      // Ben signed in where Ana's page is still open: her page acts with his session.
      await expect(
        call(v1Router.push.subscribe, { ...browser(), account: "ana" }, by("ben")),
      ).rejects.toEqual(refusal("CONFLICT"));
      expect(await rows()).toEqual([]);
    });

    it("says nothing again for it", async () => {
      const chrome = browser();
      const device = await subscribe(chrome, "ben");
      const before = await rows();

      await expect(
        call(v1Router.push.renew, { id: device.id, ...chrome, account: "ana" }, by("ben")),
      ).rejects.toEqual(refusal("CONFLICT"));
      expect(await rows()).toEqual(before);
    });

    it("forgets and removes nothing for it", async () => {
      const chrome = browser();
      const device = await subscribe(chrome, "ben");
      const before = await rows();

      // Her page switches push off, or removes a device, with his session.
      await expect(
        call(v1Router.push.forget, { endpoint: chrome.endpoint, account: "ana" }, by("ben")),
      ).rejects.toEqual(refusal("CONFLICT"));
      await expect(
        call(v1Router.push.remove, { id: device.id, account: "ana" }, by("ben")),
      ).rejects.toEqual(refusal("CONFLICT"));
      expect(await rows()).toEqual(before);

      // His own page does both.
      expect(
        await call(v1Router.push.remove, { id: device.id, account: "ben" }, by("ben")),
      ).toEqual({ id: device.id });
      expect(
        await call(v1Router.push.forget, { endpoint: chrome.endpoint, account: "ben" }, by("ben")),
      ).toEqual({ forgotten: false });
    });

    it("answers a page that names the account that is signed in", async () => {
      const chrome = browser();

      const device = await call(v1Router.push.subscribe, { ...chrome, account: "ana" }, by("ana"));

      expect(
        await call(v1Router.push.renew, { id: device.id, ...chrome, account: "ana" }, by("ana")),
      ).toMatchObject({ id: device.id });
    });
  });

  describe("switched off", () => {
    it("is forgotten by its address, once", async () => {
      const chrome = browser();
      await subscribe(chrome);
      const other = await subscribe(browser());

      expect(await call(v1Router.push.forget, { endpoint: chrome.endpoint }, by("ana"))).toEqual({
        forgotten: true,
      });
      expect(await call(v1Router.push.forget, { endpoint: chrome.endpoint }, by("ana"))).toEqual({
        forgotten: false,
      });
      expect(await devicesOf("ana")).toEqual([other]);
    });

    it("is forgotten however its address is written", async () => {
      await subscribe(browser("https://fcm.googleapis.com/fcm/send/one-browser"));

      expect(
        await call(
          v1Router.push.forget,
          { endpoint: "https://FCM.googleapis.com/fcm/send/one-browser" },
          by("ana"),
        ),
      ).toEqual({ forgotten: true });
    });

    it("leaves another account's browser alone, and says nothing of it", async () => {
      const bens = browser();
      await subscribe(bens, "ben");

      expect(await call(v1Router.push.forget, { endpoint: bens.endpoint }, by("ana"))).toEqual({
        forgotten: false,
      });
      expect(await devicesOf("ben")).toHaveLength(1);
    });

    it("looks for no address that could not have been taken", async () => {
      // The database would refuse this one, and say what it was given.
      const unasked = new Proxy(database.db, {
        get: (db, key) => {
          if (key === "delete") throw new Error("the database was asked");
          return Reflect.get(db, key) as unknown;
        },
      });

      expect(
        await call(
          v1Router.push.forget,
          { endpoint: "https://push.example.org/\u0000" },
          by("ana", { db: unasked }),
        ),
      ).toEqual({ forgotten: false });
    });
  });

  describe("removed from another device", () => {
    it("goes by its id, and is the account's own to remove", async () => {
      const phone = await subscribe(browser());
      const laptop = await subscribe(browser());

      await expect(call(v1Router.push.remove, { id: phone.id }, by("ben"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      expect(await call(v1Router.push.remove, { id: phone.id }, by("ana"))).toEqual({
        id: phone.id,
      });
      await expect(call(v1Router.push.remove, { id: phone.id }, by("ana"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      expect(await devicesOf("ana")).toEqual([laptop]);
    });
  });

  describe("listed", () => {
    it("gives the account's devices, the oldest first, and nothing a push could be sent with", async () => {
      const two = [await subscribe(browser()), await subscribe(browser())];
      // The older of the two is the one whose id would come last.
      const [newer, older] = two.sort((a, b) => a.id.localeCompare(b.id, "en"));
      await database.db
        .update(pushSubscription)
        .set({ createdAt: LONG_AGO })
        .where(eq(pushSubscription.id, older!.id));
      await subscribe(browser(), "ben");

      const devices = await devicesOf("ana");

      expect(devices.map((device) => device.id)).toEqual([older!.id, newer!.id]);
      expect(devices.map((device) => Object.keys(device).sort())).toEqual(
        Array(2).fill(["createdAt", "id", "kind", "label", "seenAt"]),
      );
    });
  });

  describe("when the database fails", () => {
    // The database says what a failed query was given: the address, and the keys.
    const failing = (said: string) =>
      new Proxy(database.db, {
        get: (db, key) => {
          const failure = new Error(`Failed query: insert into … params: ${said}`);
          // A transaction fails as it ends, and a statement as soon as it is built here.
          if (key === "transaction") return () => Promise.reject(failure);
          if (key === "delete") {
            return () => {
              throw failure;
            };
          }
          return Reflect.get(db, key) as unknown;
        },
      });

    const KEPT_OUT = "https://fcm.googleapis.com/fcm/send/kept-out";
    // As the server logs a fault: the error, whole.
    const logged = async (work: (context: ReturnType<typeof by>) => Promise<unknown>) => {
      const error = await caught(work(by("ana", { db: failing(KEPT_OUT) })));
      expect(error).toEqual(refusal("INTERNAL_SERVER_ERROR"));
      return inspect(error, { depth: 10 });
    };

    it("passes on nothing of the address of a browser that subscribes", async () => {
      expect(
        await logged((context) => call(v1Router.push.subscribe, browser(KEPT_OUT), context)),
      ).not.toContain("kept-out");
    });

    it("passes on nothing of the address of a browser that says it again", async () => {
      expect(
        await logged((context) =>
          call(v1Router.push.renew, { id: crypto.randomUUID(), ...browser(KEPT_OUT) }, context),
        ),
      ).not.toContain("kept-out");
    });

    it("passes on nothing of the address of a browser that is forgotten", async () => {
      expect(
        await logged((context) => call(v1Router.push.forget, { endpoint: KEPT_OUT }, context)),
      ).not.toContain("kept-out");
    });

    it("passes on nothing of what the database says when a device is removed", async () => {
      expect(
        await logged((context) => call(v1Router.push.remove, { id: crypto.randomUUID() }, context)),
      ).not.toContain("kept-out");
    });
  });
});
