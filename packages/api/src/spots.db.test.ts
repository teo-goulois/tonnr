import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// What a spot's owner says it is like: decision 006, "A spot without its alert".
describe.skipIf(!TEST_DATABASE_URL)("what is said of a spot", () => {
  const WEB = "https://app.example.org";
  const BREAK = "7e0b6f0e-2a55-4c0e-9d3a-1f1f6d2f9a01";
  // Nothing at all said of a spot.
  const UNSAID = {
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
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    await db.insert(surfBreak).values({
      id: BREAK,
      provider: "example",
      providerRef: "a1",
      name: "North jetty",
      latitude: 48,
      longitude: -4.5,
      breakTypes: ["beach", "jetty"],
      bestSwellDirections: ["W", "WNW"],
      offshoreDirectionDegrees: 90,
    });
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
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;
  const point = { name: "My sandbank", latitude: 47.84, longitude: -4.35 };

  it("makes a spot of which nothing is said, from a point or from a break", async () => {
    const own = await call(v1Router.spots.create, point, by("ana"));
    const fromBreak = await call(v1Router.spots.create, { breakId: BREAK }, by("ana"));

    expect(own.characteristics).toEqual(UNSAID);
    // The catalogue says the break is a beach with a jetty. The spot takes its name and its
    // point, and nothing of that.
    expect(fromBreak).toMatchObject({ name: "North jetty", latitude: 48, breakId: BREAK });
    expect(fromBreak.characteristics).toEqual(UNSAID);
    const [stored] = await database.db.select().from(spot).where(eq(spot.id, fromBreak.id));
    expect(stored?.characteristics).toBeNull();
  });

  it("keeps what the owner says, each list once through and in the catalogue's order", async () => {
    const made = await call(
      v1Router.spots.create,
      {
        ...point,
        characteristics: {
          breakTypes: ["reef", "beach", "reef"],
          bestTides: ["high", "mid"],
          bestSwellDirections: ["WNW", "W"],
          // Emptied, or null: not said.
          boardTypes: [],
          bottomTypes: null,
          offshoreDirectionDegrees: 0,
        },
      },
      by("ana"),
    );

    const said = {
      ...UNSAID,
      breakTypes: ["beach", "reef"],
      bestTides: ["mid", "high"],
      bestSwellDirections: ["W", "WNW"],
      // North is a direction, and zero is said.
      offshoreDirectionDegrees: 0,
    };
    expect(made.characteristics).toEqual(said);
    expect((await call(v1Router.spots.get, { id: made.id }, by("ana"))).characteristics).toEqual(
      said,
    );
    expect(
      (await call(v1Router.spots.list, undefined, by("ana"))).spots[0]?.characteristics,
    ).toEqual(said);
    // Only what was said is kept.
    const [stored] = await database.db.select().from(spot).where(eq(spot.id, made.id));
    expect(stored?.characteristics).toEqual({
      breakTypes: ["beach", "reef"],
      bestTides: ["mid", "high"],
      bestSwellDirections: ["W", "WNW"],
      offshoreDirectionDegrees: 0,
    });
  });

  it("replaces all that was said when it is given, leaves it when it is not, and clears it on null", async () => {
    const made = await call(
      v1Router.spots.create,
      { ...point, characteristics: { breakTypes: ["reef"], bottomTypes: ["rock"] } },
      by("ana"),
    );

    const renamed = await call(v1Router.spots.update, { id: made.id, name: "The reef" }, by("ana"));
    expect(renamed.characteristics).toEqual({
      ...UNSAID,
      breakTypes: ["reef"],
      bottomTypes: ["rock"],
    });

    const said = await call(
      v1Router.spots.update,
      { id: made.id, characteristics: { waveDirections: ["left"] } },
      by("ana"),
    );
    expect(said).toMatchObject({ name: "The reef" });
    expect(said.characteristics).toEqual({ ...UNSAID, waveDirections: ["left"] });

    // A sheet with nothing left on it is no sheet.
    const emptied = await call(
      v1Router.spots.update,
      { id: made.id, characteristics: { waveDirections: [] } },
      by("ana"),
    );
    expect(emptied.characteristics).toEqual(UNSAID);
    const [stored] = await database.db.select().from(spot).where(eq(spot.id, made.id));
    expect(stored?.characteristics).toBeNull();

    // Nothing in it, or nothing but nulls: nothing is said.
    for (const nothing of [{}, { bestTides: null, offshoreDirectionDegrees: null }]) {
      await call(
        v1Router.spots.update,
        { id: made.id, characteristics: { bestSeasons: ["winter"], offshoreDirectionDegrees: 90 } },
        by("ana"),
      );
      const none = await call(
        v1Router.spots.update,
        { id: made.id, characteristics: nothing },
        by("ana"),
      );
      expect(none.characteristics).toEqual(UNSAID);
    }

    await call(
      v1Router.spots.update,
      { id: made.id, characteristics: { bestSeasons: ["winter"] } },
      by("ana"),
    );
    const cleared = await call(
      v1Router.spots.update,
      { id: made.id, characteristics: null },
      by("ana"),
    );
    expect(cleared.characteristics).toEqual(UNSAID);
  });

  it("leaves the spot's criteria and its alerts as they were", async () => {
    const criteria = { swellHeightMeters: { min: 1 } };
    const made = await call(
      v1Router.spots.create,
      { ...point, criteria, alertsEnabled: true },
      by("ana"),
    );

    const said = await call(
      v1Router.spots.update,
      { id: made.id, characteristics: { breakTypes: ["reef"] } },
      by("ana"),
    );

    expect(said).toMatchObject({ criteria, alertsEnabled: true, latitude: 47.84 });
  });

  it.each([
    ["a word the catalogue does not have", { breakTypes: ["wedge"] }],
    ["a point the compass does not have", { bestWindDirections: ["NORTH"] }],
    ["a list that is not one", { bestTides: "low" }],
    ["a direction past the compass", { offshoreDirectionDegrees: 360 }],
    ["a direction between two degrees", { offshoreDirectionDegrees: 12.5 }],
  ])("refuses %s", async (_what, characteristics) => {
    await expect(
      call(v1Router.spots.create, { ...point, characteristics } as never, by("ana")),
    ).rejects.toEqual(refusal("BAD_REQUEST"));
    const made = await call(v1Router.spots.create, point, by("ana"));
    await expect(
      call(v1Router.spots.update, { id: made.id, characteristics } as never, by("ana")),
    ).rejects.toEqual(refusal("BAD_REQUEST"));
  });

  it("lets only its owner say what a spot is like, and shows a public one's to anyone", async () => {
    const made = await call(
      v1Router.spots.create,
      { ...point, visibility: "public", characteristics: { breakTypes: ["point"] } },
      by("ana"),
    );

    await expect(
      call(v1Router.spots.update, { id: made.id, characteristics: null }, by("ben")),
    ).rejects.toEqual(refusal("NOT_FOUND"));
    const seen = await call(v1Router.spots.get, { id: made.id }, by("ben"));
    expect(seen).toMatchObject({ isOwner: false });
    expect(seen.characteristics).toEqual({ ...UNSAID, breakTypes: ["point"] });
  });
});
