import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { profileRouter } from "./routers/profile";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// What an account says of itself as a surfer: decision 063.
describe.skipIf(!TEST_DATABASE_URL)("an account's surfer profile", () => {
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

  const ANSWERS = {
    level: "intermediate",
    smallestWave: "knee",
    biggestWave: "head",
    reading: "basics",
    // Said twice, as a hurried press might.
    boards: ["funboard", "longboard", "funboard"] as ("funboard" | "longboard")[],
  } as const;

  it("answers nothing for an account that was never asked", async () => {
    expect(await call(profileRouter.get, undefined, by("ana"))).toBeNull();
  });

  it("keeps the answers, with the heights of face the waves said stand for", async () => {
    const saved = await call(profileRouter.save, ANSWERS, by("ana"));
    expect(saved).toMatchObject({
      level: "intermediate",
      smallestWave: "knee",
      biggestWave: "head",
      reading: "basics",
      // A board said twice is kept once.
      boards: ["funboard", "longboard"],
      waveFaceMeters: { least: 0.3, most: 2 },
      putOffAt: null,
    });
    expect(saved.answeredAt).toBeInstanceOf(Date);
    expect(await call(profileRouter.get, undefined, by("ana"))).toEqual(saved);
    // Another account's is not its own.
    expect(await call(profileRouter.get, undefined, by("ben"))).toBeNull();
  });

  it("replaces every answer at once, what is null being no longer said", async () => {
    await call(profileRouter.save, ANSWERS, by("ana"));
    const saved = await call(
      profileRouter.save,
      { ...ANSWERS, biggestWave: null, boards: null },
      by("ana"),
    );
    expect(saved).toMatchObject({ biggestWave: null, boards: null, waveFaceMeters: null });
  });

  it("says no top to the biggest size of all", async () => {
    const saved = await call(
      profileRouter.save,
      { ...ANSWERS, biggestWave: "triple_overhead" },
      by("ana"),
    );
    expect(saved.waveFaceMeters).toEqual({ least: 0.3, most: null });
  });

  it("refuses a biggest wave smaller than the smallest", async () => {
    await expect(
      call(
        profileRouter.save,
        { ...ANSWERS, smallestWave: "head", biggestWave: "knee" },
        by("ana"),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await call(profileRouter.get, undefined, by("ana"))).toBeNull();
  });

  it("puts the questions off without losing what was answered", async () => {
    const putOff = await call(profileRouter.putOff, undefined, by("ben"));
    expect(putOff).toMatchObject({ level: null, answeredAt: null });
    expect(putOff.putOffAt).toBeInstanceOf(Date);

    await call(profileRouter.save, ANSWERS, by("ana"));
    const later = await call(profileRouter.putOff, undefined, by("ana"));
    expect(later).toMatchObject({ level: "intermediate", biggestWave: "head" });
    expect(later.answeredAt).toBeInstanceOf(Date);
  });
});
