import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { fold } from "@repo/config/names";
import { user } from "@repo/db/schema/auth";
import { type SessionHour, type SurfSize, surfSession } from "@repo/db/schema/sessions";
import { spot, surfBreak } from "@repo/db/schema/spots";
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
      { id: "torche", slug: "torche", name: "La Torche", latitude: 47.84, longitude: -4.35 },
      {
        id: "guethary",
        slug: "guethary",
        name: "Guéthary – Parlementia",
        latitude: 43.43,
        longitude: -1.61,
      },
      {
        id: "basques",
        slug: "basques",
        name: "Côte des Basques",
        latitude: 43.48,
        longitude: -1.57,
      },
      {
        id: "plage-north",
        slug: "plage-north",
        name: "Plage du Nord",
        latitude: 50.9,
        longitude: 1.7,
      },
      {
        id: "plage-south",
        slug: "plage-south",
        name: "Plage du Sud",
        latitude: 43.5,
        longitude: -1.5,
      },
      { id: "grande", slug: "grande", name: "Grande Plage", latitude: 43.49, longitude: -1.56 },
      { id: "replage", slug: "replage", name: "Surplage", latitude: 43.49, longitude: -1.55 },
      { id: "percent", slug: "percent", name: "100% reef", latitude: -33.9, longitude: 151.3 },
      {
        id: "estagnots",
        slug: "estagnots",
        name: "Les Estagnots",
        latitude: 43.68,
        longitude: -1.44,
        location: ["France", "Landes", "Soorts-Hossegor"],
      },
      {
        id: "north",
        slug: "north",
        name: "La Nord",
        latitude: 43.67,
        longitude: -1.44,
        location: ["France", "Landes", "Soorts-Hossegor"],
      },
      { id: "town", slug: "town", name: "Hossegor pier", latitude: 43.66, longitude: -1.44 },
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

  it("names a break to whoever has its short address, and says nothing else", async () => {
    const id = "6f1c2b9e-0d4a-4c1e-9b7a-3e5f8a2d1c40";
    await database.db
      .insert(surfBreak)
      .values({ id, slug: id, name: "Les Pierres Noires", latitude: 48.29, longitude: -4.97 });
    const anyone = { context: { ...by("ana").context, session: null } };
    expect(await call(v1Router.breaks.named, { id }, anyone)).toEqual({
      name: "Les Pierres Noires",
    });
    await expect(
      call(v1Router.breaks.named, { id: "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b" }, anyone),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("how big the waves of a break run against the forecast", () => {
  const WEB = "https://app.example.org";
  const DALBOSC = "6e0d6c0a-0000-4000-8000-00000000d41b";
  const MINOU = "6e0d6c0a-0000-4000-8000-0000000031a0";
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
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "bo", name: "Bo", email: "bo@example.org" },
    ]);
    await db.insert(surfBreak).values([
      { id: DALBOSC, slug: DALBOSC, name: "Dalbosc", latitude: 48.36, longitude: -4.62 },
      { id: MINOU, slug: MINOU, name: "Le Petit Minou", latitude: 48.34, longitude: -4.61 },
    ]);
    // A spot of Ana's that stands on the break: a session there is at the break.
    await db.insert(spot).values({
      id: "ana-dalbosc",
      userId: "ana",
      breakId: DALBOSC,
      name: "Dalbosc, my peak",
      latitude: 48.36,
      longitude: -4.62,
    });
  });

  const asVisitor = () => {
    const context: Context = {
      db: database.db,
      session: null,
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

  // A session of an hour and a half whose model said one height, one direction and one period.
  const session = (
    id: string,
    account: string,
    at: { breakId?: string; spotId?: string },
    waveSize: SurfSize | null,
    model: { height: number | null; direction?: number; period?: number } | null,
  ): typeof surfSession.$inferInsert => {
    const hour = (time: string): SessionHour => ({
      time,
      waveHeightMeters: model?.height ?? null,
      wavePeriodSeconds: null,
      wavePeakPeriodSeconds: model?.period ?? 12,
      waveDirectionDegrees: model?.direction ?? 270,
      primarySwellHeightMeters: null,
      primarySwellDirectionDegrees: null,
      windSpeedMetersPerSecond: null,
      windGustMetersPerSecond: null,
      windDirectionDegrees: null,
      cloudCoverPercent: null,
      precipitationMillimeters: null,
      airTemperatureCelsius: null,
    });
    return {
      id,
      userId: account,
      breakId: at.breakId ?? null,
      spotId: at.spotId ?? null,
      placeName: "Dalbosc",
      latitude: 48.36,
      longitude: -4.62,
      startedAt: new Date("2026-10-10T09:00:00Z"),
      durationMinutes: 90,
      waveSize,
      conditions: model
        ? {
            model: {
              point: { latitude: 48.36, longitude: -4.62 },
              waveModels: ["test"],
              swellModels: [],
              hours: [hour("2026-10-10T09:00:00Z"), hour("2026-10-10T10:00:00Z")],
            },
            modelMissing: null,
            tide: null,
            buoy: null,
            wind: null,
            offshoreDirectionDegrees: null,
          }
        : null,
    };
  };

  it("says nothing of a break with no session, and is not found for no break", async () => {
    expect(await call(v1Router.breaks.sizeFactor, { id: DALBOSC }, asVisitor())).toEqual({
      sessions: 0,
      factor: null,
      bySwell: [],
    });
    await expect(
      call(v1Router.breaks.sizeFactor, { id: "00000000-0000-4000-8000-000000000000" }, asVisitor()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("counts the sessions that name the break or a spot on it, of every account", async () => {
    await database.db.insert(surfSession).values([
      // Head high on a metre: 1.8, four times, two of them at Ana's spot.
      session("1", "ana", { breakId: DALBOSC }, "head", { height: 1 }),
      session("2", "ana", { spotId: "ana-dalbosc" }, "head", { height: 1 }),
      session("3", "bo", { breakId: DALBOSC }, "head", { height: 1 }),
      session("4", "ana", { spotId: "ana-dalbosc" }, "head", { height: 1 }),
      // Under the threshold still: four sessions.
    ]);
    expect(await call(v1Router.breaks.sizeFactor, { id: DALBOSC }, asVisitor())).toEqual({
      sessions: 4,
      factor: null,
      bySwell: [],
    });

    await database.db.insert(surfSession).values([
      // Chest high on 0.6 m: 2. The fifth session, and the figure is said.
      session("5", "bo", { breakId: DALBOSC }, "chest", { height: 0.6 }),
      // Left out: no size said, no model, a flat sea, and the other break.
      session("6", "bo", { breakId: DALBOSC }, null, { height: 1 }),
      session("7", "bo", { breakId: DALBOSC }, "head", null),
      session("8", "bo", { breakId: DALBOSC }, "head", { height: 0.1 }),
      session("9", "bo", { breakId: MINOU }, "waist", { height: 1 }),
    ]);
    expect(await call(v1Router.breaks.sizeFactor, { id: DALBOSC }, asVisitor())).toEqual({
      sessions: 5,
      factor: 1.8,
      // All five on a west swell of 12 s, which is one band: its own factor is the same.
      bySwell: [{ sector: "W", period: "medium", factor: 1.8, sessions: 5 }],
    });
    expect(await call(v1Router.breaks.sizeFactor, { id: MINOU }, asVisitor())).toEqual({
      sessions: 1,
      factor: null,
      bySwell: [],
    });
  });

  it("says nothing of one account's sessions alone", async () => {
    await database.db
      .insert(surfSession)
      .values(
        [1, 2, 3, 4, 5, 6].map((n) =>
          session(`a${n}`, "ana", { breakId: DALBOSC }, "head", { height: 1 }),
        ),
      );
    expect(await call(v1Router.breaks.sizeFactor, { id: DALBOSC }, asVisitor())).toEqual({
      sessions: 6,
      factor: null,
      bySwell: [],
    });
  });
});
