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
    fetchBreaks: Effect.succeed({ breaks, unreadable: [] }),
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

  const save = (id: string, breaks: ListedBreak[], now = MONDAY, unreadable: string[] = []) =>
    Effect.runPromise(saveBreaks(database.db, source(id), { breaks, unreadable }, now));
  const rowsOf = (id: string) =>
    database.db
      .select()
      .from(surfBreak)
      .where(eq(surfBreak.provider, id))
      .orderBy(asc(surfBreak.providerRef));
  const refsOf = async (id: string) => (await rowsOf(id)).map((row) => row.providerRef);
  // "node/01" to "node/<count>", in the order the database sorts them.
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      listed(`node/${String(index + 1).padStart(2, "0")}`),
    );

  it("stores a list with the source's terms", async () => {
    expect(await save("first", [listed("node/1", { name: "La Torche" })])).toEqual({
      listed: 1,
      added: 1,
      removed: 0,
      kept: 0,
      isDoubtful: false,
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

    expect(saved).toMatchObject({ listed: 1, added: 0, removed: 0, kept: 0 });
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

    expect(saved).toMatchObject({ listed: 3, added: 1, removed: 1, kept: 0 });
    expect(await refsOf("changed")).toEqual(["node/1", "node/3", "way/9"]);
  });

  it("deletes a missing break even when both lists were asked for in the same instant", async () => {
    await save("instant", [listed("node/1"), listed("node/2")]);

    expect(await save("instant", [listed("node/1")])).toMatchObject({ removed: 1 });
    expect(await refsOf("instant")).toEqual(["node/1"]);
  });

  it("keeps as it was a break the source lists and that could not be read", async () => {
    await save("unread", [listed("node/1"), listed("way/2", { name: "The beach" })]);

    const saved = await save("unread", [listed("node/1")], NEXT_MONDAY, ["way/2", "way/404"]);

    expect(saved).toEqual({ listed: 1, added: 0, removed: 0, kept: 1, isDoubtful: false });
    expect(await rowsOf("unread")).toMatchObject([
      { providerRef: "node/1", lastSeenAt: NEXT_MONDAY },
      { providerRef: "way/2", name: "The beach", lastSeenAt: MONDAY },
    ]);
  });

  it("deletes nothing when the list is less than half of what is known", async () => {
    await save("partial", many(20));

    const saved = await save("partial", many(9), NEXT_MONDAY);

    expect(saved).toEqual({ listed: 9, added: 0, removed: 0, kept: 11, isDoubtful: true });
    expect(await rowsOf("partial")).toHaveLength(20);
  });

  it("applies a list that is exactly half of what is known", async () => {
    await save("half", many(20));

    expect(await save("half", many(10), NEXT_MONDAY)).toMatchObject({
      removed: 10,
      kept: 0,
      isDoubtful: false,
    });
  });

  it("applies any list to a source that has only a few breaks", async () => {
    await save("small", many(19));

    expect(await save("small", many(1), NEXT_MONDAY)).toMatchObject({ removed: 18, kept: 0 });
    expect(await refsOf("small")).toEqual(["node/01"]);
  });

  it("deletes nothing when the list is empty, however few breaks are known", async () => {
    await save("empty", [listed("node/1")]);

    expect(await save("empty", [], NEXT_MONDAY)).toEqual({
      listed: 0,
      added: 0,
      removed: 0,
      kept: 1,
      isDoubtful: true,
    });
  });

  it("leaves another source's breaks alone", async () => {
    await save("ours", [listed("node/1")]);
    await save("theirs", [listed("node/1"), listed("node/2")]);

    await save("ours", [listed("node/7")], NEXT_MONDAY);

    expect(await refsOf("theirs")).toEqual(["node/1", "node/2"]);
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
      kept: 0,
      isDoubtful: false,
    });
    expect(await rowsOf("same")).toEqual(before);
  });

  it("leaves out a list asked for before the one that is stored", async () => {
    await save("late", [listed("node/1", { name: "Newer" })], NEXT_MONDAY);

    expect(await save("late", [listed("node/1", { name: "Older" }), listed("node/2")])).toBeNull();
    expect(await rowsOf("late")).toMatchObject([{ providerRef: "node/1", name: "Newer" }]);
  });

  it("ends with the later list when two imports of a source run together", async () => {
    for (let round = 0; round < 5; round += 1) {
      await database.db.delete(surfBreak);

      const saved = await Promise.all([
        save("together", [listed("node/1"), listed("node/2")], MONDAY),
        save("together", [listed("node/2"), listed("node/3")], NEXT_MONDAY),
      ]);

      expect(await refsOf("together")).toEqual(["node/2", "node/3"]);
      // Whichever ran second saw what the first had written.
      expect(saved[1]).toMatchObject({ listed: 2, kept: 0 });
      if (saved[0]) expect(saved[1]).toMatchObject({ added: 1, removed: 1 });
      else expect(saved[1]).toMatchObject({ added: 2, removed: 0 });
    }
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
    expect(await refsOf("fetched")).toEqual(["node/1"]);
  });
});
