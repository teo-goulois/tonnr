import { user } from "@repo/db/schema/auth";
import { breakCandidate } from "@repo/db/schema/catalogue";
import { spot, surfBreak, surfBreakListing } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { asc, eq, isNotNull } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { addBreaks, removeBreaks } from "./import";
import type { BreakList, ListedBreak } from "./source";

// Invented breaks: no list's data is in the tests.
function listed(ref: string, overrides: Partial<ListedBreak> = {}): ListedBreak {
  return { ref, name: ref, latitude: 48, longitude: -4.5, ...overrides };
}

function list(provider: string, breaks: ListedBreak[], terms: Partial<BreakList> = {}) {
  return { provider, breaks, ...terms };
}

describe.skipIf(!TEST_DATABASE_URL)("the catalogue's import", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(spot);
    await database.db.delete(user);
    await database.db.delete(breakCandidate);
    await database.db.delete(surfBreak);
    await database.db.delete(surfBreakListing);
  });

  const add = (given: BreakList, options: { write?: boolean; intoEmpty?: boolean } = {}) =>
    Effect.runPromise(addBreaks(database.db, given, { write: true, ...options }));
  const remove = (provider: string, write = true) =>
    Effect.runPromise(removeBreaks(database.db, provider, { write }));
  const rows = () => database.db.select().from(surfBreak).orderBy(asc(surfBreak.providerRef));
  const listings = () =>
    database.db
      .select()
      .from(surfBreakListing)
      .orderBy(asc(surfBreakListing.list), asc(surfBreakListing.ref));
  // What a list said of its breaks besides.
  const records = () =>
    database.db.select().from(surfBreakListing).where(isNotNull(surfBreakListing.details));

  it("adds a list with what it says of each break", async () => {
    const found = await add(
      list(
        "example",
        [
          listed("a1", {
            name: "North jetty",
            url: "https://example.org/a1",
            characteristics: {
              breakTypes: ["beach", "jetty"],
              waveDirections: ["left"],
              bestSwellDirections: ["W", "WNW"],
              offshoreDirectionDegrees: 90,
            },
            location: ["France", "Finistère"],
            timezone: "Europe/Paris",
            details: { crowd: 3 },
          }),
          listed("a2"),
        ],
        {
          license: { type: "CC-BY-4.0", url: "https://example.org/licence" },
          attribution: "Example contributors",
        },
      ),
    );

    expect(found).toEqual({
      provider: "example",
      listed: 2,
      inCatalogue: 0,
      added: 2,
      known: 0,
      isRefused: false,
    });
    const [first, second] = await rows();
    expect(first).toMatchObject({
      provider: "example",
      providerRef: "a1",
      name: "North jetty",
      latitude: 48,
      longitude: -4.5,
      breakTypes: ["beach", "jetty"],
      waveDirections: ["left"],
      bottomTypes: null,
      bestSwellDirections: ["W", "WNW"],
      offshoreDirectionDegrees: 90,
      location: ["France", "Finistère"],
      timezone: "Europe/Paris",
      sourceUrl: "https://example.org/a1",
      licenseType: "CC-BY-4.0",
      licenseUrl: "https://example.org/licence",
      attribution: "Example contributors",
    });
    // A break that says no more than where it is, from a list that names no terms of its own.
    expect(second).toMatchObject({ providerRef: "a2", breakTypes: null, sourceUrl: null });
    expect(await listings()).toMatchObject([
      { list: "example", ref: "a1", breakId: first?.id, details: { crowd: 3 } },
      { list: "example", ref: "a2", breakId: second?.id, details: null },
    ]);
  });

  it("stores no source for a list that names none", async () => {
    await add(list("example", [listed("a1")]));

    expect(await rows()).toMatchObject([
      { sourceUrl: null, licenseType: null, licenseUrl: null, attribution: null },
    ]);
    expect(await records()).toEqual([]);
  });

  it("leaves a break it already holds as it is, and adds the others", async () => {
    await add(list("example", [listed("a1", { name: "North jetty", details: { crowd: 3 } })]));
    const [before] = await rows();

    const found = await add(
      list("example", [
        listed("a1", { name: "Renamed", latitude: 10, details: { crowd: 9 } }),
        listed("a2"),
      ]),
    );

    expect(found).toMatchObject({ listed: 2, inCatalogue: 1, added: 1, known: 1 });
    const after = await rows();
    expect(after[0]).toEqual(before);
    expect(after.map((row) => row.providerRef)).toEqual(["a1", "a2"]);
    expect(await records()).toMatchObject([{ details: { crowd: 3 } }]);
  });

  it("tells one list's reference from another's", async () => {
    await add(list("first", [listed("a1")]));

    expect(await add(list("second", [listed("a1")]))).toMatchObject({ added: 1, known: 0 });
    expect(await rows()).toHaveLength(2);
  });

  it("says what it would add, and stores nothing, without write", async () => {
    const found = await add(list("example", [listed("a1", { details: { crowd: 3 } })]), {
      write: false,
    });

    expect(found).toMatchObject({ listed: 1, added: 1, known: 0 });
    expect(await rows()).toEqual([]);
    expect(await records()).toEqual([]);
  });

  it("adds more breaks than one statement takes", async () => {
    const many = Array.from({ length: 2500 }, (_, index) =>
      listed(`a${index}`, { details: { index } }),
    );

    expect(await add(list("example", many))).toMatchObject({ listed: 2500, added: 2500 });
    expect(await records()).toHaveLength(2500);
  });

  it("adds nothing to a catalogue that holds a break, when asked for an empty one", async () => {
    await add(list("first", [listed("a1")]));

    const found = await add(list("second", [listed("b1")]), { intoEmpty: true });

    expect(found).toMatchObject({ inCatalogue: 1, added: 0, isRefused: true });
    expect((await rows()).map((row) => row.provider)).toEqual(["first"]);
    expect(await add(list("third", [listed("c1")]), { intoEmpty: false })).toMatchObject({
      added: 1,
      isRefused: false,
    });
  });

  it("deletes the breaks of one list, and leaves a spot made from one its name and point", async () => {
    await add(list("first", [listed("a1", { name: "North jetty", details: { crowd: 3 } })]));
    await add(list("second", [listed("b1")]));
    const [origin] = await rows();
    await database.db.insert(user).values({ id: "owner", name: "Owner", email: "o@example.org" });
    await database.db.insert(spot).values({
      id: "spot-1",
      userId: "owner",
      breakId: origin?.id,
      name: "My jetty",
      latitude: 48.1,
      longitude: -4.4,
    });

    expect(await remove("first", false)).toEqual({ removed: 1, spots: 1, forgotten: 0 });
    expect(await rows()).toHaveLength(2);

    expect(await remove("first")).toEqual({ removed: 1, spots: 1, forgotten: 0 });
    expect((await rows()).map((row) => row.provider)).toEqual(["second"]);
    expect(await records()).toEqual([]);
    expect((await listings()).map((row) => row.list)).toEqual(["second"]);
    expect(await database.db.select().from(spot)).toMatchObject([
      { id: "spot-1", breakId: null, name: "My jetty", latitude: 48.1, longitude: -4.4 },
    ]);
  });

  it("deletes nothing of a list the catalogue does not hold", async () => {
    await add(list("first", [listed("a1")]));

    expect(await remove("second")).toEqual({ removed: 0, spots: 0, forgotten: 0 });
    expect(await rows()).toHaveLength(1);
  });

  it("does not bring back a break that an operator merged into another or deleted", async () => {
    await add(list("example", [listed("a1"), listed("a2"), listed("a3")]));
    const [first, second] = await rows();
    // a2 was merged into a1, and a3 deleted: decision 049.
    await database.db
      .update(surfBreakListing)
      .set({ breakId: first?.id })
      .where(eq(surfBreakListing.ref, "a2"));
    await database.db.delete(surfBreak).where(eq(surfBreak.providerRef, "a2"));
    await database.db.delete(surfBreak).where(eq(surfBreak.providerRef, "a3"));
    expect(second?.providerRef).toBe("a2");

    expect(
      await add(list("example", [listed("a1"), listed("a2"), listed("a3"), listed("a4")])),
    ).toMatchObject({ listed: 4, added: 1, known: 3 });
    expect((await rows()).map((row) => row.providerRef)).toEqual(["a1", "a4"]);
  });

  it("forgets what a list said of the breaks it no longer has, and adds them again after", async () => {
    await add(list("example", [listed("a1"), listed("a2")]));
    await database.db.delete(surfBreak).where(eq(surfBreak.providerRef, "a2"));

    expect(await remove("example")).toEqual({ removed: 1, spots: 0, forgotten: 1 });
    expect(await listings()).toEqual([]);
    expect(await add(list("example", [listed("a1"), listed("a2")]))).toMatchObject({ added: 2 });
  });

  it("puts back in the queue a candidate whose break it deletes", async () => {
    await add(list("example", [listed("a1")]));
    const [made] = await rows();
    await database.db.insert(breakCandidate).values({
      id: "candidate-1",
      list: "guide",
      ref: "g1",
      name: "Guide's jetty",
      status: "merged",
      breakId: made?.id,
    });

    await remove("example");

    expect(await database.db.select().from(breakCandidate)).toMatchObject([
      { id: "candidate-1", status: "waiting", breakId: null, decidedAt: null },
    ]);
  });
});
