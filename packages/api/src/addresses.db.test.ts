import { addressOf, breakAtAddress, keepAddressOf, pathOf, placesOf } from "@repo/db/addresses";
import { surfBreak, surfBreakAlias } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The address of a break's page, given once from its places and its name: decision 057.

describe("the places of an address", () => {
  it("are the country and the region, as slugs", () => {
    expect(placesOf(["Spain", "Basque Country", "Biscay", "Mundaka"])).toEqual({
      countrySlug: "spain",
      regionSlug: "basque-country",
    });
  });

  it("name the country twice for a break with no region", () => {
    expect(placesOf(["Algeria"])).toEqual({ countrySlug: "algeria", regionSlug: "algeria" });
  });

  it("are null for a break with no places, which has no page", () => {
    expect(placesOf(null)).toEqual({ countrySlug: null, regionSlug: null });
    expect(pathOf({ countrySlug: null, regionSlug: null, slug: "x" })).toBeNull();
    expect(pathOf({ countrySlug: "spain", regionSlug: "basque-country", slug: "mundaka" })).toBe(
      "/spots/spain/basque-country/mundaka",
    );
  });
});

describe.skipIf(!TEST_DATABASE_URL)("the address a break takes", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const location = ["Spain", "Basque Country", "Biscay", "Mundaka"];

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(surfBreak);
  });

  const add = async (id: string, name: string, places: string[] | null = location) => {
    const address = await addressOf(database.db, { id, name, location: places });
    await database.db
      .insert(surfBreak)
      .values({ id, name, latitude: 43.4, longitude: -2.7, location: places, ...address });
    return address;
  };

  it("is the name under the country and the region", async () => {
    expect(await add("a1b2c3d4-0000", "Mundaka")).toEqual({
      countrySlug: "spain",
      regionSlug: "basque-country",
      slug: "mundaka",
    });
  });

  it("adds the nearest place when the slug is taken, then the id", async () => {
    await add("11111111-aaaa", "The Point");
    expect(await add("22222222-bbbb", "The Point")).toMatchObject({ slug: "the-point-mundaka" });
    expect(await add("33333333-cccc", "The Point")).toMatchObject({ slug: "the-point-333333" });
    // Another region is another address: the plain slug is free there.
    expect(await add("44444444-dddd", "The Point", ["Spain", "Galicia", "Lugo"])).toMatchObject({
      regionSlug: "galicia",
      slug: "the-point",
    });
  });

  it("goes to the id straight away for a break with no nearer place", async () => {
    await add("11111111-aaaa", "Annaba", ["Algeria"]);
    expect(await add("22222222-bbbb", "Annaba", ["Algeria"])).toEqual({
      countrySlug: "algeria",
      regionSlug: "algeria",
      slug: "annaba-222222",
    });
  });

  it("names a break with no letters by its id", async () => {
    expect(await add("55555555-eeee", "???")).toMatchObject({ slug: "spot-555555" });
  });

  it("reserves the addresses given in one run against one another", async () => {
    const reserved = new Set<string>();
    const first = await addressOf(database.db, { id: "1", name: "Left", location }, reserved);
    const second = await addressOf(database.db, { id: "2", name: "Left", location }, reserved);
    expect(first.slug).toBe("left");
    expect(second.slug).toBe("left-mundaka");
  });

  it("keeps the address of a merged break, which leads to the one that stays", async () => {
    const kept = await add("11111111-aaaa", "Mundaka");
    const gone = await add("22222222-bbbb", "Mundaka Rivermouth");
    await keepAddressOf(database.db, { id: "22222222-bbbb", ...gone }, "11111111-aaaa");
    await database.db.delete(surfBreak).where(eq(surfBreak.id, "22222222-bbbb"));

    expect(await breakAtAddress(database.db, gone)).toMatchObject({
      moved: true,
      row: { id: "11111111-aaaa" },
    });
    expect(await breakAtAddress(database.db, kept)).toMatchObject({ moved: false });
    // An address nobody had leads nowhere, and the one that was kept is not given again.
    expect(await breakAtAddress(database.db, { ...kept, slug: "nowhere" })).toBeNull();
    expect(await add("33333333-cccc", "Mundaka Rivermouth")).toMatchObject({
      slug: "mundaka-rivermouth-mundaka",
    });
    // The aliases go with the break they lead to.
    await database.db.delete(surfBreak).where(eq(surfBreak.id, "11111111-aaaa"));
    expect(await database.db.select().from(surfBreakAlias)).toEqual([]);
  });
});
