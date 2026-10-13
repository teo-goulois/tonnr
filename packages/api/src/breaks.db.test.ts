import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { fold } from "@repo/config/names";
import { user } from "@repo/db/schema/auth";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

describe("a name as a search reads it", () => {
  it("is in small letters, without its marks", () => {
    expect(fold("Guéthary")).toBe("guethary");
    expect(fold("CÔTE DES BASQUES")).toBe("cote des basques");
    expect(fold("Saint-Jean-de-Luz")).toBe("saint jean de luz");
    expect(fold("L'Île aux Moines")).toBe("l ile aux moines");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("a break found by its name", () => {
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
    await db.delete(surfBreak);
    await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.org" });
    await db.insert(surfBreak).values([
      { id: "torche", name: "La Torche", latitude: 47.84, longitude: -4.35 },
      { id: "guethary", name: "Guéthary – Parlementia", latitude: 43.43, longitude: -1.61 },
      { id: "basques", name: "Côte des Basques", latitude: 43.48, longitude: -1.57 },
      { id: "plage-north", name: "Plage du Nord", latitude: 50.9, longitude: 1.7 },
      { id: "plage-south", name: "Plage du Sud", latitude: 43.5, longitude: -1.5 },
      { id: "grande", name: "Grande Plage", latitude: 43.49, longitude: -1.56 },
      { id: "replage", name: "Surplage", latitude: 43.49, longitude: -1.55 },
      { id: "percent", name: "100% reef", latitude: -33.9, longitude: 151.3 },
      {
        id: "estagnots",
        name: "Les Estagnots",
        latitude: 43.68,
        longitude: -1.44,
        location: ["France", "Landes", "Soorts-Hossegor"],
      },
      {
        id: "north",
        name: "La Nord",
        latitude: 43.67,
        longitude: -1.44,
        location: ["France", "Landes", "Soorts-Hossegor"],
      },
      { id: "town", name: "Hossegor pier", latitude: 43.66, longitude: -1.44 },
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
  const found = async (input: {
    q: string;
    latitude?: number;
    longitude?: number;
    limit?: number;
  }) => (await call(v1Router.breaks.search, input, by("ana"))).breaks.map((one) => one.id);

  it("reads a name whatever its case and its marks", async () => {
    expect(await found({ q: "guethary" })).toEqual(["guethary"]);
    expect(await found({ q: "GUÉTHARY" })).toEqual(["guethary"]);
    expect(await found({ q: "cote des basques" })).toEqual(["basques"]);
    expect(await found({ q: "la torche" })).toEqual(["torche"]);
    expect(await found({ q: "nowhere" })).toEqual([]);
  });

  it("gives the same reading to the catalogue read by name", async () => {
    const listed = await call(v1Router.breaks.list, { q: "guethary" }, by("ana"));
    expect(listed.breaks.map((one) => one.id)).toEqual(["guethary"]);
  });

  it("puts first a name that begins with what is typed, then one a word of which does", async () => {
    // By name within a rank: "Plage du Nord", "Plage du Sud", then "Grande Plage", then the
    // name that only holds it.
    expect(await found({ q: "plage" })).toEqual([
      "plage-north",
      "plage-south",
      "grande",
      "replage",
    ]);
  });

  it("brings forward the breaks nearest a point within a rank", async () => {
    expect(await found({ q: "plage", latitude: 43.5, longitude: -1.5 })).toEqual([
      "plage-south",
      "plage-north",
      "grande",
      "replage",
    ]);
    expect(await found({ q: "plage", latitude: 43.5, longitude: -1.5, limit: 1 })).toEqual([
      "plage-south",
    ]);
  });

  it("finds the breaks of a town by the town's name, after the breaks named so", async () => {
    expect(await found({ q: "hossegor" })).toEqual(["town", "north", "estagnots"]);
    // The catalogue read by name looks at names alone.
    const listed = await call(v1Router.breaks.list, { q: "hossegor" }, by("ana"));
    expect(listed.breaks.map((one) => one.id)).toEqual(["town"]);
  });

  it("reads the characters a pattern gives a meaning as they are typed", async () => {
    expect(await found({ q: "100%" })).toEqual(["percent"]);
    expect(await found({ q: "0_" })).toEqual([]);
    expect(await found({ q: "%%" })).toEqual([]);
  });
});
