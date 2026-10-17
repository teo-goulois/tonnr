import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { breakAtAddress } from "@repo/db/addresses";
import { catchUpListings } from "@repo/db/catalogue";
import { operator, operatorAction } from "@repo/db/schema/access";
import { alert, alertSpot, alertWindow } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { breakCandidate, breakCandidateImage } from "@repo/db/schema/catalogue";
import { breakAnswer, breakContribution } from "@repo/db/schema/community";
import { stationList, stationListBreak } from "@repo/db/schema/lists";
import { recentView } from "@repo/db/schema/preferences";
import { surfSession } from "@repo/db/schema/sessions";
import { spot, surfBreak, surfBreakListing, surfBreakRecord } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// An operator keeps the catalogue of breaks from the admin, and decides what a list proposes to
// it: decision 049. Invented breaks and candidates: no list's data is in the tests.
describe.skipIf(!TEST_DATABASE_URL)("the catalogue, in an operator's hands", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  const ids = {
    north: "00000000-0000-4000-8000-000000000001",
    south: "00000000-0000-4000-8000-000000000002",
    far: "00000000-0000-4000-8000-000000000003",
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
    await db.delete(operatorAction);
    await db.delete(breakCandidate);
    await db.delete(breakCandidateImage);
    await db.delete(surfBreakListing);
    await db.delete(user);
    await db.delete(surfBreak);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "owner", name: "Owner", email: "owner@example.org" },
    ]);
    await db.insert(operator).values({ userId: "owner" });
    await db.insert(surfBreak).values([
      {
        id: ids.north,
        slug: ids.north,
        name: "North jetty",
        latitude: 48,
        longitude: -4.5,
        breakTypes: ["jetty"],
        provider: "example",
        providerRef: "n1",
        licenseType: "ODbL-1.0",
        licenseUrl: "https://example.org/odbl",
        attribution: "Example contributors",
      },
      // 300 meters south of it: the same place, from another list.
      {
        id: ids.south,
        countrySlug: "france",
        regionSlug: "finistere",
        slug: "jetty-north",
        name: "Jetty (north)",
        latitude: 47.9973,
        longitude: -4.5,
        bottomTypes: ["rock"],
        location: ["France", "Finistère"],
        provider: "other",
        providerRef: "s1",
      },
      {
        id: ids.far,
        slug: ids.far,
        name: "Far reef",
        latitude: 40,
        longitude: 10,
        provider: "other",
        providerRef: "f1",
      },
    ]);
    await db.insert(surfBreakListing).values([
      { list: "example", ref: "n1", breakId: ids.north, details: { crowd: 2 } },
      { list: "other", ref: "s1", breakId: ids.south, details: null },
    ]);
  });

  const context = (id: string, site: string): Context => ({
    db: database.db,
    session: {
      user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
      session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
    } as Session,
    authorization: null,
    site,
    adminSites: [ADMIN],
    usage,
    forecasts,
    places: testPlaces().places,
    verification: testVerification(database.db, { on: false }).verification,
    reply: {},
    server: { startedAt: new Date("2026-10-14T08:00:00Z"), webOrigin: WEB },
  });
  const asOperator = () => ({ context: context("owner", ADMIN) });
  const by = (id: string) => ({ context: context(id, WEB) });

  const failure = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
      return "answered";
    } catch (error) {
      return error instanceof ORPCError ? error.code : String(error);
    }
  };
  const page = (id: string) => call(v1Router.catalogue.get, { id }, asOperator());
  const actions = async () =>
    (await database.db.select().from(operatorAction).orderBy(asc(operatorAction.at))).map((row) => [
      row.action,
      row.changes,
    ]);
  const valuesOf = (found: Awaited<ReturnType<typeof page>>["break"]) => ({
    name: found.name,
    latitude: found.latitude,
    longitude: found.longitude,
    characteristics: found.characteristics,
    description: found.description,
  });

  describe("a break", () => {
    it("is read with what uses it, what its lists said, and the breaks near it", async () => {
      const read = await page(ids.north);

      expect(read.break).toMatchObject({
        id: ids.north,
        name: "North jetty",
        characteristics: { breakTypes: ["jetty"], bottomTypes: null },
        confirmed: {},
        description: null,
        source: { provider: "example", ref: "n1", license: { type: "ODbL-1.0" } },
      });
      expect(read.uses).toEqual({
        spots: 0,
        alerts: 0,
        lists: 0,
        sessions: 0,
        contributions: 0,
        answers: 0,
        publications: 0,
      });
      expect(read.listings).toEqual([{ list: "example", ref: "n1", details: { crowd: 2 } }]);
      expect(read.nearby).toMatchObject([{ id: ids.south, meters: 300 }]);
    });

    it("draws every break of the catalogue on the map", async () => {
      const { breaks } = await call(v1Router.catalogue.map, undefined, asOperator());
      expect(breaks).toEqual([
        expect.objectContaining({ id: ids.north, known: true, described: false }),
        expect.objectContaining({ id: ids.south, known: true }),
        expect.objectContaining({ id: ids.far, known: false }),
      ]);
    });

    it("is changed, with a description that anyone then reads, and the change is recorded", async () => {
      const read = await page(ids.north);
      const changed = await call(
        v1Router.catalogue.update,
        {
          id: ids.north,
          updatedAt: read.break.updatedAt,
          values: {
            ...valuesOf(read.break),
            name: "The north jetty",
            characteristics: { breakTypes: ["jetty", "beach"], bestTides: ["low"] },
            description: { text: "  A jetty that\nholds a left.  ", language: "en" },
          },
        },
        asOperator(),
      );

      expect(changed.break).toMatchObject({
        name: "The north jetty",
        // Each list in the order of its words.
        characteristics: { breakTypes: ["beach", "jetty"], bestTides: ["low"], bottomTypes: null },
        description: { text: "A jetty that holds a left.", language: "en" },
      });
      expect(changed.break.updatedAt.getTime()).toBeGreaterThan(read.break.updatedAt.getTime());
      expect(await call(v1Router.breaks.get, { id: ids.north }, by("ana"))).toMatchObject({
        name: "The north jetty",
        description: { text: "A jetty that holds a left.", language: "en" },
      });
      expect(await actions()).toEqual([
        [
          "break.update",
          {
            breakId: ids.north,
            fields: ["name", "breakTypes", "bestTides", "description", "descriptionLanguage"],
          },
        ],
      ]);
    });

    it("is not changed from a version that is not the last, nor recorded when nothing changes", async () => {
      const read = await page(ids.north);
      const update = (updatedAt: Date, name: string) =>
        call(
          v1Router.catalogue.update,
          { id: ids.north, updatedAt, values: { ...valuesOf(read.break), name } },
          asOperator(),
        );

      await update(read.break.updatedAt, "North jetty");
      expect(await actions()).toEqual([]);
      await update(read.break.updatedAt, "First");
      expect(await failure(update(read.break.updatedAt, "Second"))).toBe("CONFLICT");
      expect((await page(ids.north)).break.name).toBe("First");
    });

    it("is changed by an operator alone, from the admin's site", async () => {
      const read = await page(ids.north);
      const input = {
        id: ids.north,
        updatedAt: read.break.updatedAt,
        values: valuesOf(read.break),
      };
      expect(await failure(call(v1Router.catalogue.update, input, by("ana")))).toBe("FORBIDDEN");
      expect(
        await failure(call(v1Router.catalogue.update, input, { context: context("owner", WEB) })),
      ).toBe("FORBIDDEN");
    });
  });

  it("names by its list a break that the version before this one added, with what its list said", async () => {
    const { db } = database;
    await db.insert(surfBreak).values({
      id: "00000000-0000-4000-8000-000000000009",
      slug: "00000000-0000-4000-8000-000000000009",
      name: "Added during a deployment",
      latitude: 41,
      longitude: 9,
      provider: "other",
      providerRef: "d1",
    });
    await db.insert(surfBreakRecord).values({
      breakId: "00000000-0000-4000-8000-000000000009",
      details: { crowd: 1 },
    });

    await catchUpListings(db);
    await catchUpListings(db);

    expect(
      await db.select().from(surfBreakListing).where(eq(surfBreakListing.ref, "d1")),
    ).toMatchObject([
      { list: "other", breakId: "00000000-0000-4000-8000-000000000009", details: { crowd: 1 } },
    ]);
    // A listing that holds something keeps it.
    expect(
      await db.select().from(surfBreakListing).where(eq(surfBreakListing.ref, "n1")),
    ).toMatchObject([{ details: { crowd: 2 } }]);
  });

  describe("merging two breaks", () => {
    const useSouth = async () => {
      const { db } = database;
      await db.insert(spot).values({
        id: "spot-1",
        userId: "ana",
        breakId: ids.south,
        name: "My jetty",
        latitude: 48,
        longitude: -4.5,
        updatedAt: new Date("2026-10-01T00:00:00Z"),
      });
      // An alert set on the break that goes, and one set on both: decision 064.
      const asked = { waveHeightMeters: { min: 1 } };
      await db.insert(alert).values([
        { id: "alert-south", userId: "ana", name: "South", criteria: asked },
        { id: "alert-both", userId: "ana", name: "Both", criteria: asked },
      ]);
      await db.insert(alertSpot).values([
        { alertId: "alert-south", breakId: ids.south, position: 0 },
        { alertId: "alert-both", breakId: ids.north, position: 0 },
        { alertId: "alert-both", breakId: ids.south, position: 1 },
      ]);
      await db.insert(alertWindow).values({
        alertId: "alert-south",
        breakId: ids.south,
        seaStart: new Date("2026-10-02T08:00:00Z"),
        seaEnd: new Date("2026-10-02T12:00:00Z"),
      });
      await db.insert(stationList).values([
        { id: "list-1", userId: "ana", name: "Both" },
        { id: "list-2", userId: "ana", name: "South" },
      ]);
      await db.insert(stationListBreak).values([
        { listId: "list-1", breakId: ids.north },
        { listId: "list-1", breakId: ids.south },
        { listId: "list-2", breakId: ids.south },
      ]);
      await db.insert(surfSession).values({
        id: "session-1",
        userId: "ana",
        breakId: ids.south,
        placeName: "Jetty",
        latitude: 48,
        longitude: -4.5,
        startedAt: new Date("2026-10-01T08:00:00Z"),
        durationMinutes: 90,
      });
      await db.insert(breakAnswer).values([
        { breakId: ids.north, userId: "ana", question: "crowd", answer: "busy" },
        { breakId: ids.south, userId: "ana", question: "crowd", answer: "quiet" },
        { breakId: ids.south, userId: "ana", question: "locals", answer: "friendly" },
      ]);
      await db.insert(recentView).values({
        userId: "ana",
        kind: "break",
        targetId: ids.south,
        viewedAt: new Date("2026-10-02T00:00:00Z"),
      });
      await db.insert(breakCandidate).values({
        id: "candidate-1",
        list: "guide",
        ref: "g1",
        name: "The jetty",
        status: "merged",
        breakId: ids.south,
      });
    };

    const merge = async (keepId: string, mergeId: string, sourceOf?: "kept" | "merged") => {
      const keep = await page(keepId);
      const gone = await page(mergeId);
      return call(
        v1Router.catalogue.merge,
        {
          id: keepId,
          updatedAt: keep.break.updatedAt,
          mergeId,
          mergeUpdatedAt: gone.break.updatedAt,
          values: {
            ...valuesOf(keep.break),
            characteristics: { ...keep.break.characteristics, bottomTypes: ["rock"] },
          },
          sourceOf,
        },
        asOperator(),
      );
    };

    it("moves everything that named the one that goes to the one that stays", async () => {
      await useSouth();
      const merged = await merge(ids.north, ids.south);

      // The address of the one that went leads to the one that stays, which took the places
      // of the one that went and an address with them: decision 057.
      expect(
        await breakAtAddress(database.db, {
          countrySlug: "france",
          regionSlug: "finistere",
          slug: "jetty-north",
        }),
      ).toMatchObject({
        moved: true,
        row: { id: ids.north, countrySlug: "france", regionSlug: "finistere" },
      });
      expect(merged.break).toMatchObject({
        id: ids.north,
        characteristics: { breakTypes: ["jetty"], bottomTypes: ["rock"] },
        // Where it lies, which only the one that went said.
        location: ["France", "Finistère"],
        source: { provider: "example", ref: "n1" },
      });
      expect(merged.uses).toEqual({
        spots: 1,
        alerts: 2,
        lists: 2,
        sessions: 1,
        contributions: 0,
        answers: 2,
        publications: 0,
      });
      const { db } = database;
      expect(await db.select().from(surfBreak).where(eq(surfBreak.id, ids.south))).toEqual([]);
      // Its owner did not change the spot.
      expect(await db.select().from(spot)).toMatchObject([
        { breakId: ids.north, updatedAt: new Date("2026-10-01T00:00:00Z") },
      ]);
      expect(
        await db.select().from(stationListBreak).orderBy(asc(stationListBreak.listId)),
      ).toMatchObject([
        { listId: "list-1", breakId: ids.north },
        { listId: "list-2", breakId: ids.north },
      ]);
      expect(await db.select().from(surfSession)).toMatchObject([{ breakId: ids.north }]);
      // An alert set on both holds the one that stays once, and what was seen at the one that
      // went is forgotten.
      expect(
        await db
          .select({ alertId: alertSpot.alertId, breakId: alertSpot.breakId })
          .from(alertSpot)
          .orderBy(asc(alertSpot.alertId)),
      ).toEqual([
        { alertId: "alert-both", breakId: ids.north },
        { alertId: "alert-south", breakId: ids.north },
      ]);
      expect(await db.select().from(alertWindow)).toEqual([]);
      expect(
        await db.select({ revision: alert.revision }).from(alert).orderBy(asc(alert.id)),
      ).toEqual([{ revision: 1 }, { revision: 1 }]);
      // The answer given to the one that stays is kept.
      expect(await db.select().from(breakAnswer).orderBy(asc(breakAnswer.question))).toMatchObject([
        { breakId: ids.north, question: "crowd", answer: "busy" },
        { breakId: ids.north, question: "locals", answer: "friendly" },
      ]);
      expect(await db.select().from(recentView)).toMatchObject([{ targetId: ids.north }]);
      expect(merged.listings).toEqual([
        { list: "example", ref: "n1", details: { crowd: 2 } },
        { list: "other", ref: "s1", details: null },
      ]);
      expect(merged.candidates).toMatchObject([{ id: "candidate-1", status: "merged" }]);
      expect(await actions()).toEqual([
        ["break.merge", { breakId: ids.north, mergedId: ids.south, fields: ["bottomTypes"] }],
      ]);
    });

    it("keeps the source of the one that goes when the operator says so", async () => {
      const merged = await merge(ids.south, ids.north, "merged");

      expect(merged.break).toMatchObject({
        id: ids.south,
        source: {
          provider: "example",
          ref: "n1",
          license: { type: "ODbL-1.0" },
          attribution: "Example contributors",
        },
      });
      // Adding either list again brings back neither break.
      expect(merged.listings).toHaveLength(2);
    });

    it("does not take away a break that accounts wrote in the guide of", async () => {
      await database.db.insert(breakContribution).values({
        id: "c-1",
        breakId: ids.south,
        breakRef: ids.south,
        userId: "ana",
        line: "access",
        value: "By the harbour",
        language: "en",
        status: "confirmed",
        license: "DbCL-1.0",
      });

      expect(await failure(merge(ids.north, ids.south))).toBe("CONFLICT");
      expect(await page(ids.south)).toBeTruthy();
      // The other way round, it stays.
      expect((await merge(ids.south, ids.north)).uses.contributions).toBe(1);
    });

    it("refuses a break merged into itself, and a version that is not the last", async () => {
      const read = await page(ids.north);
      const input = {
        id: ids.north,
        updatedAt: read.break.updatedAt,
        mergeId: ids.north,
        mergeUpdatedAt: read.break.updatedAt,
        values: valuesOf(read.break),
      };
      expect(await failure(call(v1Router.catalogue.merge, input, asOperator()))).toBe(
        "BAD_REQUEST",
      );
      expect(
        await failure(
          call(
            v1Router.catalogue.merge,
            { ...input, mergeId: ids.south, mergeUpdatedAt: new Date("2020-01-01") },
            asOperator(),
          ),
        ),
      ).toBe("CONFLICT");
    });
  });

  describe("deleting a break", () => {
    const remove = async (id: string) =>
      call(
        v1Router.catalogue.remove,
        { id, updatedAt: (await page(id)).break.updatedAt },
        asOperator(),
      );

    it("refuses one that an account uses, and says what uses it", async () => {
      await database.db.insert(stationList).values({ id: "list-1", userId: "ana", name: "Mine" });
      await database.db.insert(stationListBreak).values({ listId: "list-1", breakId: ids.far });

      const refused = await remove(ids.far).catch((error: unknown) => error);
      expect(refused).toMatchObject({ code: "CONFLICT", data: { uses: { lists: 1 } } });
      expect(await page(ids.far)).toBeTruthy();
    });

    it("deletes one nobody uses, keeps its reference known, and puts its candidates back in the queue", async () => {
      await database.db.insert(breakCandidate).values({
        id: "candidate-1",
        list: "guide",
        ref: "g1",
        name: "Far reef",
        status: "added",
        breakId: ids.far,
      });

      expect(await remove(ids.far)).toEqual({ id: ids.far });
      expect(await failure(page(ids.far))).toBe("NOT_FOUND");
      expect(
        await database.db.select().from(surfBreakListing).where(eq(surfBreakListing.ref, "f1")),
      ).toMatchObject([{ list: "other", breakId: null }]);
      expect(await database.db.select().from(breakCandidate)).toMatchObject([
        { status: "waiting", breakId: null },
      ]);
      expect(await actions()).toEqual([["break.delete", { breakId: ids.far }]]);
    });
  });

  describe("a list's candidates", () => {
    beforeEach(async () => {
      await database.db.insert(breakCandidate).values([
        {
          id: "c-add",
          list: "guide",
          ref: "p001-n01",
          name: "Guide's beach",
          location: ["France", "Brittany"],
          latitude: 47.5,
          longitude: -3.1,
          characteristics: { breakTypes: ["beach"] },
          proposal: { action: "add", note: "Nothing near" },
          texts: [{ label: "description", language: "en", text: "A sheltered beach." }],
          figures: [{ image: "p1.jpg", crop: [0, 0, 1, 0.5] }],
          details: { pages: [1] },
          updatedAt: new Date("2026-10-14T08:00:00Z"),
        },
        {
          id: "c-merge",
          list: "guide",
          ref: "p001-n02",
          name: "North Jetty",
          location: ["France", "Brittany"],
          characteristics: { waveDirections: ["left"] },
          proposal: { action: "merge", breakId: ids.north, others: [ids.far, "gone", ids.north] },
          updatedAt: new Date("2026-10-14T08:00:00Z"),
        },
        {
          id: "c-spain",
          list: "guide",
          ref: "p002-n01",
          name: "A Spanish point",
          location: ["Spain"],
          proposal: { action: "hold", others: [ids.south] },
          updatedAt: new Date("2026-10-14T08:00:00Z"),
        },
      ]);
      await database.db.insert(breakCandidateImage).values({
        list: "guide",
        name: "p1.jpg",
        contentType: "image/jpeg",
        bytes: Buffer.from([1, 2, 3]),
      });
    });
    const at = new Date("2026-10-14T08:00:00Z");

    it("are listed in their list's order, with how many there are of each state and region", async () => {
      const listed = await call(v1Router.candidates.list, {}, asOperator());
      expect(listed.candidates.map((one) => one.id)).toEqual(["c-add", "c-merge", "c-spain"]);
      expect(listed.counts).toMatchObject({ waiting: 3, added: 0 });
      expect(listed.regions).toEqual([
        { name: "France", total: 2 },
        { name: "Spain", total: 1 },
      ]);
      expect(listed.lists).toEqual(["guide"]);
      expect(
        (await call(v1Router.candidates.list, { region: "Spain" }, asOperator())).candidates,
      ).toMatchObject([{ id: "c-spain" }]);
    });

    it("is read with the break it is proposed to go into, the breaks near, and the next", async () => {
      const read = await call(v1Router.candidates.get, { id: "c-merge" }, asOperator());
      expect(read.target).toMatchObject({ id: ids.north });
      expect(read.nearby.map((one) => one.id)).toEqual([ids.north, ids.south]);
      // The others the list thought of, wherever they are, and none that is gone.
      expect(read.others).toEqual([
        expect.objectContaining({ id: ids.far, meters: expect.any(Number) }),
      ]);
      expect((await call(v1Router.candidates.get, { id: "c-spain" }, asOperator())).others).toEqual(
        [expect.objectContaining({ id: ids.south, meters: null })],
      );
      // The next of its region.
      expect(read.next).toBeNull();
      expect((await call(v1Router.candidates.get, { id: "c-add" }, asOperator())).next).toBe(
        "c-merge",
      );
    });

    it("shows its pictures", async () => {
      const file = await call(
        v1Router.candidates.image,
        { list: "guide", name: "p1.jpg" },
        asOperator(),
      );
      expect(file.type).toBe("image/jpeg");
      expect([...new Uint8Array(await (file as Blob).arrayBuffer())]).toEqual([1, 2, 3]);
    });

    it("is added to the catalogue with no source but its list, once", async () => {
      const values = {
        name: "Guide's beach",
        latitude: 47.5,
        longitude: -3.1,
        characteristics: { breakTypes: ["beach" as const] },
        description: { text: "A beach out of the west wind.", language: "en" as const },
      };
      const added = await call(
        v1Router.candidates.add,
        { id: "c-add", updatedAt: at, values },
        asOperator(),
      );

      expect(added.candidate).toMatchObject({ status: "added", decidedAt: expect.any(Date) });
      const breakId = added.candidate.breakId ?? "";
      expect(await call(v1Router.breaks.get, { id: breakId }, by("ana"))).toMatchObject({
        name: "Guide's beach",
        location: ["France", "Brittany"],
        description: { text: "A beach out of the west wind.", language: "en" },
        source: { provider: "guide", url: null, attribution: null, license: null },
      });
      expect((await page(breakId)).listings).toEqual([
        { list: "guide", ref: "p001-n01", details: { pages: [1] } },
      ]);
      expect(
        await failure(
          call(v1Router.candidates.add, { id: "c-add", updatedAt: at, values }, asOperator()),
        ),
      ).toBe("CONFLICT");
      expect(await actions()).toEqual([
        ["candidate.add", { breakId, candidate: { list: "guide", ref: "p001-n01" } }],
      ]);
    });

    it("is merged into a break, which takes the values the operator chose", async () => {
      const target = await page(ids.north);
      const merged = await call(
        v1Router.candidates.merge,
        {
          id: "c-merge",
          updatedAt: at,
          breakId: ids.north,
          breakUpdatedAt: target.break.updatedAt,
          values: {
            ...valuesOf(target.break),
            characteristics: { ...target.break.characteristics, waveDirections: ["left"] },
          },
        },
        asOperator(),
      );

      expect(merged.candidate).toMatchObject({ status: "merged", breakId: ids.north });
      expect(merged.target).toMatchObject({
        id: ids.north,
        characteristics: { breakTypes: ["jetty"], waveDirections: ["left"] },
      });
      expect((await page(ids.north)).listings.map((one) => one.list)).toEqual(["example", "guide"]);
    });

    it("is left out, put off, and put back in the queue", async () => {
      const ignored = await call(
        v1Router.candidates.ignore,
        { id: "c-spain", updatedAt: at, note: "Not a surf spot" },
        asOperator(),
      );
      expect(ignored.candidate).toMatchObject({ status: "ignored", note: "Not a surf spot" });
      // Decided, it is not decided again.
      expect(
        await failure(
          call(
            v1Router.candidates.add,
            {
              id: "c-spain",
              updatedAt: ignored.candidate.updatedAt,
              values: {
                name: "x",
                latitude: 40,
                longitude: -3,
                characteristics: {},
                description: null,
              },
            },
            asOperator(),
          ),
        ),
      ).toBe("CONFLICT");

      const back = await call(
        v1Router.candidates.reopen,
        { id: "c-spain", updatedAt: ignored.candidate.updatedAt },
        asOperator(),
      );
      expect(back.candidate).toMatchObject({ status: "waiting", decidedAt: null });
      const later = await call(
        v1Router.candidates.later,
        { id: "c-spain", updatedAt: back.candidate.updatedAt },
        asOperator(),
      );
      expect(later.candidate.status).toBe("later");
      expect((await actions()).map(([action]) => action)).toEqual([
        "candidate.ignore",
        "candidate.reopen",
        "candidate.later",
      ]);
    });
  });
});
