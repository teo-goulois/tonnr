import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { testForecasts } from "@repo/conditions/forecasts/testing";
import {
  accountSuspension,
  apiKey,
  apiUsage,
  developer,
  developerCalls,
  developerMember,
  operator,
  operatorAction,
} from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

const AT = new Date("2026-10-09T08:00:00Z");
const ADMIN = "https://admin.example.org";
const WEB = "https://app.example.org";

// Decision 027: an operator names the accounts that read a developer account, and such an
// account reads that one and no other.
describe.skipIf(!TEST_DATABASE_URL)("the console of a developer account", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  const { forecasts } = testForecasts();
  // Two developer accounts, whose keys and calls are told apart by their names and numbers.
  let ids: { screens: string; clock: string; first: string; second: string; third: string };
  let keys: { first: string; third: string };

  const at = (text: string) => new Date(`2026-10-${text}:00:00Z`);
  const SPAN = { from: at("08T00"), to: at("10T00") };
  type Row = [hour: string, key: keyof typeof ids, procedure: string, outcome: string, n: number];

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(apiUsage);
    await db.delete(operatorAction);
    await db.delete(developer);
    await db.delete(user);
    await db.insert(user).values([
      { id: "owner", name: "Owner", email: "owner@example.org" },
      { id: "second", name: "Second", email: "second@example.org" },
      { id: "ana", name: "Ana", email: "ana@example.org", emailVerified: true },
      { id: "ben", name: "Ben", email: "ben@example.org" },
      { id: "visitor", name: "Visitor", email: "visitor@example.org" },
    ]);
    await db.insert(operator).values([{ userId: "owner" }, { userId: "second" }]);

    const make = (name: string, more: object = {}) =>
      call(v1Router.developers.create, { name, ...more }, asOperator());
    const key = (developerId: string, name: string) =>
      call(v1Router.keys.create, { name, developerId }, asOperator());
    const screens = await make("screens", {
      contact: "harbour@example.org",
      note: "Asked on the quay.",
      callsPerHour: 300,
    });
    const clock = await make("clock");
    const first = await key(screens.id, "first");
    const second = await key(screens.id, "second");
    const third = await key(clock.id, "third");
    ids = {
      screens: screens.id,
      clock: clock.id,
      first: first.id,
      second: second.id,
      third: third.id,
    };
    keys = { first: first.key, third: third.key };
    await db.delete(operatorAction);

    const rows: Row[] = [
      ["08T21", "first", "v1.stations.list", "answered", 10],
      ["08T22", "first", "v1.stations.list", "answered", 20],
      ["08T22", "first", "v1.forecasts.get", "invalid", 2],
      ["08T22", "second", "v1.stations.list", "limited", 5],
      ["09T08", "third", "v1.tides.extremes", "answered", 7000],
      ["09T08", "third", "v1.tides.extremes", "refused", 1000],
    ];
    await db.insert(apiUsage).values(
      rows.map(([hour, name, procedure, outcome, calls]) => ({
        hour: at(hour),
        via: "key",
        keyId: ids[name],
        procedure,
        outcome,
        calls,
      })) as never,
    );
    // The calls of the accounts that signed in, and of nobody: no developer account's.
    await db.insert(apiUsage).values([
      {
        hour: at("09T08"),
        via: "session",
        keyId: null,
        procedure: "v1.stations.list",
        outcome: "answered",
        calls: 100_000,
      },
      {
        hour: at("09T08"),
        via: "none",
        keyId: null,
        procedure: "v1.stations.list",
        outcome: "refused",
        calls: 400_000,
      },
    ]);
  });

  function sessionOf(id: string): Session {
    const account = { id, name: id, email: `${id}@example.org`, emailVerified: false, image: null };
    const session = { id: `session-${id}`, userId: id, token: `token-${id}`, expiresAt: AT };
    const dates = { createdAt: AT, updatedAt: AT };
    return {
      user: { ...account, ...dates },
      session: { ...session, ...dates, ipAddress: null, userAgent: null },
    } as Session;
  }
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
    verification: testVerification(database.db, { on: false }).verification,
    reply: {},
  });
  const asOperator = (id = "owner") => ({ context: context({ session: id }) });
  const as = (id: string, site: string | null = ADMIN) => ({
    context: context({ session: id, site }),
  });
  const refusal = (code: string) => expect.objectContaining({ code });
  const none = { answered: 0, invalid: 0, refused: 0, limited: 0, failed: 0 };

  const add = (developerId: string, accountId: string, by = "owner") =>
    call(v1Router.developers.addMember, { id: developerId, accountId }, asOperator(by));
  const remove = (developerId: string, accountId: string, by = "owner") =>
    call(v1Router.developers.removeMember, { id: developerId, accountId }, asOperator(by));
  const members = async (developerId: string) =>
    (await call(v1Router.developers.members, { id: developerId }, asOperator())).members;
  // What the records say, the first first, without their id and their moment.
  const said = async (input: object = {}) =>
    (await call(v1Router.actions.list, input as never, asOperator())).actions
      .map(({ id: _id, at: _at, ...rest }) => rest)
      .reverse();

  const read = async (id: string, site: string | null = ADMIN) =>
    (await call(v1Router.console.get, undefined, as(id, site))).developers;
  const series = (id: string, input: object) =>
    call(v1Router.console.series, { ...SPAN, ...input } as never, as(id));
  const breakdown = (id: string, input: object) =>
    call(v1Router.console.breakdown, { ...SPAN, ...input } as never, as(id));

  describe("its members, in an operator's hands", () => {
    it("are the accounts an operator names, with what tells one account from another", async () => {
      expect(await members(ids.screens)).toEqual([]);

      const added = await add(ids.screens, "ana");

      expect(added.members).toEqual([
        {
          id: "ana",
          name: "Ana",
          email: "ana@example.org",
          emailVerified: true,
          suspendedAt: null,
          addedAt: expect.any(Date),
        },
      ]);
      expect(await members(ids.screens)).toEqual(added.members);
      // Of that developer account, and of no other.
      expect(await members(ids.clock)).toEqual([]);
    });

    it("come the first added first, and say which are suspended or unchecked", async () => {
      await add(ids.screens, "ben");
      await add(ids.screens, "ana");
      await database.db.insert(accountSuspension).values({ userId: "ben", operatorId: "owner" });

      expect(
        (await members(ids.screens)).map((member) => [
          member.id,
          member.emailVerified,
          member.suspendedAt !== null,
        ]),
      ).toEqual([
        ["ben", false, true],
        ["ana", true, false],
      ]);
    });

    it("may be an operator, and an account of several developer accounts", async () => {
      await add(ids.screens, "second");
      await add(ids.screens, "ana");
      await add(ids.clock, "ana");

      expect((await members(ids.screens)).map((member) => member.id)).toEqual(["second", "ana"]);
      expect((await members(ids.clock)).map((member) => member.id)).toEqual(["ana"]);
    });

    it("are recorded when added and when taken out, with the developer account and the account", async () => {
      await add(ids.screens, "ana");
      await remove(ids.screens, "ana", "second");

      const record = {
        developerId: ids.screens,
        developerName: "screens",
        keyName: null,
        accountId: "ana",
        accountName: "Ana",
        changes: null,
      };
      const both = [
        { ...record, action: "developer.member_add", operatorName: "Owner" },
        { ...record, action: "developer.member_remove", operatorName: "Second" },
      ];
      expect(await said()).toEqual(both);
      // Found from either side.
      expect(await said({ developerId: ids.screens })).toEqual(both);
      expect(await said({ accountId: "ana" })).toEqual(both);
      expect(await said({ developerId: ids.clock })).toEqual([]);
      expect(await said({ accountId: "ben" })).toEqual([]);
    });

    it("keep nothing of the account in the record but its identifier", async () => {
      await add(ids.screens, "ana");

      const stored = JSON.stringify(await database.db.select().from(operatorAction));
      expect(stored).toContain('"ana"');
      for (const kept of ["Ana", "ana@", "example.org"]) expect(stored).not.toContain(kept);
    });

    it("are added once: a second time changes nothing and records nothing", async () => {
      const [first] = (await add(ids.screens, "ana")).members;
      const again = await add(ids.screens, "ana", "second");

      // The moment of the first, and the operator who added it then.
      expect(again.members).toEqual([first]);
      expect(await database.db.select().from(developerMember)).toEqual([
        { developerId: ids.screens, userId: "ana", addedAt: first?.addedAt, operatorId: "owner" },
      ]);
      expect((await said()).map((done) => done.action)).toEqual(["developer.member_add"]);
    });

    it("are added once when two operators add the same account together", async () => {
      await Promise.all([
        add(ids.screens, "ana"),
        add(ids.screens, "ana", "second"),
        add(ids.screens, "ana"),
        add(ids.screens, "ana", "second"),
      ]);

      expect((await members(ids.screens)).map((member) => member.id)).toEqual(["ana"]);
      expect((await said()).map((done) => done.action)).toEqual(["developer.member_add"]);
    });

    it("are taken out once, the last one too, and one that is none changes nothing", async () => {
      await add(ids.screens, "ana");

      // Ben is no member, and the visitor is no account of this developer account either.
      expect((await remove(ids.screens, "ben")).members.map((member) => member.id)).toEqual([
        "ana",
      ]);
      expect((await remove(ids.screens, "nobody")).members).toHaveLength(1);
      // A member of this one is none of the other.
      expect((await remove(ids.clock, "ana")).members).toEqual([]);
      expect(await members(ids.screens)).toHaveLength(1);

      await Promise.all([remove(ids.screens, "ana"), remove(ids.screens, "ana", "second")]);

      expect(await members(ids.screens)).toEqual([]);
      expect((await said()).map((done) => done.action)).toEqual([
        "developer.member_add",
        "developer.member_remove",
      ]);
    });

    it("refuse a developer account or an account that does not exist, as not found", async () => {
      const unknown = crypto.randomUUID();

      await expect(add(unknown, "ana")).rejects.toEqual(refusal("NOT_FOUND"));
      await expect(add(ids.screens, "nobody")).rejects.toEqual(refusal("NOT_FOUND"));
      await expect(remove(unknown, "ana")).rejects.toEqual(refusal("NOT_FOUND"));
      await expect(members(unknown)).rejects.toEqual(refusal("NOT_FOUND"));
      // A key's identifier is no developer account's.
      await expect(add(ids.first, "ana")).rejects.toEqual(refusal("NOT_FOUND"));
      await expect(add("screens", "ana")).rejects.toEqual(refusal("BAD_REQUEST"));
      await expect(add(ids.screens, "")).rejects.toEqual(refusal("BAD_REQUEST"));

      expect(await database.db.select().from(developerMember)).toEqual([]);
      expect(await said()).toEqual([]);
    });

    it("go with the account that is deleted, and with the developer account that is", async () => {
      await add(ids.screens, "ana");
      await add(ids.screens, "ben");
      await add(ids.clock, "ben");

      await database.db.delete(user).where(eq(user.id, "ana"));
      expect((await members(ids.screens)).map((member) => member.id)).toEqual(["ben"]);

      await call(v1Router.developers.delete, { id: ids.screens }, asOperator());
      expect(
        await database.db.select({ of: developerMember.developerId }).from(developerMember),
      ).toEqual([{ of: ids.clock }]);
      // The records stay, and the one of the account that is gone has its identifier alone.
      expect(
        (await said({ developerId: ids.screens })).map((done) => [
          done.action,
          done.accountId,
          done.accountName,
        ]),
      ).toEqual([
        ["developer.member_add", "ana", null],
        ["developer.member_add", "ben", "Ben"],
        ["developer.delete", null, null],
      ]);
    });

    it("stay when the operator who added them is deleted", async () => {
      await add(ids.screens, "ana", "second");

      await database.db.delete(user).where(eq(user.id, "second"));

      expect((await members(ids.screens)).map((member) => member.id)).toEqual(["ana"]);
      expect(await read("ana")).toHaveLength(1);
    });

    it("are not added when the record of it cannot be kept, nor taken out", async () => {
      await add(ids.screens, "ben");
      // A database that refuses these records: what they go with is undone.
      await database.db.execute(sql`
        alter table operator_action
          add constraint no_member check (action not like 'developer.member%') not valid
      `);
      try {
        await expect(add(ids.screens, "ana")).rejects.toBeDefined();
        await expect(remove(ids.screens, "ben")).rejects.toBeDefined();
      } finally {
        await database.db.execute(sql`alter table operator_action drop constraint no_member`);
      }

      expect((await members(ids.screens)).map((member) => member.id)).toEqual(["ben"]);
      expect((await said()).map((done) => done.action)).toEqual(["developer.member_add"]);
    });

    it("are an operator's to name, from the admin's site, and no member's", async () => {
      await add(ids.screens, "ana");

      for (const name of ["members", "addMember", "removeMember"] as const) {
        const input = { id: ids.screens, accountId: "ben" };
        // A member, at the admin's site.
        await expect(call(v1Router.developers[name], input, as("ana"))).rejects.toEqual(
          refusal("FORBIDDEN"),
        );
        // An operator, from the web app.
        await expect(call(v1Router.developers[name], input, as("owner", WEB))).rejects.toEqual(
          refusal("FORBIDDEN"),
        );
        // A key, and no one.
        await expect(
          call(v1Router.developers[name], input, {
            context: context({ authorization: `Bearer ${keys.first}` }),
          }),
        ).rejects.toEqual(refusal("FORBIDDEN"));
        await expect(
          call(v1Router.developers[name], input, { context: context() }),
        ).rejects.toEqual(refusal("UNAUTHORIZED"));
      }
      expect((await members(ids.screens)).map((member) => member.id)).toEqual(["ana"]);
    });

    it("say in the list of accounts whether an address was checked", async () => {
      const { accounts } = await call(v1Router.accounts.list, {}, asOperator());

      expect(
        Object.fromEntries(accounts.map((found) => [found.id, found.emailVerified])),
      ).toMatchObject({ ana: true, ben: false });
    });
  });

  describe("what a member reads", () => {
    beforeEach(async () => {
      await add(ids.screens, "ana");
    });

    it("is the developer account it is a member of, with its keys by name, and nothing more", async () => {
      await call(v1Router.keys.revoke, { id: ids.second }, asOperator());

      const found = await read("ana");

      expect(found).toEqual([
        {
          id: ids.screens,
          name: "screens",
          callsPerHour: 300,
          callsThisHour: 0,
          suspendedAt: null,
          keys: [
            {
              id: ids.second,
              name: "second",
              prefix: expect.stringMatching(/^key_.{4}$/),
              createdAt: expect.any(Date),
              lastUsedAt: null,
              revokedAt: expect.any(Date),
            },
            {
              id: ids.first,
              name: "first",
              prefix: keys.first.slice(0, 8),
              createdAt: expect.any(Date),
              lastUsedAt: null,
              revokedAt: null,
            },
          ],
        },
      ]);
    });

    it("holds no key, no hash, and nothing the operator keeps of the developer account", async () => {
      await add(ids.screens, "ben");
      const [hashes] = await database.db
        .select({ hash: apiKey.keyHash })
        .from(apiKey)
        .where(eq(apiKey.id, ids.first));

      const told = JSON.stringify(await read("ana"));

      for (const kept of [
        keys.first,
        keys.first.slice(8),
        hashes?.hash ?? "no hash",
        "harbour@",
        "quay",
        // Who else is a member, and who made the keys.
        "ben",
        "Ben",
        "owner",
        // The other developer account.
        ids.clock,
        ids.third,
        "clock",
        "third",
      ]) {
        expect(told).not.toContain(kept);
      }
    });

    it("is nothing for an account that is a member of none, an operator's too", async () => {
      expect(await read("visitor")).toEqual([]);
      expect(await read("ben")).toEqual([]);
      // Running the instance makes no one a member: the admin is where an operator reads.
      expect(await read("owner")).toEqual([]);
    });

    it("is each of the developer accounts of a member of several, by name", async () => {
      await add(ids.clock, "ana");
      await add(ids.clock, "ben");

      const found = await read("ana");

      expect(found.map((account) => [account.name, account.keys.map((key) => key.name)])).toEqual([
        ["clock", ["third"]],
        ["screens", ["second", "first"]],
      ]);
      expect((await read("ben")).map((account) => account.name)).toEqual(["clock"]);
    });

    it("counts the calls its keys were let through this hour, and no other account's", async () => {
      await add(ids.clock, "ben");
      const stations = (key: string) =>
        call(v1Router.stations.list, {}, { context: context({ authorization: `Bearer ${key}` }) });
      const hour = async () => {
        const { rows } = await database.db.execute(
          sql`select date_trunc('hour', now(), 'UTC')::text as hour`,
        );
        return rows[0]?.hour;
      };

      // The hour may turn between the calls and the reading: they are then made again.
      let counted: number[][] = [];
      let started: unknown;
      do {
        await database.db.delete(developerCalls);
        started = await hour();
        await stations(keys.first);
        await stations(keys.first);
        await stations(keys.third);
        // An hour that is over is not the hour under way.
        await database.db.insert(developerCalls).values({
          hour: new Date("2020-01-01T00:00:00Z"),
          developerId: ids.screens,
          calls: 50,
        });
        counted = [
          (await read("ana")).map((account) => account.callsThisHour),
          (await read("ben")).map((account) => account.callsThisHour),
        ];
      } while ((await hour()) !== started);

      expect(counted).toEqual([[2], [1]]);
    });

    it("says when a key was last used, once the counts are written", async () => {
      await call(
        v1Router.stations.list,
        {},
        { context: context({ authorization: `Bearer ${keys.first}` }) },
      );
      await usage.flush();

      const [account] = await read("ana");

      expect(account?.keys.map((key) => [key.name, key.lastUsedAt !== null])).toEqual([
        ["second", false],
        ["first", true],
      ]);
    });

    it("is still read while the developer account is suspended, which it says", async () => {
      await call(v1Router.developers.update, { id: ids.screens, suspended: true }, asOperator());

      const [account] = await read("ana");

      expect(account?.suspendedAt).toBeInstanceOf(Date);
      expect(account?.keys).toHaveLength(2);
      expect((await series("ana", { developerId: ids.screens })).points).toHaveLength(2);
    });

    it("is read from the web app's site as from the admin's, with a session and no key", async () => {
      expect(await read("ana", WEB)).toHaveLength(1);
      expect(await read("ana", null)).toHaveLength(1);

      for (const procedure of [v1Router.console.get, v1Router.console.series] as const) {
        const input = { ...SPAN, developerId: ids.screens } as never;
        await expect(
          call(procedure as never, input, {
            context: context({ authorization: `Bearer ${keys.first}` }),
          }),
        ).rejects.toEqual(refusal("FORBIDDEN"));
        // A key beside a session is a key: it stands for no account.
        await expect(
          call(procedure as never, input, {
            context: context({ session: "ana", authorization: `Bearer ${keys.first}` }),
          }),
        ).rejects.toEqual(refusal("FORBIDDEN"));
        await expect(call(procedure as never, input, { context: context() })).rejects.toEqual(
          refusal("UNAUTHORIZED"),
        );
      }
    });

    it("changes nothing: the console has no procedure that writes", () => {
      expect(Object.keys(v1Router.console)).toEqual(["get", "series", "breakdown"]);
    });
  });

  describe("the calls a member reads", () => {
    beforeEach(async () => {
      await add(ids.screens, "ana");
      await add(ids.clock, "ben");
    });

    it("are those of its developer account's keys over time, and no one else's", async () => {
      expect((await series("ana", { developerId: ids.screens })).points).toEqual([
        { ...none, at: at("08T21"), answered: 10 },
        { ...none, at: at("08T22"), answered: 20, invalid: 2, limited: 5 },
      ]);
      expect((await series("ben", { developerId: ids.clock })).points).toEqual([
        { ...none, at: at("09T08"), answered: 7000, refused: 1000 },
      ]);
    });

    it("are counted by the day where the reader's day starts", async () => {
      const { points } = await series("ana", {
        developerId: ids.screens,
        step: "day",
        timeZone: "Europe/Paris",
      });

      // 23:00 on the 8th in Paris, then midnight on the 9th.
      expect(points).toEqual([
        { ...none, at: new Date("2026-10-07T22:00:00Z"), answered: 10 },
        { ...none, at: new Date("2026-10-08T22:00:00Z"), answered: 20, invalid: 2, limited: 5 },
      ]);
    });

    it("are broken down by its keys, and by what they called", async () => {
      expect((await breakdown("ana", { developerId: ids.screens, by: "key" })).rows).toEqual([
        { ...none, id: ids.first, name: "first", answered: 30, invalid: 2 },
        { ...none, id: ids.second, name: "second", limited: 5 },
      ]);
      expect((await breakdown("ana", { developerId: ids.screens, by: "procedure" })).rows).toEqual([
        { ...none, id: "v1.stations.list", name: null, answered: 30, limited: 5 },
        { ...none, id: "v1.forecasts.get", name: null, invalid: 2 },
      ]);
      expect((await breakdown("ben", { developerId: ids.clock, by: "key" })).rows).toEqual([
        { ...none, id: ids.third, name: "third", answered: 7000, refused: 1000 },
      ]);
    });

    it("are none, and not a refusal, for a developer account whose keys made no call", async () => {
      const quiet = await call(v1Router.developers.create, { name: "quiet" }, asOperator());
      await add(quiet.id, "ana");

      expect(await series("ana", { developerId: quiet.id })).toEqual({ points: [] });
      expect(await breakdown("ana", { developerId: quiet.id, by: "key" })).toEqual({ rows: [] });
      expect(await breakdown("ana", { developerId: quiet.id, by: "procedure" })).toEqual({
        rows: [],
      });
      // Nor outside the hours that had calls.
      expect(
        await series("ana", { developerId: ids.screens, from: at("09T00"), to: at("10T00") }),
      ).toEqual({ points: [] });
    });

    it("are refused, as of a developer account that does not exist, to one who is no member", async () => {
      const unknown = crypto.randomUUID();
      const asked: [who: string, developerId: string][] = [
        // Another's developer account, each way.
        ["ana", ids.clock],
        ["ben", ids.screens],
        // No member of any, and an operator who is none.
        ["visitor", ids.screens],
        ["owner", ids.screens],
        // One that does not exist, and a key's identifier.
        ["ana", unknown],
        ["ana", ids.third],
        ["ana", ids.first],
      ];

      for (const [who, developerId] of asked) {
        const answers = await Promise.allSettled([
          series(who, { developerId }),
          series(who, { developerId, step: "day" }),
          breakdown(who, { developerId, by: "key" }),
          breakdown(who, { developerId, by: "procedure" }),
        ]);
        expect(
          answers.map((answer) => answer.status === "rejected" && answer.reason),
          `${who} asking for ${developerId}`,
        ).toEqual(Array.from({ length: 4 }, () => refusal("NOT_FOUND")));
        // The same words whether it exists or not.
        expect(
          answers.map((answer) => answer.status === "rejected" && answer.reason.message),
        ).toEqual(Array.from({ length: 4 }, () => "No such developer account."));
      }
    });

    it("take a developer account's identifier, and no other way to say whose calls", async () => {
      const refused = [
        series("ana", {}),
        series("ana", { developerId: null }),
        series("ana", { developerId: "" }),
        series("ana", { developerId: "screens" }),
        breakdown("ana", { by: "key" }),
        breakdown("ana", { developerId: ids.screens }),
        // What the admin breaks down by, and a member does not.
        breakdown("ana", { developerId: ids.screens, by: "developer" }),
        breakdown("ana", { developerId: ids.screens, by: "via" }),
        series("ana", { developerId: ids.screens, timeZone: "Mars/Olympus" }),
        series("ana", { developerId: ids.screens, from: at("10T00"), to: at("08T00") }),
      ];

      for (const answer of await Promise.allSettled(refused)) {
        expect(answer.status === "rejected" && answer.reason).toEqual(refusal("BAD_REQUEST"));
      }
    });

    it("are not narrowed or widened by what the admin's counts take", async () => {
      // A key of another developer account, named as the admin's counts let an operator.
      const { points } = await series("ana", { developerId: ids.screens, keyId: ids.third });
      const { rows } = await breakdown("ana", {
        developerId: ids.screens,
        by: "key",
        keyId: ids.third,
      });

      expect(points.map((point) => point.answered)).toEqual([10, 20]);
      expect(rows.map((row) => row.name)).toEqual(["first", "second"]);
    });

    it("stop with the member: taken out, it reads nothing from its next call", async () => {
      expect(await read("ana")).toHaveLength(1);

      await remove(ids.screens, "ana");

      expect(await read("ana")).toEqual([]);
      await expect(series("ana", { developerId: ids.screens })).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      await expect(breakdown("ana", { developerId: ids.screens, by: "key" })).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
      // The other member of the other account reads on.
      expect(await read("ben")).toHaveLength(1);
    });

    it("stop with the developer account that is deleted", async () => {
      await call(v1Router.developers.delete, { id: ids.screens }, asOperator());

      expect(await read("ana")).toEqual([]);
      await expect(series("ana", { developerId: ids.screens })).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
    });

    it("lose the calls of a key that is deleted, and keep those of one that is revoked", async () => {
      await call(v1Router.keys.revoke, { id: ids.second }, asOperator());
      await database.db.delete(apiKey).where(eq(apiKey.id, ids.first));

      expect((await breakdown("ana", { developerId: ids.screens, by: "key" })).rows).toEqual([
        { ...none, id: ids.second, name: "second", limited: 5 },
      ]);
      expect((await series("ana", { developerId: ids.screens })).points).toEqual([
        { ...none, at: at("08T22"), limited: 5 },
      ]);
    });

    it("leave out a key that has no developer account, as an older version made them", async () => {
      const id = crypto.randomUUID();
      await database.db
        .insert(apiKey)
        .values({ id, userId: "owner", name: "older", prefix: "key_olde", keyHash: "older" });
      await database.db.insert(apiUsage).values({
        hour: at("08T22"),
        via: "key",
        keyId: id,
        procedure: "v1.stations.list",
        outcome: "answered",
        calls: 9_000_000,
      });

      const told = JSON.stringify([
        await read("ana"),
        await series("ana", { developerId: ids.screens }),
        await breakdown("ana", { developerId: ids.screens, by: "key" }),
        await breakdown("ana", { developerId: ids.screens, by: "procedure" }),
      ]);

      expect(told).not.toContain("older");
      expect(told).not.toContain("9000");
    });

    it("are not counted themselves under an account: a member's reading is a session's", async () => {
      await database.db.delete(apiUsage);
      await read("ana");
      await series("ana", { developerId: ids.screens });
      await usage.flush();

      const counted = await database.db.select().from(apiUsage);

      expect(counted.map((row) => [row.via, row.keyId, row.procedure, row.outcome])).toEqual(
        expect.arrayContaining([
          ["session", null, "v1.console.get", "answered"],
          ["session", null, "v1.console.series", "answered"],
        ]),
      );
      expect(JSON.stringify(counted)).not.toContain("ana");
    });
  });
});
