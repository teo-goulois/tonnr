import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// A list holds its owner's spots beside its stations and its breaks: decision 017.
describe.skipIf(!TEST_DATABASE_URL)("a spot in a list", () => {
  const WEB = "https://app.example.org";

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
  });

  const by = (id: string) => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
        session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: WEB,
      adminSites: [],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-11T08:00:00Z"), webOrigin: WEB },
    };
    return { context };
  };

  const code = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
      return "answered";
    } catch (error) {
      return error instanceof ORPCError ? error.code : "threw";
    }
  };

  const spotOf = (owner: string, name: string) =>
    call(v1Router.spots.create, { name, latitude: 48, longitude: -4.5 }, by(owner));

  it("holds the spots in the order they were added, each once", async () => {
    const reef = await spotOf("ana", "The reef");
    const bay = await spotOf("ana", "The bay");
    const list = await call(v1Router.lists.create, { name: "Winter" }, by("ana"));
    expect(list.spotIds).toEqual([]);

    await call(v1Router.lists.addSpot, { id: list.id, spotId: bay.id }, by("ana"));
    await call(v1Router.lists.addSpot, { id: list.id, spotId: reef.id }, by("ana"));
    const again = await call(v1Router.lists.addSpot, { id: list.id, spotId: bay.id }, by("ana"));
    expect(again.spotIds).toEqual([bay.id, reef.id]);

    const { lists } = await call(v1Router.lists.list, undefined, by("ana"));
    expect(lists.map((one) => one.spotIds)).toEqual([[bay.id, reef.id]]);
  });

  it("makes the favorites for the first spot saved to them", async () => {
    const reef = await spotOf("ana", "The reef");
    const favorites = await call(
      v1Router.lists.addSpot,
      { id: "favorites", spotId: reef.id },
      by("ana"),
    );
    expect(favorites).toMatchObject({ isDefault: true, spotIds: [reef.id] });
  });

  it("takes no spot that is someone else's, and makes no favorites for it", async () => {
    const bens = await spotOf("ben", "Ben's own");
    expect(
      await code(call(v1Router.lists.addSpot, { id: "favorites", spotId: bens.id }, by("ana"))),
    ).toBe("NOT_FOUND");
    expect(await call(v1Router.lists.list, undefined, by("ana"))).toEqual({ lists: [] });
  });

  it("answers nothing of a list that is someone else's", async () => {
    const reef = await spotOf("ana", "The reef");
    const bens = await call(v1Router.lists.create, { name: "Ben's" }, by("ben"));
    expect(
      await code(call(v1Router.lists.addSpot, { id: bens.id, spotId: reef.id }, by("ana"))),
    ).toBe("NOT_FOUND");
    expect(
      await code(call(v1Router.lists.removeSpot, { id: bens.id, spotId: reef.id }, by("ana"))),
    ).toBe("NOT_FOUND");
  });

  it("removes a spot from a list and leaves the spot", async () => {
    const reef = await spotOf("ana", "The reef");
    const list = await call(v1Router.lists.create, { name: "Winter" }, by("ana"));
    await call(v1Router.lists.addSpot, { id: list.id, spotId: reef.id }, by("ana"));

    const emptied = await call(
      v1Router.lists.removeSpot,
      { id: list.id, spotId: reef.id },
      by("ana"),
    );
    expect(emptied.spotIds).toEqual([]);
    // Removing it again changes nothing.
    expect(
      await code(call(v1Router.lists.removeSpot, { id: list.id, spotId: reef.id }, by("ana"))),
    ).toBe("answered");
    const { spots } = await call(v1Router.spots.list, undefined, by("ana"));
    expect(spots.map((one) => one.id)).toEqual([reef.id]);
  });

  it("lets a deleted spot leave the lists it was in", async () => {
    const reef = await spotOf("ana", "The reef");
    const list = await call(v1Router.lists.create, { name: "Winter" }, by("ana"));
    await call(v1Router.lists.addSpot, { id: list.id, spotId: reef.id }, by("ana"));

    await call(v1Router.spots.delete, { id: reef.id }, by("ana"));
    const { lists } = await call(v1Router.lists.list, undefined, by("ana"));
    expect(lists.map((one) => one.spotIds)).toEqual([[]]);
  });
});
