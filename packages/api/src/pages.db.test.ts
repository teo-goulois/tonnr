import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { breakContribution } from "@repo/db/schema/community";
import { surfBreak, surfBreakAlias } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { type Break, distanceKm, saidCharacteristics, standsAlone } from "./pages";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// The public page of a surf break, and which breaks are listed: decision 057.

const bare = {
  id: "x",
  name: "X",
  latitude: 0,
  longitude: 0,
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
  waveSizeMeters: null,
  location: null,
  timezone: null,
  description: null,
  descriptionLanguage: null,
  provider: null,
  providerRef: null,
  sourceUrl: null,
  licenseType: null,
  licenseUrl: null,
  attribution: null,
  lastSeenAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  countrySlug: null,
  regionSlug: null,
  slug: "x",
} satisfies Break;

// Seven characteristics said: the least a page stands on by itself.
const seven = {
  breakTypes: ["reef" as const],
  waveDirections: ["left" as const],
  bottomTypes: ["rock" as const],
  abilityLevels: ["advanced" as const],
  bestTides: ["mid" as const],
  bestSwellDirections: ["NW" as const],
  offshoreDirectionDegrees: 150,
};

describe("whether a break's page stands on its own", () => {
  it("counts the characteristics it says", () => {
    expect(saidCharacteristics(bare)).toBe(0);
    expect(saidCharacteristics({ ...bare, ...seven })).toBe(7);
  });

  it("takes seven characteristics, or a description, or a confirmed text of its guide", () => {
    expect(standsAlone(bare, { hasText: false })).toBe(false);
    expect(standsAlone({ ...bare, ...seven }, { hasText: false })).toBe(true);
    expect(standsAlone({ ...bare, ...seven, bestTides: null }, { hasText: false })).toBe(false);
    expect(
      standsAlone(
        { ...bare, description: "A reef.", descriptionLanguage: "en" },
        { hasText: false },
      ),
    ).toBe(true);
    expect(standsAlone(bare, { hasText: true })).toBe(true);
  });

  it("measures a distance along the earth", () => {
    const mundaka = { latitude: 43.4086, longitude: -2.6947 };
    const sopelana = { latitude: 43.3886, longitude: -2.9958 };
    expect(distanceKm(mundaka, sopelana)).toBeCloseTo(24.5, 0);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("the page of a surf break", () => {
  const WEB = "https://app.example.org";
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  const { forecasts, provider } = testForecasts();
  const mundaka = { latitude: 43.4086, longitude: -2.6947 };
  const now = Date.now();
  const measured = {
    buoy: new Date(now - 30 * 60 * 1000),
    windy: new Date(now - 10 * 60 * 1000),
    silent: new Date(now - 2 * 24 * 60 * 60 * 1000),
  };
  const licensed = {
    licenseType: "test",
    licenseUrl: "https://example.org/licence",
    attribution: "Example network",
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(user);
    await db.delete(station);
    await db.delete(surfBreak);
    await db
      .insert(user)
      .values({ id: "ana", name: "Ana", email: "ana@example.org", username: "ana" });
    await db.insert(surfBreak).values([
      {
        id: "mundaka",
        ...mundaka,
        name: "Mundaka",
        location: ["Spain", "Basque Country", "Biscay", "Mundaka"],
        timezone: "Europe/Madrid",
        countrySlug: "spain",
        regionSlug: "basque-country",
        slug: "mundaka",
        ...seven,
        offshoreDirectionDegrees: 150,
      },
      {
        // 24 km west, with a place alone: a page nobody is asked to list.
        id: "sopelana",
        name: "Sopelana",
        latitude: 43.3886,
        longitude: -2.9958,
        location: ["Spain", "Basque Country", "Biscay", "Sopelana"],
        countrySlug: "spain",
        regionSlug: "basque-country",
        slug: "sopelana",
        offshoreDirectionDegrees: 160,
      },
      {
        // Within reach, described by its operator: listed.
        id: "bakio",
        name: "Bakio",
        latitude: 43.43,
        longitude: -2.81,
        location: ["Spain", "Basque Country", "Biscay", "Bakio"],
        countrySlug: "spain",
        regionSlug: "basque-country",
        slug: "bakio",
        description: "A beach break that takes every swell.",
        descriptionLanguage: "en",
      },
      {
        // Another region of the same country, with its seven characteristics.
        id: "zarautz",
        name: "Zarautz",
        latitude: 43.29,
        longitude: -2.17,
        location: ["Spain", "Gipuzkoa", "Zarautz"],
        countrySlug: "spain",
        regionSlug: "gipuzkoa",
        slug: "zarautz",
        ...seven,
      },
      {
        // Far away, and with no places: it has no page.
        id: "nowhere",
        name: "Nowhere",
        latitude: 10,
        longitude: 10,
        slug: "nowhere",
        ...seven,
      },
    ]);
    await db.insert(station).values([
      {
        id: "buoy",
        provider: "example",
        providerStationId: "b1",
        name: "Bilbao-Vizcaya",
        latitude: 43.63,
        longitude: -3.05,
        reportsWaves: true,
        reportsWind: true,
        latestObservedAt: measured.buoy,
        ...licensed,
      },
      {
        id: "windy",
        provider: "example",
        providerStationId: "w1",
        name: "Bermeo airfield",
        latitude: 43.42,
        longitude: -2.72,
        reportsWaves: false,
        reportsWind: true,
        latestObservedAt: measured.windy,
        ...licensed,
      },
      {
        // Nearer than the buoy, and silent for two days: left out.
        id: "silent",
        provider: "example",
        providerStationId: "s1",
        name: "Old buoy",
        latitude: 43.45,
        longitude: -2.7,
        reportsWaves: true,
        reportsWind: false,
        latestObservedAt: measured.silent,
        ...licensed,
      },
    ]);
    await db.insert(reading).values([
      {
        stationId: "buoy",
        observedAt: measured.buoy,
        significantHeightM: 1.8,
        peakPeriodS: 12,
        peakDirectionDeg: 300,
        windSpeedMs: 4,
        windDirectionDeg: 320,
      },
      {
        stationId: "windy",
        observedAt: measured.windy,
        windSpeedMs: 6,
        windGustMs: 9,
        // Blowing from 160°: within 22.5° of the offshore direction, so offshore.
        windDirectionDeg: 160,
      },
      {
        stationId: "silent",
        observedAt: measured.silent,
        significantHeightM: 3,
      },
    ]);
  });

  const visitor = () => {
    const context: Context = {
      db: database.db,
      session: null,
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
  const account = (id: string) => {
    const { context } = visitor();
    return {
      context: {
        ...context,
        session: {
          user: { id, name: id, email: `${id}@example.org`, emailVerified: true },
          session: {
            id: `s-${id}`,
            userId: id,
            token: `t-${id}`,
            expiresAt: new Date("2030-01-01"),
          },
        } as Session,
      },
    };
  };
  const page = (country: string, region: string, slug: string) =>
    call(v1Router.pages.break, { country, region, slug }, visitor());

  it("says what the break is, the sea now, the tide and the breaks nearby, and asks no provider", async () => {
    const asked = provider.asked;
    const read = await page("spain", "basque-country", "mundaka");
    if (read.moved) throw new Error("moved");

    expect(read.break).toMatchObject({
      id: "mundaka",
      name: "Mundaka",
      page: "/spots/spain/basque-country/mundaka",
      characteristics: { breakTypes: ["reef"], offshoreDirectionDegrees: 150 },
    });
    expect(read.listed).toBe(true);
    expect(read.places).toEqual([
      { name: "Spain", page: "/spots/spain" },
      { name: "Basque Country", page: "/spots/spain/basque-country" },
      { name: "Biscay", page: null },
      { name: "Mundaka", page: null },
    ]);
    // The buoy that measured lately, not the nearer one that fell silent.
    expect(read.waves).toMatchObject({
      id: "buoy",
      latestReading: { significantHeightMeters: 1.8 },
    });
    expect(read.waves?.distanceKm).toBeCloseTo(38, 0);
    expect(read.wind).toMatchObject({
      id: "windy",
      latestReading: { windSpeedMetersPerSecond: 6 },
      atShore: "offshore",
    });
    expect(read.tide?.extremes.length).toBeGreaterThan(0);
    expect(read.tide?.extremes[0]?.time.getTime()).toBeGreaterThan(Date.now() - 60 * 60 * 1000);
    // Nothing was kept for the cell: no week, and the provider was not asked.
    expect(read.week).toBeNull();
    expect(provider.asked).toBe(asked);
    // The listed break first, then the nearest. The one with no places has no page, and is not here.
    // The listed breaks first, then the nearest: Zarautz, 44 km east, is within reach.
    expect(read.nearby.map((near) => [near.id, near.listed])).toEqual([
      ["bakio", true],
      ["zarautz", true],
      ["sopelana", false],
    ]);
    expect(read.nearby[2]?.distanceKm).toBeCloseTo(24.5, 0);
  });

  it("gives the week from the forecast another question kept, and says when it was fetched", async () => {
    await Effect.runPromise(forecasts.get({ ...mundaka, days: 1 }));
    const read = await page("spain", "basque-country", "mundaka");
    if (read.moved) throw new Error("moved");
    expect(read.week).toMatchObject({ stale: false });
    expect(read.week?.days.length).toBeGreaterThanOrEqual(6);
    expect(read.week?.days[0]).toMatchObject({
      wave: { heightMeters: 1.5 },
      wind: { speedMetersPerSecond: 5 },
    });
    expect(read.week?.source.attribution).toContain("Open-Meteo");
  });

  it("asks nobody to list a break with a place alone, until its guide says more", async () => {
    const before = await page("spain", "basque-country", "sopelana");
    if (before.moved) throw new Error("moved");
    expect(before.listed).toBe(false);

    await database.db.insert(breakContribution).values({
      id: "c1",
      breakId: "sopelana",
      userId: "ana",
      breakRef: "sopelana",
      line: "access",
      value: "Park at the beach's car park and walk down the ramp.",
      language: "en",
      status: "confirmed",
      confirmedAt: new Date(),
      license: "DbCL-1.0",
    });
    const after = await page("spain", "basque-country", "sopelana");
    if (after.moved) throw new Error("moved");
    expect(after.listed).toBe(true);
    // What lists the break is on its page.
    expect(after.texts).toEqual([
      {
        line: "access",
        language: "en",
        text: "Park at the beach's car park and walk down the ramp.",
      },
    ]);
  });

  it("leads from the address of a merged break to the one that stays, and finds no page elsewhere", async () => {
    await database.db.insert(surfBreakAlias).values({
      countrySlug: "spain",
      regionSlug: "basque-country",
      slug: "mundaka-rivermouth",
      breakId: "mundaka",
    });
    expect(await page("spain", "basque-country", "mundaka-rivermouth")).toEqual({
      moved: true,
      to: { country: "spain", region: "basque-country", slug: "mundaka" },
      page: "/spots/spain/basque-country/mundaka",
    });
    await expect(page("spain", "basque-country", "nowhere")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(page("spain", "galicia", "mundaka")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists the countries, the regions and the breaks that stand on their own, and the sitemap's addresses", async () => {
    const countries = await call(v1Router.pages.countries, undefined, visitor());
    expect(countries.countries).toEqual([
      { country: "spain", name: "Spain", page: "/spots/spain", listed: 3 },
    ]);
    const spain = await call(v1Router.pages.country, { country: "spain" }, account("ana"));
    expect(spain).toEqual({
      name: "Spain",
      listed: 3,
      regions: [
        {
          region: "basque-country",
          name: "Basque Country",
          page: "/spots/spain/basque-country",
          listed: 2,
        },
        { region: "gipuzkoa", name: "Gipuzkoa", page: "/spots/spain/gipuzkoa", listed: 1 },
      ],
    });
    const biscay = await call(
      v1Router.pages.region,
      { country: "spain", region: "basque-country" },
      visitor(),
    );
    expect(biscay.name).toBe("Basque Country");
    expect(biscay.breaks.map((found) => found.id)).toEqual(["bakio", "mundaka"]);
    await expect(
      call(v1Router.pages.country, { country: "france" }, visitor()),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const hubs = await call(v1Router.pages.hubs, undefined, visitor());
    expect(hubs.hubs.map((hub) => hub.page)).toEqual([
      "/spots/spain",
      "/spots/spain/basque-country",
      "/spots/spain/gipuzkoa",
    ]);
    const listed = await call(v1Router.pages.listed, { page: 0 }, visitor());
    expect(listed.pages).toBe(1);
    expect(listed.breaks.map((found) => found.page)).toEqual([
      "/spots/spain/basque-country/bakio",
      "/spots/spain/basque-country/mundaka",
      "/spots/spain/gipuzkoa/zarautz",
    ]);
    expect(await call(v1Router.pages.listed, { page: 1 }, visitor())).toMatchObject({ breaks: [] });
  });
});
