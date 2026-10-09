import { call, isLazy, isProcedure, lazy, unlazy } from "@orpc/server";
import type { Session } from "@repo/auth";
import { testForecasts } from "@repo/conditions/forecasts/testing";

import { testVerification } from "./testing";
import { apiKey, developer, operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { spot, surfBreak, surfBreakRecord } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { publicProcedure } from "./index";
import { procedureName } from "./procedures";
import { appRouter, v1Router } from "./routers/index";
import { createUsage, type Usage } from "./usage";

const KEY = /^key_[A-Za-z0-9_-]{43}$/;
const AT = new Date("2026-10-09T08:00:00Z");
// Where a request says it comes from: the admin app, the web app, or the API's own pages.
const ADMIN = "https://admin.example.org";
const WEB = "https://app.example.org";

type Named = [name: string, procedure: never];

// Every procedure of a router, with its path. None of them is named here: a procedure added
// later is checked without anyone thinking of it. A part of the router that is loaded only when
// it is called is loaded here, so that it hides nothing.
async function proceduresOf(router: object, path: string[] = []): Promise<Named[]> {
  const found: Named[] = [];
  for (const [key, value] of Object.entries(router)) {
    const node: object = isLazy(value) ? (await unlazy(value)).default : value;
    if (isProcedure(node)) found.push([[...path, key].join("."), node as never]);
    else found.push(...(await proceduresOf(node, [...path, key])));
  }
  return found;
}

const everyProcedure = await proceduresOf(appRouter);
const everyName = everyProcedure.map(([name]) => name);

// The procedures a key may call: the data everyone shares. Each is named, so that a new
// procedure answers a key only once someone adds it here on purpose.
const ANSWERS_A_KEY = [
  "v1.breaks.get",
  "v1.breaks.list",
  "v1.forecasts.get",
  "v1.maps.waveHeight",
  "v1.spots.conditions",
  "v1.spots.get",
  "v1.stations.get",
  "v1.stations.list",
  "v1.stations.readings",
  "v1.tides.extremes",
  "v1.tides.timeline",
];
const takesASession = everyProcedure.filter(
  ([name]) => name !== "healthCheck" && !ANSWERS_A_KEY.includes(name),
);

// The procedures any account may call with its session: what the account owns.
const ANSWERS_AN_ACCOUNT = [
  "preferences.getShortcuts",
  "preferences.saveShortcuts",
  "privateData",
  "v1.account.get",
  "v1.account.sendVerification",
  // What a member of a developer account reads of it. The door is an account's: who is a
  // member of what is held by each of them, and tested with them.
  "v1.console.breakdown",
  "v1.console.get",
  "v1.console.series",
  "v1.lists.addBreak",
  "v1.lists.addStation",
  "v1.lists.create",
  "v1.lists.delete",
  "v1.lists.list",
  "v1.lists.removeBreak",
  "v1.lists.removeStation",
  "v1.lists.update",
  "v1.notifications.list",
  "v1.notifications.markRead",
  "v1.spots.create",
  "v1.spots.delete",
  "v1.spots.list",
  "v1.spots.update",
];
// The procedures that take an operator's session, from the web app as well: what the instance
// keeps to its operator. None does since decision 024 gave the catalogue every break.
const ANSWERS_AN_OPERATOR: string[] = [];
// Every other procedure runs the instance, and takes an operator's session from the admin's
// site. None is named: a procedure added later is held to that until someone names it above.
const named = ["healthCheck", ...ANSWERS_A_KEY, ...ANSWERS_AN_ACCOUNT, ...ANSWERS_AN_OPERATOR];
const runsTheInstance = everyProcedure.filter(([name]) => !named.includes(name));
const keptFromAnAccount = everyProcedure.filter(
  ([name]) => name !== "healthCheck" && ![...ANSWERS_A_KEY, ...ANSWERS_AN_ACCOUNT].includes(name),
);
// What a procedure does with a caller it accepts and no input: it answers, or refuses the input.
const PAST_THE_DOOR = ["answered", "BAD_REQUEST", "NOT_FOUND"];

const wait = (milliseconds: number) =>
  new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), milliseconds));

