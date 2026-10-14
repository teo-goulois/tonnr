import { breakCandidate, breakCandidateImage } from "@repo/db/schema/catalogue";
import { surfBreak, surfBreakListing } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  type CandidateList,
  type ListedCandidate,
  removeCandidates,
  storeCandidates,
} from "./candidates";

// Invented candidates: no list's data is in the tests.
function candidate(ref: string, overrides: Partial<ListedCandidate> = {}): ListedCandidate {
  return {
    ref,
    name: ref,
    location: null,
    latitude: null,
    longitude: null,
    pointNote: null,
    pointUrl: null,
    characteristics: null,
    proposal: null,
    evidence: [],
    texts: [],
    figures: [],
    details: null,
    ...overrides,
  };
}

const picture = (name: string, byte = 1) => ({
  name,
  contentType: "image/jpeg",
  bytes: Buffer.from([byte, byte, byte]),
});

describe.skipIf(!TEST_DATABASE_URL)("a list's candidates", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(breakCandidate);
    await database.db.delete(breakCandidateImage);
    await database.db.delete(surfBreak);
    await database.db.delete(surfBreakListing);
  });

  const store = (given: ListedCandidate[], pictures = [picture("p1.jpg")], write = true) =>
    Effect.runPromise(
      storeCandidates(
        database.db,
        { list: "guide", candidates: given } as CandidateList,
        pictures,
        {
          write,
        },
      ),
    );
  const rows = () => database.db.select().from(breakCandidate).orderBy(asc(breakCandidate.ref));

  it("stores new candidates to wait, with their pictures", async () => {
    const found = await store([
      candidate("g1", { texts: [{ label: "description", text: "A jetty." }] }),
      candidate("g2"),
    ]);

    expect(found).toEqual({
      list: "guide",
      listed: 2,
      added: 2,
      refreshed: 0,
      unchanged: 0,
      decided: 0,
      known: 0,
      pictures: 1,
    });
    expect(await rows()).toMatchObject([
      { list: "guide", ref: "g1", status: "waiting", texts: [{ label: "description" }] },
      { list: "guide", ref: "g2", status: "waiting" },
    ]);
    expect(await database.db.select().from(breakCandidateImage)).toMatchObject([
      { list: "guide", name: "p1.jpg", contentType: "image/jpeg" },
    ]);
  });

  it("stores nothing without write", async () => {
    expect(await store([candidate("g1")], [picture("p1.jpg")], false)).toMatchObject({ added: 1 });
    expect(await rows()).toEqual([]);
    expect(await database.db.select().from(breakCandidateImage)).toEqual([]);
  });

  it("brings up to date what waits, and leaves what was decided", async () => {
    await store([candidate("g1"), candidate("g2"), candidate("g3")]);
    await database.db
      .update(breakCandidate)
      .set({ status: "ignored" })
      .where(eq(breakCandidate.ref, "g3"));
    const [before] = await rows();

    const found = await store([
      candidate("g1"),
      candidate("g2", {
        proposal: { action: "add", note: "Found its point" },
        latitude: 48,
        longitude: -4,
      }),
      candidate("g3", { name: "Renamed" }),
    ]);

    expect(found).toMatchObject({ added: 0, refreshed: 1, unchanged: 1, decided: 1 });
    const [first, second, third] = await rows();
    expect(first?.updatedAt).toEqual(before?.updatedAt);
    expect(second).toMatchObject({ latitude: 48, proposal: { action: "add" } });
    expect(third).toMatchObject({ name: "g3", status: "ignored" });
  });

  it("does not propose again what the catalogue knows from the same list", async () => {
    await database.db.insert(surfBreakListing).values({ list: "guide", ref: "g1", breakId: null });

    expect(await store([candidate("g1"), candidate("g2")])).toMatchObject({ added: 1, known: 1 });
    expect((await rows()).map((row) => row.ref)).toEqual(["g2"]);
  });

  it("replaces a picture that changed", async () => {
    await store([candidate("g1")], [picture("p1.jpg", 1)]);
    await store([candidate("g1")], [picture("p1.jpg", 2)]);

    const [kept] = await database.db.select().from(breakCandidateImage);
    expect([...(kept?.bytes ?? [])]).toEqual([2, 2, 2]);
  });

  it("deletes a list's candidates and pictures, and leaves another list's", async () => {
    await store([candidate("g1"), candidate("g2")]);
    await database.db
      .insert(breakCandidate)
      .values({ id: "other", list: "atlas", ref: "a1", name: "A1" });
    await database.db
      .update(breakCandidate)
      .set({ status: "added" })
      .where(eq(breakCandidate.ref, "g2"));

    const remove = (write: boolean) =>
      Effect.runPromise(removeCandidates(database.db, "guide", { write }));
    expect(await remove(false)).toEqual({ removed: 2, waiting: 1, pictures: 1 });
    expect(await rows()).toHaveLength(3);
    expect(await remove(true)).toEqual({ removed: 2, waiting: 1, pictures: 1 });
    expect((await rows()).map((row) => row.list)).toEqual(["atlas"]);
    expect(await database.db.select().from(breakCandidateImage)).toEqual([]);
  });
});
