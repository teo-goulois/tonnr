import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { operator, operatorAction } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { spotPublication, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// A spot is made public by a request that an operator accepts: decision 034.
describe.skipIf(!TEST_DATABASE_URL)("making a spot public", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  const point = { name: "The reef", latitude: 48, longitude: -4.5 };

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
    await db.delete(operatorAction);
    await db.delete(user);
    await db.delete(surfBreak);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
      { id: "cleo", name: "Cleo", email: "cleo@example.org" },
      { id: "owner", name: "Owner", email: "owner@example.org" },
    ]);
    await db.insert(operator).values({ userId: "owner" });
  });

  const context = (id: string, site: string): Context => ({
    db: database.db,
    session: {
      user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
      session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
    } as Session,
    authorization: null,
    site,
    adminSites: [ADMIN],
    usage,
    forecasts,
    places: testPlaces().places,
    verification: testVerification(database.db, { on: false }).verification,
    reply: {},
    server: { startedAt: new Date("2026-10-11T08:00:00Z"), webOrigin: WEB },
  });
  const by = (id: string) => ({ context: context(id, WEB) });
  const asOperator = () => ({ context: context("owner", ADMIN) });

  const code = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
      return "answered";
    } catch (error) {
      return error instanceof ORPCError ? error.code : "threw";
    }
  };
  const waiting = async () =>
    (await call(v1Router.publications.list, {}, asOperator())).publications;

  it("keeps a spot its owner's alone until they ask, and says that it waits once they do", async () => {
    const made = await call(v1Router.spots.create, point, by("ana"));
    expect(made.publication).toBeNull();

    const asked = await call(
      v1Router.spots.requestPublication,
      { id: made.id, note: "Everyone parks there" },
      by("ana"),
    );
    expect(asked.publication).toMatchObject({
      status: "pending",
      note: "Everyone parks there",
      reason: null,
      breakId: null,
      decidedAt: null,
    });
    // The catalogue has nothing of it yet.
    expect(await database.db.select().from(surfBreak)).toEqual([]);
    expect((await call(v1Router.spots.list, undefined, by("ana"))).spots[0]?.publication).toEqual(
      asked.publication,
    );
  });

  it("takes one request for a spot at a time: asking again changes its note", async () => {
    const made = await call(v1Router.spots.create, point, by("ana"));
    await call(v1Router.spots.requestPublication, { id: made.id, note: "First" }, by("ana"));
    const again = await call(v1Router.spots.requestPublication, { id: made.id }, by("ana"));

    expect(again.publication).toMatchObject({ status: "pending", note: null });
    expect(await database.db.select().from(spotPublication)).toHaveLength(1);
  });

  it("takes no request for a spot that is someone else's", async () => {
    const made = await call(v1Router.spots.create, point, by("ana"));
    expect(await code(call(v1Router.spots.requestPublication, { id: made.id }, by("ben")))).toBe(
      "NOT_FOUND",
    );
    expect(await code(call(v1Router.spots.cancelPublication, { id: made.id }, by("ben")))).toBe(
      "NOT_FOUND",
    );
  });

  it("lets ten of an account's spots wait, and no more", async () => {
    for (let index = 0; index < 10; index += 1) {
      const one = await call(v1Router.spots.create, { ...point, name: `Spot ${index}` }, by("ana"));
      await call(v1Router.spots.requestPublication, { id: one.id }, by("ana"));
    }
    const more = await call(v1Router.spots.create, point, by("ana"));
    expect(await code(call(v1Router.spots.requestPublication, { id: more.id }, by("ana")))).toBe(
      "FORBIDDEN",
    );
    // Another account's requests are its own.
    const bens = await call(v1Router.spots.create, point, by("ben"));
    expect(await code(call(v1Router.spots.requestPublication, { id: bens.id }, by("ben")))).toBe(
      "answered",
    );
  });

  it("takes a request back while it waits", async () => {
    const made = await call(v1Router.spots.create, point, by("ana"));
    await call(v1Router.spots.requestPublication, { id: made.id }, by("ana"));

    const back = await call(v1Router.spots.cancelPublication, { id: made.id }, by("ana"));
    expect(back.publication).toBeNull();
    expect(await waiting()).toEqual([]);
    // Taking it back again changes nothing.
    expect(await code(call(v1Router.spots.cancelPublication, { id: made.id }, by("ana")))).toBe(
      "answered",
    );
  });

  it("shows an operator the spot, the breaks near it and how many others keep one there", async () => {
    await database.db.insert(surfBreak).values([
      { id: "near", slug: "near", name: "Near", latitude: 48.002, longitude: -4.5 },
      { id: "far", slug: "far", name: "Far", latitude: 48.02, longitude: -4.5 },
    ]);
    const made = await call(
      v1Router.spots.create,
      { ...point, characteristics: { breakTypes: ["reef"] } },
      by("ana"),
    );
    // Two spots of one other account count once, and one too far away does not.
    await call(v1Router.spots.create, { ...point, latitude: 48.0005 }, by("ben"));
    await call(v1Router.spots.create, { ...point, latitude: 48.0006 }, by("ben"));
    await call(v1Router.spots.create, { ...point, latitude: 48.01 }, by("cleo"));
    await call(v1Router.spots.requestPublication, { id: made.id, note: "Known" }, by("ana"));

    const [request] = await waiting();
    expect(request).toMatchObject({
      status: "pending",
      note: "Known",
      accountId: "ana",
      spot: { id: made.id, name: "The reef", latitude: 48, longitude: -4.5 },
      otherAccountsHere: 1,
    });
    expect(request?.spot.characteristics.breakTypes).toEqual(["reef"]);
    expect(request?.nearbyBreaks.map((found) => found.id)).toEqual(["near"]);
    expect(request?.nearbyBreaks[0]?.meters).toBeGreaterThan(200);
    expect(request?.nearbyBreaks[0]?.meters).toBeLessThan(250);
  });

  it("keeps the requests to an operator, from the admin's site", async () => {
    expect(await code(call(v1Router.publications.list, {}, by("ana")))).toBe("FORBIDDEN");
    expect(await code(call(v1Router.publications.list, {}, by("owner")))).toBe("FORBIDDEN");
  });

  it("makes a break of an accepted spot, which names no one and stays when the spot goes", async () => {
    const made = await call(
      v1Router.spots.create,
      { ...point, characteristics: { breakTypes: ["reef"], offshoreDirectionDegrees: 90 } },
      by("ana"),
    );
    await call(v1Router.spots.requestPublication, { id: made.id }, by("ana"));
    const [request] = await waiting();

    const accepted = await call(
      v1Router.publications.accept,
      { id: request!.id, spotUpdatedAt: request!.spot.updatedAt },
      asOperator(),
    );
    expect(accepted).toMatchObject({ status: "accepted", nearbyBreaks: [] });
    expect(accepted.breakId).toEqual(expect.any(String));

    const found = await call(v1Router.breaks.get, { id: accepted.breakId! }, by("ben"));
    expect(found).toMatchObject({
      name: "The reef",
      latitude: 48,
      longitude: -4.5,
      source: { provider: null, url: null, attribution: null, license: null },
    });
    expect(found.characteristics).toMatchObject({
      breakTypes: ["reef"],
      offshoreDirectionDegrees: 90,
      bottomTypes: null,
    });
    expect(JSON.stringify(found)).not.toContain("ana");

    // The owner reads it on their spot, which stands on the break it became.
    const mine = await call(v1Router.spots.get, { id: made.id }, by("ana"));
    expect(mine).toMatchObject({
      breakId: accepted.breakId,
      updatedAt: made.updatedAt,
      publication: { status: "accepted", breakId: accepted.breakId },
    });
    expect(await waiting()).toEqual([]);
    const { actions } = await call(v1Router.actions.list, {}, asOperator());
    expect(actions[0]).toMatchObject({
      action: "spot.publish",
      accountId: "ana",
      changes: { breakId: accepted.breakId },
    });

    // What is public is not asked for again, nor taken back by its owner.
    expect(await code(call(v1Router.spots.requestPublication, { id: made.id }, by("ana")))).toBe(
      "CONFLICT",
    );
    await call(v1Router.spots.cancelPublication, { id: made.id }, by("ana"));
    await call(v1Router.spots.delete, { id: made.id }, by("ana"));
    expect(await code(call(v1Router.breaks.get, { id: accepted.breakId! }, by("ben")))).toBe(
      "answered",
    );
  });

  it("publishes what was read: a spot that changed since is not accepted", async () => {
    const made = await call(v1Router.spots.create, point, by("ana"));
    await call(v1Router.spots.requestPublication, { id: made.id }, by("ana"));
    const [request] = await waiting();
    await call(v1Router.spots.update, { id: made.id, name: "Something else" }, by("ana"));

    expect(
      await code(
        call(
          v1Router.publications.accept,
          { id: request!.id, spotUpdatedAt: request!.spot.updatedAt },
          asOperator(),
        ),
      ),
    ).toBe("CONFLICT");
    expect(await database.db.select().from(surfBreak)).toEqual([]);
  });

  it("tells the owner why a spot was refused, and lets them ask again", async () => {
    const made = await call(v1Router.spots.create, point, by("ana"));
    await call(v1Router.spots.requestPublication, { id: made.id }, by("ana"));
    const [request] = await waiting();

    await call(
      v1Router.publications.refuse,
      { id: request!.id, reason: "Known to few" },
      asOperator(),
    );
    const mine = await call(v1Router.spots.get, { id: made.id }, by("ana"));
    expect(mine.publication).toMatchObject({ status: "refused", reason: "Known to few" });
    expect(await database.db.select().from(surfBreak)).toEqual([]);
    const { actions } = await call(v1Router.actions.list, {}, asOperator());
    expect(actions[0]).toMatchObject({ action: "spot.refuse", accountId: "ana", changes: null });

    // A request is answered once.
    expect(
      await code(
        call(v1Router.publications.refuse, { id: request!.id, reason: "Again" }, asOperator()),
      ),
    ).toBe("CONFLICT");
    const again = await call(v1Router.spots.requestPublication, { id: made.id }, by("ana"));
    expect(again.publication).toMatchObject({ status: "pending", reason: null });
  });
});
