import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import {
  apiKey,
  apiUsage,
  developer,
  developerCalls,
  operator,
  operatorAction,
} from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { newKey } from "./keys";
import { v1Router } from "./routers/index";
import { createUsage, monthsBefore, outcomeOf, type Usage } from "./usage";

const AT = new Date("2026-10-09T08:00:00Z");
const ADMIN = "https://admin.example.org";
const HOUR_MS = 60 * 60 * 1000;

describe.skipIf(!TEST_DATABASE_URL)("running the instance", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  // What the counter takes for the time. A test moves it to count in another hour.
  let clock = new Date();

  beforeAll(async () => {
    database = await createTestDatabase();
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
      { id: "visitor", name: "Visitor", email: "visitor@example.org" },
    ]);
    await db.insert(operator).values([{ userId: "owner" }, { userId: "second" }]);
    clock = new Date();
    usage = createUsage(db, { every: null, now: () => clock });
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
  const context = (by: { session?: string; authorization?: string } = {}): Context => ({
    db: database.db,
    session: by.session ? sessionOf(by.session) : null,
    authorization: by.authorization ?? null,
    site: ADMIN,
    adminSites: [ADMIN],
    usage,
  });
  const asOwner = () => ({ context: context({ session: "owner" }) });
  const byKey = (key: string) => ({ context: context({ authorization: `Bearer ${key}` }) });
  const refusal = (code: string) => expect.objectContaining({ code });

  type Made = { name?: string; callsPerHour?: number | null; contact?: string; note?: string };
  const makeDeveloper = (made: Made = {}) =>
    call(v1Router.developers.create, { name: "Harbour screens", ...made }, asOwner());
  const makeKey = (developerId: string, name = "a program", by = "owner") =>
    call(v1Router.keys.create, { name, developerId }, { context: context({ session: by }) });
  const developers = async () =>
    (await call(v1Router.developers.list, undefined, asOwner())).developers;
  const stations = (key: string) => call(v1Router.stations.list, {}, byKey(key));
  // What a call came to: its answer's word, or the code it was refused with.
  const outcome = (calling: Promise<unknown>) =>
    calling.then(
      () => "answered",
      (error: { code?: string }) => error.code,
    );
  const counted = () =>
    database.db
      .select()
      .from(apiUsage)
      .orderBy(apiUsage.hour, apiUsage.via, apiUsage.procedure, apiUsage.outcome);

  describe("a developer account", () => {
    it("is made with its name alone, and has no limit, no key and no call", async () => {
      const made = await makeDeveloper({ name: "  Harbour screens " });

      expect(made).toEqual({
        id: expect.any(String),
        name: "Harbour screens",
        contact: null,
        note: null,
        callsPerHour: null,
        suspendedAt: null,
        createdAt: expect.any(Date),
        keys: 0,
        callsThisHour: 0,
        lastUsedAt: null,
      });
      expect(await developers()).toEqual([made]);
    });

    it("keeps a contact, a note of several lines and a limit, and takes none for an empty one", async () => {
      const made = await makeDeveloper({
        contact: " ana@example.org ",
        note: "Two screens.\nAsked on the quay.",
        callsPerHour: 300,
      });
      expect(made).toMatchObject({
        contact: "ana@example.org",
        note: "Two screens.\nAsked on the quay.",
        callsPerHour: 300,
      });

      expect(await makeDeveloper({ contact: "  ", note: "" })).toMatchObject({
        contact: null,
        note: null,
      });
    });

    it.each([
      ["no name", { name: " " }],
      ["a name too long", { name: "n".repeat(81) }],
      ["a name with a character that is not one", { name: "bell\u0007" }],
      ["a contact too long", { contact: "c".repeat(201) }],
      ["a contact of two lines", { contact: "one\ntwo" }],
      ["a note too long", { note: "n".repeat(1001) }],
      ["a note with a character that is not one", { note: "nul\u0000" }],
      ["a limit of no call", { callsPerHour: 0 }],
      ["a limit that is not a whole number", { callsPerHour: 1.5 }],
      ["a limit below zero", { callsPerHour: -1 }],
    ])("is refused with %s", async (_, made) => {
      await expect(makeDeveloper(made)).rejects.toEqual(refusal("BAD_REQUEST"));
      expect(await database.db.select().from(developer)).toEqual([]);
    });

    it("is listed by name, with its keys that are not revoked and when one was last used", async () => {
      const screens = await makeDeveloper({ name: "screens" });
      const clock2 = await makeDeveloper({ name: "Clock" });
      const first = await makeKey(screens.id, "first");
      const second = await makeKey(screens.id, "second");
      await call(v1Router.keys.revoke, { id: second.id }, asOwner());
      await stations(first.key);
      await usage.flush();

      const listed = await developers();

      expect(listed.map((found) => [found.name, found.keys, found.callsThisHour])).toEqual([
        ["Clock", 0, 0],
        ["screens", 1, 1],
      ]);
      expect(listed[1]?.lastUsedAt).toBeInstanceOf(Date);
      expect(listed[0]).toMatchObject({ id: clock2.id, lastUsedAt: null });
    });

    it("changes what an update names, and leaves the rest", async () => {
      const made = await makeDeveloper({ contact: "ana@example.org", callsPerHour: 300 });
      const update = (changes: object) =>
        call(v1Router.developers.update, { id: made.id, ...changes } as never, asOwner());

      expect(await update({ name: "Quay screens" })).toMatchObject({
        name: "Quay screens",
        contact: "ana@example.org",
        callsPerHour: 300,
      });
      expect(await update({ callsPerHour: null, contact: "" })).toMatchObject({
        name: "Quay screens",
        contact: null,
        callsPerHour: null,
      });
      await expect(update({})).rejects.toEqual(refusal("BAD_REQUEST"));
      await expect(update({ name: "" })).rejects.toEqual(refusal("BAD_REQUEST"));
      await expect(
        call(v1Router.developers.update, { id: crypto.randomUUID(), name: "None" }, asOwner()),
      ).rejects.toEqual(refusal("NOT_FOUND"));
    });

    it("stops all its keys while it is suspended, and gives them back when it is resumed", async () => {
      const made = await makeDeveloper();
      const { key } = await makeKey(made.id);
      const revoked = await makeKey(made.id, "revoked");
      await call(v1Router.keys.revoke, { id: revoked.id }, asOwner());
      const other = await makeKey((await makeDeveloper({ name: "another" })).id);
      const suspend = (suspended: boolean) =>
        call(v1Router.developers.update, { id: made.id, suspended }, asOwner());

      const suspended = await suspend(true);
      expect(suspended.suspendedAt).toBeInstanceOf(Date);
      await expect(stations(key)).rejects.toEqual(refusal("UNAUTHORIZED"));
      expect(await stations(other.key)).toEqual({ stations: [] });
      // Suspending it again keeps the moment it was first suspended.
      expect((await suspend(true)).suspendedAt).toEqual(suspended.suspendedAt);

      expect((await suspend(false)).suspendedAt).toBeNull();
      expect(await stations(key)).toEqual({ stations: [] });
      await expect(stations(revoked.key)).rejects.toEqual(refusal("UNAUTHORIZED"));
    });

    it("is deleted with its keys and their counts, and nothing else", async () => {
      const made = await makeDeveloper({ name: "gone" });
      const kept = await makeDeveloper({ name: "kept" });
      const { key } = await makeKey(made.id);
      const keptKey = await makeKey(kept.id);
      await stations(key);
      await stations(keptKey.key);
      await usage.flush();

      const deleted = await call(v1Router.developers.delete, { id: made.id }, asOwner());

      expect(deleted).toEqual({ id: made.id, name: "gone" });
      await expect(stations(key)).rejects.toEqual(refusal("UNAUTHORIZED"));
      expect((await developers()).map((found) => found.name)).toEqual(["kept"]);
      expect((await database.db.select().from(apiKey)).map((row) => row.id)).toEqual([keptKey.id]);
      expect(
        (await database.db.select().from(developerCalls)).map((row) => row.developerId),
      ).toEqual([kept.id]);
      const ofKeys = (await counted()).filter((row) => row.via === "key");
      expect(ofKeys.map((row) => row.keyId)).toEqual([keptKey.id]);
      await expect(call(v1Router.developers.delete, { id: made.id }, asOwner())).rejects.toEqual(
        refusal("NOT_FOUND"),
      );
    });

    it("keeps its keys when their maker's rights go, revoked as decision 019 says", async () => {
      const made = await makeDeveloper();
      const theirs = await makeKey(made.id, "theirs", "second");
      const mine = await makeKey(made.id, "mine");

      await database.db.delete(operator).where(eq(operator.userId, "second"));

      await expect(stations(theirs.key)).rejects.toEqual(refusal("UNAUTHORIZED"));
      expect(await stations(mine.key)).toEqual({ stations: [] });
    });
  });

  describe("the limit of a developer account", () => {
    it("lets through its number of calls in an hour, then refuses", async () => {
      const made = await makeDeveloper({ callsPerHour: 3 });
      const { key } = await makeKey(made.id);

      const outcomes = [];
      for (let index = 0; index < 5; index += 1) outcomes.push(await outcome(stations(key)));

      expect(outcomes).toEqual([
        "answered",
        "answered",
        "answered",
        "TOO_MANY_REQUESTS",
        "TOO_MANY_REQUESTS",
      ]);
      expect((await developers())[0]).toMatchObject({ callsThisHour: 3 });
    });

    it("lets through no more when the calls arrive together", async () => {
      const made = await makeDeveloper({ callsPerHour: 5 });
      const { key } = await makeKey(made.id);

      const outcomes = await Promise.all(Array.from({ length: 20 }, () => outcome(stations(key))));

      expect(outcomes.filter((word) => word === "answered")).toHaveLength(5);
      expect(outcomes.filter((word) => word === "TOO_MANY_REQUESTS")).toHaveLength(15);
      expect(await database.db.select().from(developerCalls)).toMatchObject([{ calls: 5 }]);
    });

    it("is shared by the account's keys, and by nobody else's", async () => {
      const made = await makeDeveloper({ callsPerHour: 2 });
      const first = await makeKey(made.id, "first");
      const second = await makeKey(made.id, "second");
      const other = await makeKey((await makeDeveloper({ name: "other", callsPerHour: 2 })).id);

      expect(await outcome(stations(first.key))).toBe("answered");
      expect(await outcome(stations(second.key))).toBe("answered");
      expect(await outcome(stations(first.key))).toBe("TOO_MANY_REQUESTS");
      expect(await outcome(stations(second.key))).toBe("TOO_MANY_REQUESTS");
      expect(await outcome(stations(other.key))).toBe("answered");
    });

    it("counts a call that is let in, whatever comes of it", async () => {
      const made = await makeDeveloper({ callsPerHour: 2 });
      const { key } = await makeKey(made.id);

      // A station that does not exist, then a procedure that takes a session.
      expect(await outcome(call(v1Router.stations.get, { id: "none" }, byKey(key)))).toBe(
        "NOT_FOUND",
      );
      expect(await outcome(call(v1Router.lists.list, undefined, byKey(key)))).toBe("FORBIDDEN");
      expect(await outcome(stations(key))).toBe("TOO_MANY_REQUESTS");
      // Over the limit, the key is told so wherever it calls.
      expect(await outcome(call(v1Router.lists.list, undefined, byKey(key)))).toBe(
        "TOO_MANY_REQUESTS",
      );
    });

    it("is not used up by a key that does not work", async () => {
      const made = await makeDeveloper({ callsPerHour: 1 });
      const dead = await makeKey(made.id, "dead");
      const { key } = await makeKey(made.id);
      await call(v1Router.keys.revoke, { id: dead.id }, asOwner());

      for (let index = 0; index < 3; index += 1) {
        expect(await outcome(stations(dead.key))).toBe("UNAUTHORIZED");
      }
      expect(await outcome(stations(`key_${"a".repeat(43)}`))).toBe("UNAUTHORIZED");

      expect(await outcome(stations(key))).toBe("answered");
    });

    it("starts again with the hour, and counts no hour but the one under way", async () => {
      const made = await makeDeveloper({ callsPerHour: 2 });
      const { key } = await makeKey(made.id);
      const lastHour = sql`date_trunc('hour', now(), 'UTC') - interval '1 hour'`;
      await database.db
        .insert(developerCalls)
        .values({ developerId: made.id, hour: lastHour, calls: 2 });

      expect(await outcome(stations(key))).toBe("answered");
      expect(await outcome(stations(key))).toBe("answered");
      expect(await outcome(stations(key))).toBe("TOO_MANY_REQUESTS");
      expect((await developers())[0]).toMatchObject({ callsThisHour: 2 });
    });

    it("takes effect at once when it is set, raised or lifted", async () => {
      const made = await makeDeveloper();
      const { key } = await makeKey(made.id);
      const limit = (callsPerHour: number | null) =>
        call(v1Router.developers.update, { id: made.id, callsPerHour }, asOwner());
      for (let index = 0; index < 3; index += 1) await stations(key);

      await limit(3);
      expect(await outcome(stations(key))).toBe("TOO_MANY_REQUESTS");
      await limit(4);
      expect(await outcome(stations(key))).toBe("answered");
      expect(await outcome(stations(key))).toBe("TOO_MANY_REQUESTS");
      await limit(null);
      expect(await outcome(stations(key))).toBe("answered");
    });

    it("refuses a key whose developer account is deleted while its call is let in", async () => {
      const made = await makeDeveloper({ callsPerHour: 5 });
      const { key } = await makeKey(made.id);
      const other = await makeKey((await makeDeveloper({ name: "other" })).id);
      // The account goes after its key is found and before its call is counted, as another
      // operator's deletion would make it. The database then refuses to count the call.
      await database.db.execute(sql`
        create function delete_the_developer() returns trigger language plpgsql as $$
        begin
          delete from developer where id = ${sql.raw(`'${made.id}'`)};
          return new;
        end $$
      `);
      await database.db.execute(sql`
        create trigger gone before insert on developer_calls
        for each row when (new.developer_id = ${sql.raw(`'${made.id}'`)})
        execute function delete_the_developer()
      `);

      try {
        // The key is refused as a key nobody holds, and the call is no fault of the instance.
        await expect(stations(key)).rejects.toEqual(refusal("UNAUTHORIZED"));
        expect(await stations(other.key)).toEqual({ stations: [] });
      } finally {
        await database.db.execute(sql`drop trigger gone on developer_calls`);
        await database.db.execute(sql`drop function delete_the_developer()`);
      }
      // Here the deletion was undone with the statement that failed. Nothing was counted.
      expect(
        (await database.db.select().from(developerCalls)).map((row) => row.developerId),
      ).not.toContain(made.id);
    });

    it("does not hold a key that has no developer account, as an older version made them", async () => {
      const { key, prefix, keyHash } = newKey();
      await database.db
        .insert(apiKey)
        .values({ id: crypto.randomUUID(), userId: "owner", name: "older", prefix, keyHash });

      expect(await stations(key)).toEqual({ stations: [] });
      expect(await database.db.select().from(developerCalls)).toEqual([]);
      const { keys } = await call(v1Router.keys.list, {}, asOwner());
      expect(keys).toMatchObject([{ name: "older", developerId: null }]);

      // It dies with its maker's rights, as it always did.
      await database.db.delete(operator).where(eq(operator.userId, "owner"));
      await expect(stations(key)).rejects.toEqual(refusal("UNAUTHORIZED"));
    });
  });

  describe("the counts", () => {
    it("say what came of a call from what the procedure threw", () => {
      expect(outcomeOf(new ORPCError("UNAUTHORIZED"))).toBe("refused");
      expect(outcomeOf(new ORPCError("FORBIDDEN"))).toBe("refused");
      expect(outcomeOf(new ORPCError("TOO_MANY_REQUESTS"))).toBe("limited");
      expect(outcomeOf(new ORPCError("BAD_REQUEST"))).toBe("invalid");
      expect(outcomeOf(new ORPCError("NOT_FOUND"))).toBe("invalid");
      expect(outcomeOf(new ORPCError("CONFLICT"))).toBe("invalid");
      expect(outcomeOf(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe("failed");
      expect(outcomeOf(new ORPCError("SERVICE_UNAVAILABLE"))).toBe("failed");
      expect(outcomeOf(new Error("a fault"))).toBe("failed");
      expect(outcomeOf("thrown, and no error")).toBe("failed");
    });

    it("hold each call under who made it, the procedure and what came of it", async () => {
      const made = await makeDeveloper({ callsPerHour: 2 });
      const { key, id: keyId } = await makeKey(made.id);
      const dead = await makeKey(made.id, "dead");
      await call(v1Router.keys.revoke, { id: dead.id }, asOwner());
      await usage.flush();
      await database.db.delete(apiUsage);

      await stations(key);
      await outcome(call(v1Router.lists.list, undefined, byKey(key)));
      await outcome(stations(key));
      await outcome(stations(dead.key));
      await outcome(stations(`key_${"a".repeat(43)}`));
      await outcome(call(v1Router.stations.list, {}, { context: context() }));
      await call(v1Router.stations.list, {}, { context: context({ session: "visitor" }) });
      await call(v1Router.stations.list, {}, { context: context({ session: "owner" }) });
      await outcome(
        call(v1Router.stations.get, { id: "none" }, { context: context({ session: "visitor" }) }),
      );
      await usage.flush();

      const hour = new Date(Math.floor(clock.getTime() / HOUR_MS) * HOUR_MS);
      expect(await counted()).toEqual([
        { hour, via: "key", keyId, procedure: "v1.lists.list", outcome: "refused", calls: 1 },
        { hour, via: "key", keyId, procedure: "v1.stations.list", outcome: "answered", calls: 1 },
        { hour, via: "key", keyId, procedure: "v1.stations.list", outcome: "limited", calls: 1 },
        // A key that no longer works is still named by its calls.
        {
          hour,
          via: "key",
          keyId: dead.id,
          procedure: "v1.stations.list",
          outcome: "refused",
          calls: 1,
        },
        // A key nobody made, and a call with no name at all.
        {
          hour,
          via: "none",
          keyId: null,
          procedure: "v1.stations.list",
          outcome: "refused",
          calls: 2,
        },
        // The accounts are counted together, and none is named.
        {
          hour,
          via: "session",
          keyId: null,
          procedure: "v1.stations.get",
          outcome: "invalid",
          calls: 1,
        },
        {
          hour,
          via: "session",
          keyId: null,
          procedure: "v1.stations.list",
          outcome: "answered",
          calls: 2,
        },
      ]);
    });

    it("leave out an operator's calls to what runs the instance, and keep the ones it refuses", async () => {
      const made = await makeDeveloper();
      await makeKey(made.id);
      await developers();
      await call(v1Router.accounts.list, {}, asOwner());
      await call(v1Router.usage.series, { from: AT, to: new Date() }, asOwner());
      // A request the procedure refuses as wrong is the operator's own too.
      await outcome(call(v1Router.developers.update, { id: made.id }, asOwner()));
      // These are not: an account that is no operator, and an operator's page of the web app.
      await outcome(
        call(v1Router.developers.list, undefined, { context: context({ session: "visitor" }) }),
      );
      await outcome(
        call(
          v1Router.keys.list,
          {},
          {
            context: { ...context({ session: "owner" }), site: "https://app.example.org" },
          },
        ),
      );
      // What an account owns is counted as before, an operator's too.
      await call(v1Router.account.get, undefined, asOwner());
      await usage.flush();

      expect(
        (await counted()).map((row) => [row.via, row.procedure, row.outcome, row.calls]),
      ).toEqual([
        ["session", "v1.account.get", "answered", 1],
        ["session", "v1.developers.list", "refused", 1],
        ["session", "v1.keys.list", "refused", 1],
      ]);
    });

    it("are added to what the table holds, write after write", async () => {
      const { key } = await makeKey((await makeDeveloper()).id);
      await usage.flush();
      await database.db.delete(apiUsage);

      await stations(key);
      await usage.flush();
      await stations(key);
      await stations(key);
      await usage.flush();
      // A write with nothing to write changes nothing.
      await usage.flush();

      expect(await counted()).toMatchObject([{ procedure: "v1.stations.list", calls: 3 }]);
    });

    it("are written once when several writes are asked for at once", async () => {
      const { key } = await makeKey((await makeDeveloper()).id);
      await usage.flush();
      await database.db.delete(apiUsage);
      await stations(key);

      await Promise.all([usage.flush(), usage.flush(), usage.stop()]);

      expect(await counted()).toMatchObject([{ calls: 1 }]);
    });

    it("fall in the hour of the call, UTC's", async () => {
      clock = new Date("2026-10-09T08:59:59.999Z");
      await call(v1Router.stations.list, {}, { context: context({ session: "visitor" }) });
      clock = new Date("2026-10-09T09:00:00.000Z");
      await call(v1Router.stations.list, {}, { context: context({ session: "visitor" }) });
      await usage.flush();

      expect((await counted()).map((row) => [row.hour.toISOString(), row.calls])).toEqual([
        ["2026-10-09T08:00:00.000Z", 1],
        ["2026-10-09T09:00:00.000Z", 1],
      ]);
    });

    it("note the minute a key was last used while it worked, and never an earlier one", async () => {
      const made = await makeDeveloper();
      const { key, id } = await makeKey(made.id);
      const used = async () => {
        const [row] = await database.db.select().from(apiKey).where(eq(apiKey.id, id));
        return row?.lastUsedAt?.toISOString() ?? null;
      };

      clock = new Date("2026-10-09T08:15:42.500Z");
      await stations(key);
      // Nothing is written on the call itself.
      expect(await used()).toBeNull();
      await usage.flush();
      expect(await used()).toBe("2026-10-09T08:15:00.000Z");

      // An earlier call, counted late by another process, does not move it back.
      clock = new Date("2026-10-09T08:03:00Z");
      await stations(key);
      await usage.flush();
      expect(await used()).toBe("2026-10-09T08:15:00.000Z");

      // Neither does a call that the key no longer made as a working key.
      clock = new Date("2026-10-09T09:30:00Z");
      await call(v1Router.keys.revoke, { id }, asOwner());
      await outcome(stations(key));
      await usage.flush();
      expect(await used()).toBe("2026-10-09T08:15:00.000Z");
    });

    it("leave out the calls of a key that was deleted since, and keep the others", async () => {
      const gone = await makeDeveloper({ name: "gone" });
      const { key } = await makeKey(gone.id);
      await usage.flush();
      await database.db.delete(apiUsage);

      await stations(key);
      await call(v1Router.stations.list, {}, { context: context({ session: "visitor" }) });
      await database.db.delete(developer).where(eq(developer.id, gone.id));
      await usage.flush();

      expect(await counted()).toMatchObject([{ via: "session", calls: 1 }]);
    });

    it("are lost when they cannot be written, said in the log, and not written twice", async () => {
      const said = vi.spyOn(console, "error").mockImplementation(() => {});
      // A database that takes no write for a while.
      let broken = true;
      const db = new Proxy(database.db, {
        get(target, property) {
          if (property !== "transaction" || !broken) return Reflect.get(target, property);
          return () => Promise.reject(new Error("This database takes no write"));
        },
      });
      const failing = createUsage(db, { every: null });
      const count = () =>
        failing.count({ via: "session", keyId: null, procedure: "p", outcome: "answered" });

      count();
      count();
      await failing.flush();
      expect(said).toHaveBeenCalledWith(
        "usage: 2 calls were counted and could not be written",
        expect.any(Error),
      );

      broken = false;
      count();
      await failing.flush();
      said.mockRestore();

      expect(await counted()).toMatchObject([{ procedure: "p", calls: 1 }]);
    });

    it("answer a call whatever the counter does", async () => {
      const broken: Usage = {
        count() {
          throw new Error("The counter is broken");
        },
        flush: () => Promise.resolve(),
        stop: () => Promise.resolve(),
      };

      expect(
        await call(
          v1Router.stations.list,
          {},
          { context: { ...context({ session: "visitor" }), usage: broken } },
        ),
      ).toEqual({ stations: [] });
      await expect(
        call(v1Router.stations.list, {}, { context: { ...context(), usage: broken } }),
      ).rejects.toEqual(refusal("UNAUTHORIZED"));
    });

    it.each([
      ["2026-10-09T08:00:00Z", "2025-09-09T08:00:00.000Z"],
      // A month that has no 31st, nor a 29th or a 30th that year, gives its last day.
      ["2026-03-31T08:00:00Z", "2025-02-28T08:00:00.000Z"],
      ["2026-03-29T08:00:00Z", "2025-02-28T08:00:00.000Z"],
      ["2025-03-31T23:00:00Z", "2024-02-29T23:00:00.000Z"],
      ["2026-12-31T00:00:00Z", "2025-11-30T00:00:00.000Z"],
      ["2026-01-15T12:00:00Z", "2024-12-15T12:00:00.000Z"],
    ])("are kept thirteen months by the calendar: from %s back to %s", (from, to) => {
      expect(monthsBefore(new Date(from), 13).toISOString()).toBe(to);
    });

    it("are not deleted early at the end of a month", async () => {
      const row = { via: "session", keyId: null, procedure: "p", outcome: "answered", calls: 1 };
      const kept = new Date("2025-03-01T08:00:00Z");
      await database.db.insert(apiUsage).values({ ...row, hour: kept } as never);

      clock = new Date("2026-03-31T08:30:00Z");
      await usage.flush();

      const left = (await counted()).filter((found) => found.procedure === "p");
      expect(left.map((found) => found.hour)).toEqual([kept]);
    });

    it("are deleted thirteen months after their hour, with the limit's rows", async () => {
      const made = await makeDeveloper();
      const row = { via: "session", keyId: null, procedure: "p", outcome: "answered", calls: 1 };
      const kept = new Date("2025-09-09T08:00:00Z");
      const old = new Date("2025-09-09T07:00:00Z");
      await database.db.insert(apiUsage).values([
        { ...row, hour: kept },
        { ...row, hour: old },
      ] as never);
      await database.db.insert(developerCalls).values([
        { developerId: made.id, hour: kept, calls: 1 },
        { developerId: made.id, hour: old, calls: 1 },
      ]);

      // A write deletes them once in the hour, with or without a call to write.
      clock = new Date("2026-10-09T08:30:00Z");
      await usage.flush();

      const left = (await counted()).filter((found) => found.procedure === "p");
      expect(left.map((found) => found.hour)).toEqual([kept]);
      expect((await database.db.select().from(developerCalls)).map((found) => found.hour)).toEqual([
        kept,
      ]);
    });
  });

  describe("what the counts say", () => {
    const at = (text: string) => new Date(`2026-10-${text}:00:00Z`);
    type Row = [
      hour: string,
      keyId: string | null,
      procedure: string,
      outcome: string,
      calls: number,
    ];
    let ids: { screens: string; clock: string; first: string; second: string; third: string };

    beforeEach(async () => {
      const screens = await makeDeveloper({ name: "screens" });
      const clockAccount = await makeDeveloper({ name: "clock" });
      const first = await makeKey(screens.id, "first");
      const second = await makeKey(screens.id, "second");
      const third = await makeKey(clockAccount.id, "third");
      ids = {
        screens: screens.id,
        clock: clockAccount.id,
        first: first.id,
        second: second.id,
        third: third.id,
      };
      await usage.flush();
      await database.db.delete(apiUsage);

      const rows: Row[] = [
        // 23:00 on the 8th in Paris, then midnight on the 9th.
        ["08T21", first.id, "v1.stations.list", "answered", 10],
        ["08T22", first.id, "v1.stations.list", "answered", 20],
        ["08T22", first.id, "v1.forecasts.get", "invalid", 2],
        ["08T22", second.id, "v1.stations.list", "limited", 5],
        ["09T08", third.id, "v1.tides.extremes", "answered", 7],
        ["09T08", third.id, "v1.tides.extremes", "refused", 1],
        ["09T08", null, "v1.stations.list", "answered", 100],
        ["09T08", null, "v1.spots.list", "failed", 3],
      ];
      await database.db.insert(apiUsage).values(
        rows.map(([hour, keyId, procedure, outcome, calls]) => ({
          hour: at(hour),
          via: keyId ? "key" : "session",
          keyId,
          procedure,
          outcome,
          calls,
        })) as never,
      );
      await database.db.insert(apiUsage).values({
        hour: at("09T08"),
        via: "none",
        keyId: null,
        procedure: "v1.stations.list",
        outcome: "refused",
        calls: 4,
      });
    });

    const series = (input: object) =>
      call(
        v1Router.usage.series,
        { from: at("08T00"), to: at("10T00"), ...input } as never,
        asOwner(),
      );
    const breakdown = (input: object) =>
      call(
        v1Router.usage.breakdown,
        { from: at("08T00"), to: at("10T00"), ...input } as never,
        asOwner(),
      );
    const none = { answered: 0, invalid: 0, refused: 0, limited: 0, failed: 0 };

    it("by the hour, with what came of the calls, and no hour that had none", async () => {
      expect((await series({})).points).toEqual([
        { ...none, at: at("08T21"), answered: 10 },
        { ...none, at: at("08T22"), answered: 20, invalid: 2, limited: 5 },
        { ...none, at: at("09T08"), answered: 107, refused: 5, failed: 3 },
      ]);
    });

    it("of one developer account, or of one key", async () => {
      expect((await series({ developerId: ids.screens })).points).toEqual([
        { ...none, at: at("08T21"), answered: 10 },
        { ...none, at: at("08T22"), answered: 20, invalid: 2, limited: 5 },
      ]);
      expect((await series({ keyId: ids.second })).points).toEqual([
        { ...none, at: at("08T22"), limited: 5 },
      ]);
      expect((await series({ developerId: ids.clock, keyId: ids.first })).points).toEqual([]);
    });

    it("within the span asked for, its first hour counted and its last left out", async () => {
      const { points } = await series({ from: at("08T22"), to: at("09T08") });

      expect(points.map((point) => point.at)).toEqual([at("08T22")]);
    });

    it("by the day, where the reader's day starts", async () => {
      const utc = await series({ step: "day" });
      expect(utc.points.map((point) => [point.at, point.answered])).toEqual([
        [at("08T00"), 30],
        [at("09T00"), 107],
      ]);

      // Midnight in Paris is 22:00 UTC that week.
      const paris = await series({ step: "day", timeZone: "Europe/Paris" });
      expect(paris.points.map((point) => [point.at, point.answered])).toEqual([
        [at("07T22"), 10],
        [at("08T22"), 127],
      ]);
    });

    it.each([
      ["a span that ends before it starts", { from: at("09T00"), to: at("08T00") }],
      ["a span of no length", { from: at("09T00"), to: at("09T00") }],
      ["more than a month by the hour", { from: new Date("2026-08-01T00:00:00Z") }],
      [
        "more than thirteen months by the day",
        { step: "day", from: new Date("2025-08-01T00:00:00Z") },
      ],
      ["a time zone nobody knows", { step: "day", timeZone: "Europe/Nowhere" }],
      ["a time zone that is a statement", { step: "day", timeZone: "UTC'); drop table x; --" }],
      ["a step that is neither", { step: "week" }],
      ["a developer account that is no id", { developerId: "screens" }],
    ])("refuses %s", async (_, input) => {
      await expect(series(input)).rejects.toEqual(refusal("BAD_REQUEST"));
    });

    it("by the kind of caller", async () => {
      expect((await breakdown({ by: "via" })).rows).toEqual([
        { ...none, id: "session", name: null, answered: 100, failed: 3 },
        { ...none, id: "key", name: null, answered: 37, invalid: 2, refused: 1, limited: 5 },
        { ...none, id: "none", name: null, refused: 4 },
      ]);
    });

    it("by developer account and by key, for the calls made with keys", async () => {
      expect((await breakdown({ by: "developer" })).rows).toEqual([
        { ...none, id: ids.screens, name: "screens", answered: 30, invalid: 2, limited: 5 },
        { ...none, id: ids.clock, name: "clock", answered: 7, refused: 1 },
      ]);
      expect((await breakdown({ by: "key" })).rows).toEqual([
        { ...none, id: ids.first, name: "first", answered: 30, invalid: 2 },
        { ...none, id: ids.third, name: "third", answered: 7, refused: 1 },
        { ...none, id: ids.second, name: "second", limited: 5 },
      ]);
      expect((await breakdown({ by: "key", developerId: ids.screens })).rows).toHaveLength(2);
    });

    it("by procedure, the most called first, for everyone or for one developer account", async () => {
      expect((await breakdown({ by: "procedure" })).rows.map((row) => [row.id, row.name])).toEqual([
        ["v1.stations.list", null],
        ["v1.tides.extremes", null],
        ["v1.spots.list", null],
        ["v1.forecasts.get", null],
      ]);
      expect((await breakdown({ by: "procedure", developerId: ids.screens })).rows).toEqual([
        { ...none, id: "v1.stations.list", name: null, answered: 30, limited: 5 },
        { ...none, id: "v1.forecasts.get", name: null, invalid: 2 },
      ]);
    });

    it("names no developer account for a key that has none", async () => {
      const { prefix, keyHash } = newKey();
      const id = crypto.randomUUID();
      await database.db
        .insert(apiKey)
        .values({ id, userId: "owner", name: "older", prefix, keyHash });
      await database.db.insert(apiUsage).values({
        hour: at("09T08"),
        via: "key",
        keyId: id,
        procedure: "v1.stations.list",
        outcome: "answered",
        calls: 500,
      });

      expect((await breakdown({ by: "developer" })).rows[0]).toEqual({
        ...none,
        id: null,
        name: null,
        answered: 500,
      });
    });

    it("refuses a span that is too long, or a way to break it down that is none", async () => {
      await expect(
        breakdown({ by: "procedure", from: new Date("2025-08-01T00:00:00Z") }),
      ).rejects.toEqual(refusal("BAD_REQUEST"));
      await expect(breakdown({ by: "account" })).rejects.toEqual(refusal("BAD_REQUEST"));
      await expect(breakdown({})).rejects.toEqual(refusal("BAD_REQUEST"));
    });
  });

  describe("the accounts that signed up", () => {
    const list = (input: object = {}) => call(v1Router.accounts.list, input as never, asOwner());

    beforeEach(async () => {
      // Three accounts exist. Two more, made at the same moment, and one made later.
      const same = new Date("2026-10-09T09:00:00Z");
      await database.db.insert(user).values([
        { id: "twin-a", name: "Ana", email: "ana@example.org", createdAt: same },
        { id: "twin-b", name: "100% Ben", email: "ben@example.org", createdAt: same },
        {
          id: "late",
          name: "Late",
          email: "LATE@Example.org",
          createdAt: new Date("2126-01-01T00:00:00Z"),
        },
      ]);
    });

    it("are listed the newest first, with their name, their address and who runs the instance", async () => {
      const { accounts, next, total } = await list();

      expect([accounts.length, next, total]).toEqual([6, null, 6]);
      expect(accounts[0]).toEqual({
        id: "late",
        name: "Late",
        email: "LATE@Example.org",
        createdAt: new Date("2126-01-01T00:00:00Z"),
        isOperator: false,
      });
      expect(Object.fromEntries(accounts.map((found) => [found.id, found.isOperator]))).toEqual({
        late: false,
        "twin-a": false,
        "twin-b": false,
        owner: true,
        second: true,
        visitor: false,
      });
    });

    it("come page after page, each account once, those of one moment too", async () => {
      const seen: string[] = [];
      let after: string | undefined;
      for (let page = 0; page < 6; page += 1) {
        const found = await list({ limit: 2, after });
        expect(found.total).toBe(6);
        seen.push(...found.accounts.map((account) => account.id));
        if (found.next === null) break;
        after = found.next;
      }

      expect(seen).toHaveLength(6);
      expect(new Set(seen).size).toBe(6);
      expect(seen[0]).toBe("late");
    });

    it("are found by a part of their name or of their address, in any case", async () => {
      expect((await list({ q: "LATE" })).accounts.map((found) => found.id)).toEqual(["late"]);
      expect(await list({ q: "ben@" })).toMatchObject({ accounts: [{ id: "twin-b" }], total: 1 });
      // A character that means something in a pattern is taken as itself.
      expect((await list({ q: "100%" })).accounts.map((found) => found.id)).toEqual(["twin-b"]);
      expect(await list({ q: "%" })).toMatchObject({ accounts: [{ id: "twin-b" }], total: 1 });
      expect(await list({ q: "_" })).toMatchObject({ accounts: [], total: 0 });
      expect(await list({ q: "nobody" })).toEqual({ accounts: [], next: null, total: 0 });
    });

    it("give nothing after an account that does not exist", async () => {
      expect(await list({ after: "nobody" })).toMatchObject({ accounts: [], next: null });
    });

    it("refuse a page of no account, or of too many", async () => {
      await expect(list({ limit: 0 })).rejects.toEqual(refusal("BAD_REQUEST"));
      await expect(list({ limit: 201 })).rejects.toEqual(refusal("BAD_REQUEST"));
    });
  });

  describe("what an operator did", () => {
    const done = async (input: object = {}) =>
      (await call(v1Router.actions.list, input as never, asOwner())).actions;
    // What a record says, without its id and its moment.
    const said = async (input: object = {}) =>
      (await done(input)).map(({ id: _id, at: _at, ...rest }) => rest).reverse();
    const record = {
      operatorName: "Owner",
      developerName: "Harbour screens",
      keyName: null,
      changes: null,
    };

    it("is recorded with each change, by whom, to what, and with what it changed", async () => {
      const made = await makeDeveloper({ contact: "ana@example.org", callsPerHour: 100 });
      const update = (changes: object) =>
        call(v1Router.developers.update, { id: made.id, ...changes } as never, asOwner());
      await update({ name: "Quay screens", callsPerHour: 300 });
      await update({ contact: "ben@example.org", note: "Asked on the quay." });
      await update({ callsPerHour: null });
      await update({ suspended: true });
      await update({ suspended: false });
      const key = await makeKey(made.id, "tide clock", "second");
      await call(v1Router.keys.revoke, { id: key.id }, asOwner());
      await call(v1Router.developers.delete, { id: made.id }, asOwner());

      const developerId = made.id;
      const quay = { ...record, developerId, developerName: "Quay screens" };
      expect(await said()).toEqual([
        {
          ...record,
          developerId,
          action: "developer.create",
          changes: { callsPerHour: { from: null, to: 100 } },
        },
        {
          ...quay,
          action: "developer.update",
          changes: {
            name: { from: "Harbour screens", to: "Quay screens" },
            callsPerHour: { from: 100, to: 300 },
          },
        },
        // A contact and a note are said to have changed, and are not copied.
        { ...quay, action: "developer.update", changes: { contact: true, note: true } },
        { ...quay, action: "developer.update", changes: { callsPerHour: { from: 300, to: null } } },
        { ...quay, action: "developer.suspend" },
        { ...quay, action: "developer.resume" },
        { ...quay, action: "key.create", keyName: "tide clock", operatorName: "Second" },
        { ...quay, action: "key.revoke", keyName: "tide clock" },
        // The account is gone, and the record of its deletion still names it.
        { ...quay, action: "developer.delete" },
      ]);
    });

    it("never holds a key, a contact or a note", async () => {
      const made = await makeDeveloper({ contact: "ana@example.org", note: "A secret note." });
      const { key } = await makeKey(made.id);
      await call(
        v1Router.developers.update,
        { id: made.id, contact: "ben@example.org", note: "Another note." },
        asOwner(),
      );

      const stored = JSON.stringify(await database.db.select().from(operatorAction));
      for (const kept of [key, key.slice(8), "ana@", "ben@", "secret", "Another"]) {
        expect(stored).not.toContain(kept);
      }
    });

    it("says nothing of what changed nothing, nor of what was refused", async () => {
      const made = await makeDeveloper({ callsPerHour: 100 });
      const update = (changes: object, by = asOwner()) =>
        outcome(call(v1Router.developers.update, { id: made.id, ...changes } as never, by));
      const before = await said();
      const visitor = { context: context({ session: "visitor" }) };

      // The values the account already has, and a state it is already in.
      expect(await update({ name: "Harbour screens", callsPerHour: 100 })).toBe("answered");
      expect(await update({ suspended: false })).toBe("answered");
      expect(await update({ name: "" })).toBe("BAD_REQUEST");
      expect(await update({ name: "Taken over" }, visitor)).toBe("FORBIDDEN");
      expect(await outcome(call(v1Router.developers.delete, { id: made.id }, visitor))).toBe(
        "FORBIDDEN",
      );
      expect(
        await outcome(
          call(v1Router.keys.create, { name: "k", developerId: crypto.randomUUID() }, asOwner()),
        ),
      ).toBe("NOT_FOUND");
      expect(
        await outcome(call(v1Router.keys.revoke, { id: crypto.randomUUID() }, asOwner())),
      ).toBe("NOT_FOUND");

      expect(await said()).toEqual(before);
    });

    it("is recorded once for a suspension asked for twice, and keeps the first moment", async () => {
      const made = await makeDeveloper();
      const suspend = () =>
        call(v1Router.developers.update, { id: made.id, suspended: true }, asOwner());

      const first = await suspend();
      const second = await suspend();

      expect(second.suspendedAt).toEqual(first.suspendedAt);
      expect((await said()).map((found) => found.action)).toEqual([
        "developer.create",
        "developer.suspend",
      ]);
    });

    it("is not kept when what it records is not done", async () => {
      const made = await makeDeveloper();
      // A database that refuses the record: the change it goes with is undone.
      await database.db.execute(sql`
        alter table operator_action add constraint no_deletion check (action <> 'developer.delete')
      `);
      try {
        await expect(
          call(v1Router.developers.delete, { id: made.id }, asOwner()),
        ).rejects.toBeDefined();
      } finally {
        await database.db.execute(sql`alter table operator_action drop constraint no_deletion`);
      }

      expect((await developers()).map((found) => found.id)).toEqual([made.id]);
      expect((await said()).map((found) => found.action)).toEqual(["developer.create"]);
    });

    it("keeps the record of an operator whose account is deleted, without their name", async () => {
      const made = await makeDeveloper();
      await call(
        v1Router.developers.update,
        { id: made.id, name: "Renamed" },
        { context: context({ session: "second" }) },
      );
      await database.db.delete(user).where(eq(user.id, "second"));

      expect((await said()).map((found) => [found.action, found.operatorName])).toEqual([
        ["developer.create", "Owner"],
        ["developer.update", null],
      ]);
    });

    it("names no developer account for a key that had none", async () => {
      const { prefix, keyHash } = newKey();
      const id = crypto.randomUUID();
      await database.db
        .insert(apiKey)
        .values({ id, userId: "owner", name: "older", prefix, keyHash });

      await call(v1Router.keys.revoke, { id }, asOwner());

      expect(await said()).toEqual([
        {
          ...record,
          action: "key.revoke",
          developerId: null,
          developerName: null,
          keyName: "older",
        },
      ]);
    });

    it("is listed the latest first, for one developer account, and page after page", async () => {
      const first = await makeDeveloper({ name: "first" });
      const second = await makeDeveloper({ name: "second" });
      await makeKey(first.id, "a");
      await makeKey(second.id, "b");
      await makeKey(first.id, "c");

      expect((await done()).map((found) => found.keyName ?? found.developerName)).toEqual([
        "c",
        "b",
        "a",
        "second",
        "first",
      ]);
      expect((await done({ developerId: first.id })).map((found) => found.action)).toEqual([
        "key.create",
        "key.create",
        "developer.create",
      ]);

      const seen: string[] = [];
      let after: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const found = await call(v1Router.actions.list, { limit: 2, after }, asOwner());
        seen.push(...found.actions.map((action) => action.id));
        if (found.next === null) break;
        after = found.next;
      }
      expect(seen).toEqual((await done()).map((found) => found.id));
      await expect(done({ limit: 0 })).rejects.toEqual(refusal("BAD_REQUEST"));
      await expect(done({ developerId: "first" })).rejects.toEqual(refusal("BAD_REQUEST"));
    });

    it("is deleted thirteen months after its day, with the counts", async () => {
      const row = { operatorId: "owner", action: "developer.suspend" as const };
      await database.db.insert(operatorAction).values([
        { ...row, id: "kept", at: new Date("2025-09-09T08:00:00Z") },
        { ...row, id: "old", at: new Date("2025-09-09T07:59:59Z") },
      ]);

      clock = new Date("2026-10-09T08:30:00Z");
      await usage.flush();

      expect((await database.db.select().from(operatorAction)).map((found) => found.id)).toEqual([
        "kept",
      ]);
    });
  });
});
