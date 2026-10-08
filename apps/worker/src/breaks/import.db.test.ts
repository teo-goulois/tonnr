import { user } from "@repo/db/schema/auth";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { importBreaks, isDue, saveBreaks } from "./import";
import type { BreakSource, ListedBreak } from "./source";

const MONDAY = new Date("2026-10-05T04:37:00Z");
const NEXT_MONDAY = new Date("2026-10-12T04:37:00Z");

function source(id: string, breaks: ListedBreak[] = []): BreakSource {
  return {
    id,
    schedule: "37 4 * * 1",
    licenseType: "test",
    licenseUrl: "https://example.org/licence",
    attribution: "Test",
    fetchBreaks: Effect.succeed({ breaks, rejected: 0 }),
  };
}

function listed(ref: string, overrides: Partial<ListedBreak> = {}): ListedBreak {
  return {
    ref,
    name: ref,
    latitude: 48,
    longitude: -4.5,
    url: `https://example.org/${ref}`,
    ...overrides,
  };
}

describe.skipIf(!TEST_DATABASE_URL)("saveBreaks", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(surfBreak);
  });

  const save = (id: string, breaks: ListedBreak[], now = MONDAY) =>
    Effect.runPromise(saveBreaks(database.db, source(id), breaks, now));
  const rowsOf = (id: string) =>
    database.db
      .select()
      .from(surfBreak)
      .where(eq(surfBreak.provider, id))
      .orderBy(asc(surfBreak.providerRef));

  it("stores a list with the source's terms", async () => {
    expect(await save("first", [listed("node/1", { name: "La Torche" })])).toEqual({
      listed: 1,
      added: 1,
      removed: 0,
      keptMissing: 0,
    });

    expect(await rowsOf("first")).toMatchObject([
      {
        provider: "first",
        providerRef: "node/1",
        name: "La Torche",
        latitude: 48,
        longitude: -4.5,
        sourceUrl: "https://example.org/node/1",
        licenseType: "test",
        licenseUrl: "https://example.org/licence",
        attribution: "Test",
        lastSeenAt: MONDAY,
      },
    ]);
  });

  it("keeps a known break's id and takes its new name and position", async () => {
    await save("renamed", [listed("node/1", { name: "Torche" })]);
    const [before] = await rowsOf("renamed");

    const saved = await save(
      "renamed",
      [listed("node/1", { name: "La Torche", latitude: 47.84, longitude: -4.35 })],
      NEXT_MONDAY,
    );

    expect(saved).toEqual({ listed: 1, added: 0, removed: 0, keptMissing: 0 });
    expect(await rowsOf("renamed")).toMatchObject([
      {
        id: before?.id,
        name: "La Torche",
        latitude: 47.84,
        longitude: -4.35,
        lastSeenAt: NEXT_MONDAY,
      },
    ]);
  });

  it("deletes a break the source no longer lists, and adds a new one", async () => {
    await save("changed", [listed("node/1"), listed("node/2"), listed("node/3")]);

    const saved = await save(
      "changed",
      [listed("node/1"), listed("node/3"), listed("way/9")],
      NEXT_MONDAY,
    );

    expect(saved).toEqual({ listed: 3, added: 1, removed: 1, keptMissing: 0 });
    expect((await rowsOf("changed")).map((row) => row.providerRef)).toEqual([
      "node/1",
      "node/3",
      "way/9",
    ]);
  });

  it("deletes nothing when the list is less than half the last one", async () => {
    await save("partial", [listed("node/1"), listed("node/2"), listed("node/3")]);

    const saved = await save("partial", [listed("node/1")], NEXT_MONDAY);

    expect(saved).toEqual({ listed: 1, added: 0, removed: 0, keptMissing: 2 });
    expect(await rowsOf("partial")).toHaveLength(3);
  });

  it("deletes nothing when the list is empty", async () => {
    await save("empty", [listed("node/1")]);

    expect(await save("empty", [], NEXT_MONDAY)).toEqual({
      listed: 0,
      added: 0,
      removed: 0,
      keptMissing: 1,
    });
  });

  it("applies a list that is exactly half the last one", async () => {
    await save("half", [listed("node/1"), listed("node/2")]);

    expect(await save("half", [listed("node/1")], NEXT_MONDAY)).toMatchObject({ removed: 1 });
  });

  it("leaves another source's breaks alone", async () => {
    await save("ours", [listed("node/1")]);
    await save("theirs", [listed("node/1"), listed("node/2")]);

    await save("ours", [listed("node/7")], NEXT_MONDAY);

    expect(await rowsOf("theirs")).toHaveLength(2);
  });

  it("stores once a break the list gives twice", async () => {
    const saved = await save("twice", [listed("node/1"), listed("node/1", { name: "Again" })]);

    expect(saved).toMatchObject({ listed: 1, added: 1 });
    expect(await rowsOf("twice")).toMatchObject([{ name: "Again" }]);
  });

  it("changes nothing when the same list comes again", async () => {
    await save("same", [listed("node/1"), listed("node/2")]);
    const before = await rowsOf("same");

    expect(await save("same", [listed("node/1"), listed("node/2")])).toEqual({
      listed: 2,
      added: 0,
      removed: 0,
      keptMissing: 0,
    });
    expect(await rowsOf("same")).toEqual(before);
  });

  it("leaves a spot its name and point when its break is deleted", async () => {
    await save("gone", [listed("node/1"), listed("node/2")]);
    const [first] = await rowsOf("gone");
    await database.db
      .insert(user)
      .values({ id: "owner", name: "Owner", email: "owner@example.org" });
    await database.db.insert(spot).values({
      id: "saved",
      userId: "owner",
      breakId: first?.id,
      name: "My peak",
      latitude: 48.01,
      longitude: -4.51,
      criteria: {},
    });

    await save("gone", [listed("node/2")], NEXT_MONDAY);

    const [saved] = await database.db.select().from(spot).where(eq(spot.id, "saved"));
    expect(saved).toMatchObject({ breakId: null, name: "My peak", latitude: 48.01 });
  });

  it("says a source is due when it was never imported or not for more than a week", async () => {
    const due = (now: Date) => Effect.runPromise(isDue(source("due"), database.db, now));

    expect(await due(MONDAY)).toBe(true);
    await save("due", [listed("node/1")]);
    expect(await due(MONDAY)).toBe(false);
    expect(await due(NEXT_MONDAY)).toBe(false);
    expect(await due(new Date("2026-10-13T04:38:00Z"))).toBe(true);
  });

  it("fetches a source's list and stores it", async () => {
    const saved = await Effect.runPromise(
      importBreaks(source("fetched", [listed("node/1")]), database.db, MONDAY),
    );

    expect(saved).toMatchObject({ listed: 1, added: 1 });
    expect(await rowsOf("fetched")).toHaveLength(1);
  });
});