describe.skipIf(!TEST_DATABASE_URL)("who the API answers", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  // No test asks the forecast provider: a function stands for it.
  const { forecasts } = testForecasts();

  beforeAll(async () => {
    database = await createTestDatabase();
    // Counted in memory, and written only when a test asks.
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(surfBreak);
    // Their keys and their counts go with the developer accounts.
    await db.delete(developer);
    // Their spots, keys and operator rows go with the accounts.
    await db.delete(user);
    await db.insert(user).values([
      { id: "owner", name: "Owner", email: "owner@example.org" },
      { id: "second", name: "Second", email: "second@example.org" },
      { id: "visitor", name: "Visitor", email: "visitor@example.org" },
    ]);
    await db.insert(operator).values([{ userId: "owner" }, { userId: "second" }]);
  });

  // A session as the sign-in library gives it, for one of the accounts above.
  function sessionOf(id: string): Session {
    const account = { id, name: id, email: `${id}@example.org`, emailVerified: false, image: null };
    const session = { id: `session-${id}`, userId: id, token: `token-${id}`, expiresAt: AT };
    const dates = { createdAt: AT, updatedAt: AT };
    return {
      user: { ...account, ...dates },
      session: { ...session, ...dates, ipAddress: null, userAgent: null },
    } as Session;
  }
  // A request comes from the admin's site unless a test says otherwise.
  type By = { session?: string; authorization?: string; site?: string | null };
  const context = (by: By = {}): Context => ({
    db: database.db,
    session: by.session ? sessionOf(by.session) : null,
    authorization: by.authorization ?? null,
    site: by.site === undefined ? ADMIN : by.site,
    adminSites: [ADMIN],
    usage,
    server: { startedAt: AT, webOrigin: WEB },
    forecasts,
    // An instance that sends no mail: no test sends one.
    verification: testVerification(database.db, { on: false }).verification,
    reply: {},
  });
  const bySession = (id: string, site?: string | null) => ({
    context: context({ session: id, site }),
  });
  const byKey = (key: string) => ({ context: context({ authorization: `Bearer ${key}` }) });
  // Made when a test runs: the database is not there before.
  const anonymous = () => ({ context: context() });

  const makeDeveloper = (name = "a developer", callsPerHour: number | null = null) =>
    call(v1Router.developers.create, { name, callsPerHour }, bySession("owner"));
  // A key of a developer account made for it, unless the test names one.
  const makeKey = async (by = "owner", name = "a program", developerId?: string) =>
    call(
      v1Router.keys.create,
      { name, developerId: developerId ?? (await makeDeveloper()).id },
      bySession(by),
    );
  const stations = (options: { context: Context }) => call(v1Router.stations.list, {}, options);
  const refusal = (code: string) => expect.objectContaining({ code });

  describe("without a caller", () => {
    it("answers the health check", async () => {
      expect(await call(appRouter.healthCheck, undefined, anonymous())).toBe("OK");
    });

    it.each(everyProcedure.filter(([name]) => name !== "healthCheck"))(
      "refuses %s",
      async (_, procedure) => {
        await expect(call(procedure, undefined as never, anonymous())).rejects.toEqual(
          refusal("UNAUTHORIZED"),
        );
      },
    );

    it("checks every procedure there is", () => {
      expect(everyProcedure.length).toBeGreaterThan(30);
      expect(everyName).toContain("v1.stations.list");
    });

    it("finds the procedures of a part of the router that loads late", async () => {
      const late = lazy(async () => ({
        default: { deep: { open: publicProcedure.handler(() => "open") } },
      }));

      expect((await proceduresOf({ early: {}, late })).map(([name]) => name)).toEqual([
        "late.deep.open",
      ]);
    });
  });

  describe("with a session", () => {
    it("answers any account with the data everyone shares", async () => {
      expect(await stations(bySession("visitor"))).toEqual({ stations: [] });
      expect(await call(v1Router.breaks.list, {}, bySession("visitor"))).toEqual({
        breaks: [],
        next: null,
      });
    });

    it("tells an account who it is, and whether it runs the instance", async () => {
      expect(await call(v1Router.account.get, undefined, bySession("owner"))).toEqual({
        id: "owner",
        name: "owner",
        email: "owner@example.org",
        isOperator: true,
        emailVerified: false,
        checksAddresses: false,
      });
      expect(await call(v1Router.account.get, undefined, bySession("visitor"))).toMatchObject({
        id: "visitor",
        isOperator: false,
      });
    });
  });

  describe("with the session of an account that is no operator", () => {
    it.each(everyProcedure.filter(([name]) => ANSWERS_AN_ACCOUNT.includes(name)))(
      "gets past the door of %s, from the web app",
      async (_, procedure) => {
        const outcome = await call(procedure, undefined as never, bySession("visitor", WEB)).then(
          () => "answered",
          (error: { code?: string }) => error.code,
        );
        expect(PAST_THE_DOOR).toContain(outcome);
      },
    );

    it.each(keptFromAnAccount)("is refused %s, from the admin's site too", async (_, procedure) => {
      for (const site of [ADMIN, WEB]) {
        await expect(
          call(procedure, undefined as never, bySession("visitor", site)),
        ).rejects.toEqual(refusal("FORBIDDEN"));
      }
    });

    it("is named for every procedure it may call", () => {
      const all = [...ANSWERS_AN_ACCOUNT, ...ANSWERS_AN_OPERATOR];
      expect(all.filter((name) => !everyName.includes(name))).toEqual([]);
    });
  });

  describe("with the session of an operator", () => {
    it.each(everyProcedure.filter(([name]) => ANSWERS_AN_OPERATOR.includes(name)))(
      "gets past the door of %s, from the web app",
      async (_, procedure) => {
        const outcome = await call(procedure, undefined as never, bySession("owner", WEB)).then(
          () => "answered",
          (error: { code?: string }) => error.code,
        );
        expect(PAST_THE_DOOR).toContain(outcome);
      },
    );

    it("finds what runs the instance, and nothing that a later change left unnamed by mistake", () => {
      expect(runsTheInstance.map(([name]) => name)).toEqual([
        "v1.accounts.list",
        "v1.accounts.get",
        "v1.accounts.signOut",
        "v1.accounts.update",
        "v1.actions.list",
        "v1.developers.list",
        "v1.developers.create",
        "v1.developers.update",
        "v1.developers.delete",
        "v1.developers.members",
        "v1.developers.addMember",
        "v1.developers.removeMember",
        "v1.instance.state",
        "v1.keys.list",
        "v1.keys.create",
        "v1.keys.revoke",
        "v1.usage.series",
        "v1.usage.breakdown",
      ]);
    });

    it.each(runsTheInstance)(
      "gets past the door of %s from the admin's site",
      async (_, procedure) => {
        const outcome = await call(procedure, undefined as never, bySession("owner", ADMIN)).then(
          () => "answered",
          (error: { code?: string }) => error.code,
        );
        expect(PAST_THE_DOOR).toContain(outcome);
      },
    );

    it.each(runsTheInstance)(
      "is refused %s from the web app, from a site it does not know, and from none",
      async (_, procedure) => {
        // `null` in words is what a page without an origin of its own sends.
        for (const site of [WEB, "https://elsewhere.example", "null", `${ADMIN}.example`, null]) {
          await expect(
            call(procedure, undefined as never, bySession("owner", site)),
          ).rejects.toEqual(refusal("FORBIDDEN"));
        }
      },
    );

    it("makes nothing and changes nothing from the web app", async () => {
      const made = await makeDeveloper();
      const fromWeb = bySession("owner", WEB);

      await expect(
        call(v1Router.keys.create, { name: "mine", developerId: made.id }, fromWeb),
      ).rejects.toEqual(refusal("FORBIDDEN"));
      await expect(
        call(v1Router.developers.update, { id: made.id, suspended: true }, fromWeb),
      ).rejects.toEqual(refusal("FORBIDDEN"));
      await expect(call(v1Router.developers.delete, { id: made.id }, fromWeb)).rejects.toEqual(
        refusal("FORBIDDEN"),
      );

      expect(await database.db.select().from(apiKey)).toEqual([]);
      expect(await database.db.select().from(developer)).toMatchObject([
        { id: made.id, suspendedAt: null },
      ]);
    });
  });

  describe("a procedure's name", () => {
    it("is its place in the router, for every procedure", () => {
      for (const [name, procedure] of everyProcedure) expect(procedureName(procedure)).toBe(name);
    });
  });

  describe("with a key", () => {
    it("answers with the data everyone shares", async () => {
      const { key } = await makeKey();

      expect(await stations(byKey(key))).toEqual({ stations: [] });
      expect(await stations({ context: context({ authorization: `bearer ${key}` }) })).toEqual({
        stations: [],
      });
    });

    it.each(takesASession)("is refused %s, which takes a session", async (_, procedure) => {
      const { key } = await makeKey();

      await expect(call(procedure, undefined as never, byKey(key))).rejects.toEqual(
        refusal("FORBIDDEN"),
      );
    });

    it("is named for every procedure it may call", () => {
      expect(ANSWERS_A_KEY.filter((name) => !everyName.includes(name))).toEqual([]);
    });

    // The map's procedure takes no input, so calling it would ask the forecast provider.
    it.each(
      everyProcedure.filter(([name]) => ANSWERS_A_KEY.includes(name) && !name.includes("maps")),
    )("gets past the door of %s", async (_, procedure) => {
      const { key } = await makeKey();

      // No input is given: the procedure refuses that, or answers if it asks for none.
      const outcome = await call(procedure, undefined as never, byKey(key)).then(
        () => "answered",
        (error: { code?: string }) => error.code,
      );
      expect(["answered", "BAD_REQUEST"]).toContain(outcome);
    });

    it("is refused there even with the session of its maker beside it", async () => {
      const { key } = await makeKey();
      const both = { context: context({ session: "owner", authorization: `Bearer ${key}` }) };

      await expect(call(v1Router.keys.list, {}, both)).rejects.toEqual(refusal("FORBIDDEN"));
    });

    it("sees a spot as a stranger does, its maker's too", async () => {
      await database.db.insert(spot).values([
        {
          id: "shown",
          userId: "owner",
          name: "Shown",
          latitude: 48,
          longitude: -4.5,
          criteria: {},
          visibility: "public",
        },
        { id: "kept", userId: "owner", name: "Kept", latitude: 48, longitude: -4.5, criteria: {} },
      ]);
      const { key } = await makeKey();

      expect(await call(v1Router.spots.get, { id: "shown" }, byKey(key))).toMatchObject({
        name: "Shown",
      });
      // Alone, or with its maker's session beside it: a key is judged as a key.
      const both = { context: context({ session: "owner", authorization: `Bearer ${key}` }) };
      for (const caller of [byKey(key), both]) {
        await expect(call(v1Router.spots.get, { id: "kept" }, caller)).rejects.toEqual(
          refusal("NOT_FOUND"),
        );
        await expect(call(v1Router.spots.conditions, { id: "kept" }, caller)).rejects.toEqual(
          refusal("NOT_FOUND"),
        );
      }
      expect(await call(v1Router.spots.get, { id: "kept" }, bySession("owner"))).toMatchObject({
        name: "Kept",
      });
    });

    it.each([
      ["a key nobody made", `Bearer key_${"a".repeat(43)}`],
      ["a key cut short", `Bearer key_${"a".repeat(42)}`],
      ["a key with a character no key has", `Bearer key_${"a".repeat(42)}!`],
      ["a key without its scheme", `key_${"a".repeat(43)}`],
      ["another scheme", "Basic b3duZXI6cGFzc3dvcmQ="],
      ["two keys", `Bearer key_${"a".repeat(43)} key_${"b".repeat(43)}`],
      ["a space after the key", `Bearer key_${"a".repeat(43)} `],
      ["two spaces before the key", `Bearer  key_${"a".repeat(43)}`],
      ["a session's token", "Bearer token-owner"],
      ["nothing after the scheme", "Bearer "],
      ["an empty header", ""],
      ["a header too long to be read", `Bearer ${"a".repeat(4000)}`],
    ])("refuses %s, and does not fall back on the session", async (_, authorization) => {
      await expect(stations({ context: context({ authorization }) })).rejects.toEqual(
        refusal("UNAUTHORIZED"),
      );
      await expect(
        stations({ context: context({ session: "owner", authorization }) }),
      ).rejects.toEqual(refusal("UNAUTHORIZED"));
      await expect(
        call(v1Router.lists.list, undefined, {
          context: context({ session: "owner", authorization }),
        }),
      ).rejects.toEqual(refusal("UNAUTHORIZED"));
    });

    it("stops working once revoked, for good", async () => {
      const made = await makeKey();
      await call(v1Router.keys.revoke, { id: made.id }, bySession("owner"));

      await expect(stations(byKey(made.key))).rejects.toEqual(refusal("UNAUTHORIZED"));
      await expect(call(v1Router.keys.revoke, { id: made.id }, bySession("owner"))).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
    });

    it("stops working when its maker is no longer an operator", async () => {
      const { key } = await makeKey();
      await database.db.delete(operator).where(eq(operator.userId, "owner"));

      await expect(stations(byKey(key))).rejects.toEqual(refusal("UNAUTHORIZED"));
    });

    it("stops working when its maker's account is deleted", async () => {
      const { key } = await makeKey("second");
      await database.db.delete(user).where(eq(user.id, "second"));

      await expect(stations(byKey(key))).rejects.toEqual(refusal("UNAUTHORIZED"));
      expect(await database.db.select().from(apiKey)).toEqual([]);
    });
  });

  describe("the keys", () => {
    it("gives a key once, and stores only its hash", async () => {
      const made = await makeKey("owner", "  the tide clock ");

      expect(made).toEqual({
        id: expect.any(String),
        name: "the tide clock",
        prefix: made.key.slice(0, 8),
        developerId: expect.any(String),
        key: expect.stringMatching(KEY),
        createdAt: expect.any(Date),
        lastUsedAt: null,
        revokedAt: null,
      });
      const [stored] = await database.db.select().from(apiKey);
      expect(stored).toMatchObject({
        id: made.id,
        userId: "owner",
        developerId: made.developerId,
        prefix: made.prefix,
      });
      expect(stored?.keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(made.key);
      expect(JSON.stringify(stored)).not.toContain(made.key.slice(8));
    });

    it("makes no key for an operator whose rights are being taken away", async () => {
      const held = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      // Another connection holds the operator's row, then deletes it, as `job operator-remove` does.
      const removing = database.db.transaction(async (tx) => {
        await tx.select().from(operator).where(eq(operator.userId, "owner")).for("update");
        held.resolve();
        await release.promise;
        await tx.delete(operator).where(eq(operator.userId, "owner"));
      });
      await held.promise;

      const making = makeKey().then(
        () => "made",
        (error: { code?: string }) => error.code,
      );
      expect(await Promise.race([making, wait(300)])).toBe("waiting");
      release.resolve();
      await removing;

      expect(await making).toBe("FORBIDDEN");
      expect(await database.db.select().from(apiKey)).toEqual([]);
    });

    it("refuses a name with a character that is not one", async () => {
      const { id: developerId } = await makeDeveloper();
      for (const name of ["bad\u0000name", "two\nlines", "bell\u0007"]) {
        await expect(
          call(v1Router.keys.create, { name, developerId }, bySession("owner")),
        ).rejects.toEqual(refusal("BAD_REQUEST"));
      }
    });

    it("makes a key unlike any other", async () => {
      const keys = await Promise.all([makeKey(), makeKey(), makeKey()]);

      expect(new Set(keys.map((made) => made.key)).size).toBe(3);
    });

    it("lists to an operator the keys of the instance, another operator's too, without the keys", async () => {
      const first = await makeKey("owner", "first");
      const second = await makeKey("owner", "second");
      await makeKey("second", "someone else's");

      const { keys } = await call(v1Router.keys.list, {}, bySession("owner"));

      expect(keys.map((key) => key.name).sort()).toEqual(["first", "second", "someone else's"]);
      expect(JSON.stringify(keys)).not.toContain(first.key);
      expect(JSON.stringify(keys)).not.toContain(second.key.slice(8));
    });

    it("lists the keys of one developer account", async () => {
      const first = await makeKey("owner", "first");
      await makeKey("owner", "of another account");
      await makeKey("second", "second", first.developerId ?? undefined);

      const { keys } = await call(
        v1Router.keys.list,
        { developerId: first.developerId ?? undefined },
        bySession("owner"),
      );

      expect(keys.map((key) => key.name).sort()).toEqual(["first", "second"]);
    });

    it("lets an operator revoke a key another operator made", async () => {
      const theirs = await makeKey("second");

      const revoked = await call(v1Router.keys.revoke, { id: theirs.id }, bySession("owner"));

      expect(revoked).toMatchObject({ id: theirs.id, revokedAt: expect.any(Date) });
      await expect(stations(byKey(theirs.key))).rejects.toEqual(refusal("UNAUTHORIZED"));
    });

    it("makes no key for a developer account that does not exist", async () => {
      await expect(
        call(
          v1Router.keys.create,
          { name: "mine", developerId: crypto.randomUUID() },
          bySession("owner"),
        ),
      ).rejects.toEqual(refusal("NOT_FOUND"));
      expect(await database.db.select().from(apiKey)).toEqual([]);
    });

    it.each([
      [
        "making one",
        () =>
          call(
            v1Router.keys.create,
            { name: "mine", developerId: crypto.randomUUID() },
            bySession("visitor"),
          ),
      ],
      ["listing them", () => call(v1Router.keys.list, {}, bySession("visitor"))],
      [
        "revoking one",
        () => call(v1Router.keys.revoke, { id: crypto.randomUUID() }, bySession("visitor")),
      ],
    ])("refuses an account that is no operator %s", async (_, attempt) => {
      await expect(attempt()).rejects.toEqual(refusal("FORBIDDEN"));
      expect(await database.db.select().from(apiKey)).toEqual([]);
    });

    it("refuses a name that is empty or too long", async () => {
      const { id: developerId } = await makeDeveloper();
      for (const name of ["", "   ", "n".repeat(81)]) {
        await expect(
          call(v1Router.keys.create, { name, developerId }, bySession("owner")),
        ).rejects.toEqual(refusal("BAD_REQUEST"));
      }
    });
  });

  describe("the catalogue of breaks", () => {
    // Invented breaks: no list's data is in the tests.
    const ids = {
      north: "11111111-1111-4111-8111-111111111111",
      south: "22222222-2222-4222-8222-222222222222",
    };
    const unknown = {
      breakTypes: null,
      waveDirections: null,
      bottomTypes: null,
      abilityLevels: null,
      boardTypes: null,
      bestSeasons: null,
      bestTides: null,
      bestSwellDirections: null,
      bestWindDirections: null,
      offshoreDirectionDegrees: null,
    };

    beforeEach(async () => {
      const { db } = database;
      await db.insert(surfBreak).values([
        {
          id: ids.north,
          provider: "example",
          providerRef: "a1",
          name: "North jetty",
          latitude: 48,
          longitude: -4.5,
          breakTypes: ["beach", "jetty"],
          waveDirections: ["left"],
          bestSwellDirections: ["W", "WNW"],
          offshoreDirectionDegrees: 90,
          location: ["France", "Finistère"],
          timezone: "Europe/Paris",
          sourceUrl: "https://example.org/a1",
          licenseType: "test",
          licenseUrl: "https://example.org/licence",
          attribution: "Test",
        },
        // A break of which only the place is known, from a list that names no source.
        { id: ids.south, name: "South reef", latitude: -33.9, longitude: 151.3 },
      ]);
      await db.insert(surfBreakRecord).values({ breakId: ids.north, details: { crowd: "kept" } });
    });

    it("gives an account and a key each break with what is known of it", async () => {
      const { key } = await makeKey();
      const north = {
        id: ids.north,
        name: "North jetty",
        latitude: 48,
        longitude: -4.5,
        characteristics: {
          ...unknown,
          breakTypes: ["beach", "jetty"],
          waveDirections: ["left"],
          bestSwellDirections: ["W", "WNW"],
          offshoreDirectionDegrees: 90,
        },
        location: ["France", "Finistère"],
        timezone: "Europe/Paris",
        source: {
          provider: "example",
          url: "https://example.org/a1",
          attribution: "Test",
          license: { type: "test", url: "https://example.org/licence" },
        },
      };
      const south = {
        id: ids.south,
        name: "South reef",
        latitude: -33.9,
        longitude: 151.3,
        characteristics: unknown,
        location: null,
        timezone: null,
        source: { provider: null, url: null, attribution: null, license: null },
      };

      for (const caller of [bySession("visitor"), byKey(key)]) {
        expect(await call(v1Router.breaks.list, {}, caller)).toEqual({
          breaks: [north, south],
          next: null,
        });
        expect(await call(v1Router.breaks.get, { id: ids.south }, caller)).toEqual(south);

        const boxed = await call(v1Router.breaks.list, { bbox: "-6,47,-4,49" }, caller);
        expect(boxed.breaks.map((found) => found.id)).toEqual([ids.north]);
        const named = await call(v1Router.breaks.list, { q: "REEF" }, caller);
        expect(named.breaks.map((found) => found.id)).toEqual([ids.south]);

        const first = await call(v1Router.breaks.list, { limit: 1 }, caller);
        expect(first).toMatchObject({ breaks: [{ id: ids.north }], next: ids.north });
        expect(
          await call(v1Router.breaks.list, { limit: 1, after: ids.north }, caller),
        ).toMatchObject({ breaks: [{ id: ids.south }], next: null });
      }
    });

    it("keeps to itself what a list said besides, for every caller", async () => {
      const { key } = await makeKey();

      for (const caller of [bySession("visitor"), bySession("owner"), byKey(key)]) {
        const whole = await call(v1Router.breaks.list, { limit: 2000 }, caller);
        const one = await call(v1Router.breaks.get, { id: ids.north }, caller);
        expect(JSON.stringify([whole, one])).not.toContain("kept");
      }
    });

    it("lets an account make a spot from a break", async () => {
      const made = await call(v1Router.spots.create, { breakId: ids.north }, bySession("visitor"));

      expect(made).toMatchObject({ breakId: ids.north, name: "North jetty", latitude: 48 });
    });
  });
});
