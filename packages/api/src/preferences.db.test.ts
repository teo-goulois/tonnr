import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { station } from "@repo/db/schema/buoys";
import { recentView } from "@repo/db/schema/preferences";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { preferencesRouter } from "./routers/preferences";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// The units an account reads measurements in: decision 033.
describe.skipIf(!TEST_DATABASE_URL)("an account's units", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  const { forecasts } = testForecasts();

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(user);
    await database.db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
  });

  const by = (id: string) => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: true },
        session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: null,
      adminSites: [],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-11T08:00:00Z"), webOrigin: "http://localhost:3001" },
    };
    return { context };
  };

  const METRIC = { height: "m", temperature: "c", distance: "km", precipitation: "mm" };

  it("answers nothing for an account that has chosen no unit", async () => {
    expect(await call(preferencesRouter.getUnits, undefined, by("ana"))).toBeNull();
  });

  it("keeps the unit an account chooses, and starts the others as the apps do", async () => {
    expect(await call(preferencesRouter.saveUnits, { windSpeed: "kmh" }, by("ana"))).toEqual({
      windSpeed: "kmh",
      ...METRIC,
    });
    expect(await call(preferencesRouter.getUnits, undefined, by("ana"))).toEqual({
      windSpeed: "kmh",
      ...METRIC,
    });
  });

  it("starts the wind in knots for an account that chooses another unit first", async () => {
    expect(await call(preferencesRouter.saveUnits, { height: "ft" }, by("ana"))).toEqual({
      windSpeed: "kn",
      ...METRIC,
      height: "ft",
    });
  });

  it("changes the units it is given and leaves the others as they are", async () => {
    await call(
      preferencesRouter.saveUnits,
      { windSpeed: "ms", height: "ft", temperature: "f", distance: "mi", precipitation: "in" },
      by("ana"),
    );

    await call(preferencesRouter.saveUnits, { temperature: "c" }, by("ana"));

    expect(await call(preferencesRouter.getUnits, undefined, by("ana"))).toEqual({
      windSpeed: "ms",
      height: "ft",
      temperature: "c",
      distance: "mi",
      precipitation: "in",
    });
  });

  it("keeps each account's units apart", async () => {
    await call(preferencesRouter.saveUnits, { windSpeed: "mph" }, by("ana"));

    expect(await call(preferencesRouter.getUnits, undefined, by("ben"))).toBeNull();
  });

  it("refuses a unit it does not know", async () => {
    await expect(
      call(preferencesRouter.saveUnits, { windSpeed: "bft" } as never, by("ana")),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(preferencesRouter.saveUnits, { height: "fathoms" } as never, by("ana")),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// What an account looked at last: decision 042.
describe.skipIf(!TEST_DATABASE_URL)("an account's recent views", () => {
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
    await db.delete(station);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    await db.insert(surfBreak).values(
      ["one", "two", "three", "four", "five", "six"].map((id, index) => ({
        id,
        name: `Break ${id}`,
        latitude: 47 + index / 10,
        longitude: -4,
      })),
    );
    await db.insert(station).values({
      id: "test-1",
      provider: "test",
      providerStationId: "1",
      name: "Buoy one",
      latitude: 48,
      longitude: -5,
      licenseType: "open",
      licenseUrl: "https://example.org/licence",
      attribution: "Example",
    });
    await db.insert(spot).values([
      { id: "ana-spot", userId: "ana", name: "Ana's spot", latitude: 47.5, longitude: -3 },
      { id: "ben-spot", userId: "ben", name: "Ben's spot", latitude: 43.5, longitude: -1.5 },
    ]);
  });

  const by = (id: string) => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: true },
        session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: null,
      adminSites: [],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-11T08:00:00Z"), webOrigin: "http://localhost:3001" },
    };
    return { context };
  };
  const view = (account: string, kind: "station" | "break" | "spot", id: string) =>
    call(preferencesRouter.saveRecent, { kind, id }, by(account));
  const recents = async (account: string) =>
    (await call(preferencesRouter.getRecents, undefined, by(account))).map(
      (recent) => `${recent.kind}:${recent.id}`,
    );

  it("answers nothing for an account that has looked at nothing", async () => {
    expect(await call(preferencesRouter.getRecents, undefined, by("ana"))).toEqual([]);
  });

  it("answers what was looked at, the last first, with its name and its place", async () => {
    await view("ana", "break", "one");
    await view("ana", "station", "test-1");
    const answer = await view("ana", "spot", "ana-spot");

    const viewedAt = expect.any(Date);
    expect(answer).toEqual([
      { kind: "spot", id: "ana-spot", name: "Ana's spot", latitude: 47.5, longitude: -3, viewedAt },
      { kind: "station", id: "test-1", name: "Buoy one", latitude: 48, longitude: -5, viewedAt },
      { kind: "break", id: "one", name: "Break one", latitude: 47, longitude: -4, viewedAt },
    ]);
    expect(await recents("ana")).toEqual(["spot:ana-spot", "station:test-1", "break:one"]);
  });

  it("puts what is looked at again first, once", async () => {
    await view("ana", "break", "one");
    await view("ana", "break", "two");
    await view("ana", "break", "one");

    expect(await recents("ana")).toEqual(["break:one", "break:two"]);
  });

  it("keeps the last five, and no row of the others", async () => {
    for (const id of ["one", "two", "three", "four", "five", "six"]) await view("ana", "break", id);

    expect(await recents("ana")).toEqual([
      "break:six",
      "break:five",
      "break:four",
      "break:three",
      "break:two",
    ]);
    expect(await database.db.select().from(recentView)).toHaveLength(5);
  });

  it("keeps each account's views apart", async () => {
    await view("ana", "break", "one");

    expect(await recents("ben")).toEqual([]);
  });

  it("refuses what is not there, and a spot of another account", async () => {
    await expect(view("ana", "break", "none")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(view("ana", "station", "one")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(view("ana", "spot", "ben-spot")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await database.db.select().from(recentView)).toHaveLength(0);
  });

  it("leaves out what is gone since", async () => {
    await view("ana", "break", "one");
    await view("ana", "spot", "ana-spot");
    await database.db.delete(spot);

    expect(await recents("ana")).toEqual(["break:one"]);
  });

  it("clears an account's views and no other's", async () => {
    await view("ana", "break", "one");
    await view("ben", "break", "two");

    expect(await call(preferencesRouter.clearRecents, undefined, by("ana"))).toEqual([]);
    expect(await recents("ana")).toEqual([]);
    expect(await recents("ben")).toEqual(["break:two"]);
  });

  it("forgets the views of an account that is deleted", async () => {
    await view("ana", "break", "one");
    await database.db.delete(user);

    expect(await database.db.select().from(recentView)).toHaveLength(0);
  });
});
