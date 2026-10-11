import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
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
