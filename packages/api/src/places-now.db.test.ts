import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { providerCalls } from "@repo/db/schema/forecasts";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { FORECAST_CALLERS, FORECAST_QUESTIONS_AN_HOUR } from "./forecast-callers";
import { v1Router } from "./routers/index";
import { HOURS_AHEAD, PLACES_AT_ONCE } from "./routers/places";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// The sea at a few places at once, for a phone's widgets, from what the instance keeps and from
// nothing it asks: decision 074.
describe.skipIf(!TEST_DATABASE_URL)("the sea at a few places", () => {
  const WEB = "https://app.example.org";
  const HOUR_MS = 60 * 60 * 1000;
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  // No test asks the forecast provider: a function stands for it, and counts what it is asked.
  const { forecasts, provider, seen } = testForecasts();
  const mundaka = { latitude: 43.4086, longitude: -2.6947 };
  const now = Date.now();
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
    // Their spots and their lists go with the accounts.
    await db.delete(user);
    await db.delete(station);
    await db.delete(surfBreak);
    await db.delete(providerCalls);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    await db.insert(surfBreak).values([
      {
        id: "mundaka",
        ...mundaka,
        slug: "mundaka",
        name: "Mundaka",
        // The forecast of the tests comes from 295° and 1.5 m high, with its wind from 90°.
        bestSwellDirections: ["NW"],
        waveSizeMeters: { min: 1, max: 3 },
        offshoreDirectionDegrees: 150,
        provider: "example",
        attribution: "Example list",
      },
      { id: "nowhere", slug: "nowhere", name: "Nowhere", latitude: 10, longitude: 10 },
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
        reportsWind: false,
        latestObservedAt: new Date(now - 30 * 60 * 1000),
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
        latestObservedAt: new Date(now - 10 * 60 * 1000),
        ...licensed,
      },
    ]);
    await db.insert(reading).values([
      {
        stationId: "buoy",
        observedAt: new Date(now - 30 * 60 * 1000),
        significantHeightM: 1.8,
        peakPeriodS: 12,
        peakDirectionDeg: 300,
      },
      {
        stationId: "windy",
        observedAt: new Date(now - 10 * 60 * 1000),
        windSpeedMs: 6,
        // Within 22.5° of Mundaka's offshore direction.
        windDirectionDeg: 160,
      },
    ]);
  });

  const visitor = (authorization: string | null = null) => {
    const context: Context = {
      db: database.db,
      session: null,
      authorization,
      site: WEB,
      adminSites: [],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-19T08:00:00Z"), webOrigin: WEB },
    };
    return { context };
  };
  const account = (id: string) => {
    const { context } = visitor();
    context.session = {
      user: { id, name: id, email: `${id}@example.org`, emailVerified: true },
      session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
    } as Session;
    return { context };
  };
  type Asked = { breakIds?: string[]; stationIds?: string[]; spotIds?: string[] };
  const seaNow = (input: Asked, by = visitor()) => call(v1Router.places.now, input, by);
  const keep = ({ latitude, longitude }: { latitude: number; longitude: number }) =>
    Effect.runPromise(forecasts.get({ latitude, longitude, days: 1 }));

  // Ana's spot by Mundaka, with words of her own, in a list she shares.
  async function sharedSpot() {
    const reef = await call(
      v1Router.spots.create,
      {
        name: "The reef",
        latitude: 43.41,
        longitude: -2.69,
        // Nothing like Mundaka's: the swell from the south, and the wind offshore from the west.
        characteristics: { bestSwellDirections: ["S"], offshoreDirectionDegrees: 270 },
      },
      account("ana"),
    );
    const list = await call(v1Router.lists.create, { name: "Winter" }, account("ana"));
    await call(v1Router.lists.addSpot, { id: list.id, spotId: reef.id }, account("ana"));
    const made = await call(v1Router.lists.share, { id: list.id }, account("ana"));
    return { reef, list, token: made.share!.token };
  }

  it("says the sea at a break, a station and a spot from the forecast kept, and asks the provider nothing", async () => {
    const { reef } = await sharedSpot();
    // Another question kept the forecast of each place's cell.
    for (const place of [mundaka, { latitude: 43.42, longitude: -2.72 }, reef]) await keep(place);
    const asked = { questions: provider.asked, spent: seen.spent };

    const answer = await seaNow(
      { breakIds: ["mundaka"], stationIds: ["windy"], spotIds: [reef.id] },
      account("ana"),
    );
    expect(provider.asked).toBe(asked.questions);
    expect(seen.spent).toBe(asked.spent);

    expect(answer.places.map(({ place }) => [place.kind, place.id])).toEqual([
      ["break", "mundaka"],
      ["station", "windy"],
      ["spot", reef.id],
    ]);
    const [atBreak, atStation, atSpot] = answer.places;

    // A break says where it was read, as the catalogue holds it.
    expect(atBreak?.place).toMatchObject({
      kind: "break",
      name: "Mundaka",
      source: { provider: "example", attribution: "Example list", license: null },
    });
    // The hours from the hour now to 48 hours after it, each with how its wind meets the shore.
    const hours = atBreak?.forecast?.hours ?? [];
    const thisHour = Math.floor(answer.at.getTime() / HOUR_MS) * HOUR_MS;
    expect(hours[0]?.time.getTime()).toBe(thisHour);
    expect(hours.at(-1)?.time.getTime()).toBe(thisHour + HOURS_AHEAD * HOUR_MS);
    expect(hours[0]).toEqual({
      time: new Date(thisHour),
      waveHeightMeters: 1.5,
      wavePeriodSeconds: 8,
      wavePeakPeriodSeconds: 11,
      waveDirectionDegrees: 295,
      windSpeedMetersPerSecond: 5,
      windGustMetersPerSecond: 8,
      windDirectionDegrees: 90,
      atShore: "cross_offshore",
    });
    expect(atBreak?.forecast).toMatchObject({ stale: false, fetchedAt: expect.any(Date) });
    expect(atBreak?.forecast?.source.attribution).toContain("Open-Meteo");
    // The hour now, laid against the break's own words: all of them fit.
    expect(atBreak?.forecast?.verdict).toEqual({ fits: ["swell", "size", "wind"], off: [] });
    // The buoy and the wind station that measured lately, each with its time and its licence.
    expect(atBreak?.waves).toMatchObject({
      id: "buoy",
      attribution: "Example network",
      license: { type: "test", url: "https://example.org/licence" },
      latestReading: { significantHeightMeters: 1.8, observedAt: new Date(now - 30 * 60 * 1000) },
    });
    expect(atBreak?.wind).toMatchObject({
      id: "windy",
      latestReading: { windSpeedMetersPerSecond: 6 },
      atShore: "offshore",
    });
    // The highs and the lows of the next two days, from a tide station with its licence.
    const tide = atBreak?.tide;
    expect(tide?.station.license.type).toEqual(expect.any(String));
    expect(tide?.extremes.length).toBeGreaterThanOrEqual(6);
    for (const extreme of tide?.extremes ?? []) {
      expect(extreme.time.getTime()).toBeGreaterThanOrEqual(answer.at.getTime());
      expect(extreme.time.getTime()).toBeLessThanOrEqual(
        answer.at.getTime() + HOURS_AHEAD * HOUR_MS,
      );
    }
    expect(tide?.now).toMatchObject({ trend: expect.stringMatching(/^(rising|falling)$/) });

    // A station names its network and its licence, is its own nearest while it measures, and
    // has no words to judge the hour by.
    expect(atStation?.place).toMatchObject({
      kind: "station",
      name: "Bermeo airfield",
      attribution: "Example network",
      license: { type: "test" },
    });
    expect(atStation?.wind).toMatchObject({ id: "windy", distanceKm: 0, atShore: null });
    expect(atStation?.forecast?.verdict).toBeNull();
    expect(atStation?.forecast?.hours[0]?.atShore).toBeNull();

    // A spot is judged by what its owner said of it, and by nothing of the break beside it.
    expect(atSpot?.place).toEqual({
      kind: "spot",
      id: reef.id,
      name: "The reef",
      latitude: 43.41,
      longitude: -2.69,
    });
    expect(atSpot?.forecast?.hours[0]?.atShore).toBe("onshore");
    expect(atSpot?.forecast?.verdict).toEqual({ fits: [], off: ["swell", "wind"] });
  });

  it("answers no forecast for a cell nobody asked for, and asks the provider nothing for it", async () => {
    const asked = { questions: provider.asked, spent: seen.spent };
    const answer = await seaNow({ breakIds: ["nowhere", "mundaka"] });
    expect(provider.asked).toBe(asked.questions);
    expect(seen.spent).toBe(asked.spent);

    const [far, near] = answer.places;
    expect(far).toMatchObject({
      place: { id: "nowhere" },
      forecast: null,
      waves: null,
      wind: null,
    });
    // What the buoy, the wind station and the tide say is answered all the same.
    expect(near?.waves?.id).toBe("buoy");
    expect(near?.wind?.id).toBe("windy");
    expect(near?.tide).not.toBeNull();
  });

  it("answers a spot to its owner, to an account that kept its list and to the list's link, and leaves it out for anyone else", async () => {
    const { reef, list, token } = await sharedSpot();
    const ids = (answer: Awaited<ReturnType<typeof seaNow>>) =>
      answer.places.map(({ place }) => place.id);
    const asking = { breakIds: ["mundaka"], spotIds: [reef.id] };

    expect(ids(await seaNow(asking, account("ana")))).toEqual(["mundaka", reef.id]);
    // Another account, and a visitor, read the break and not the spot, as if it were missing.
    expect(ids(await seaNow(asking, account("ben")))).toEqual(["mundaka"]);
    expect(ids(await seaNow(asking))).toEqual(["mundaka"]);
    // Whoever calls with the list's link reads it, as the list's link answers its spots.
    expect(ids(await seaNow(asking, visitor(`List ${token}`)))).toEqual(["mundaka", reef.id]);

    // An account that kept the list reads it until its owner stops sharing it.
    await call(v1Router.shared.join, { token }, account("ben"));
    expect(ids(await seaNow(asking, account("ben")))).toEqual(["mundaka", reef.id]);
    await call(v1Router.lists.unshare, { id: list.id }, account("ana"));
    expect(ids(await seaNow(asking, account("ben")))).toEqual(["mundaka"]);
    expect(ids(await seaNow({ spotIds: [reef.id, "gone"] }, account("ana")))).toEqual([reef.id]);
  });

  it("takes twelve places at most and one at least, each once, as lists or ids between commas", async () => {
    const twelve = Array.from({ length: PLACES_AT_ONCE }, (_, index) => `place-${index}`);
    expect(await seaNow({ breakIds: twelve.slice(0, 6), stationIds: twelve.slice(6) })).toEqual({
      at: expect.any(Date),
      places: [],
    });
    await expect(seaNow({ breakIds: twelve, spotIds: ["one-more"] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(seaNow({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(seaNow({ breakIds: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // As a query string writes them: one text, the commas between the ids.
    const answer = await seaNow({
      breakIds: "mundaka,nowhere,mundaka" as never,
      stationIds: "buoy" as never,
    });
    expect(answer.places.map(({ place }) => place.id)).toEqual(["mundaka", "nowhere", "buoy"]);
  });

  it("counts one forecast question of the caller's hour, however many places it names", async () => {
    const counted = async () => {
      const [row] = await database.db
        .select({ calls: providerCalls.calls })
        .from(providerCalls)
        .where(
          and(
            eq(providerCalls.provider, FORECAST_CALLERS),
            eq(providerCalls.bucket, "hour:session:ana"),
          ),
        );
      return row?.calls ?? 0;
    };
    await seaNow({ breakIds: ["mundaka", "nowhere"], stationIds: ["buoy"] }, account("ana"));
    expect(await counted()).toBe(1);

    // At the hour's limit, the call is refused, with how long to wait.
    await database.db
      .update(providerCalls)
      .set({ calls: FORECAST_QUESTIONS_AN_HOUR.session })
      .where(eq(providerCalls.bucket, "hour:session:ana"));
    const by = account("ana");
    await expect(seaNow({ breakIds: ["mundaka"] }, by)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(by.context.reply.retryAfterSeconds).toBeGreaterThan(0);
    // Another account has its own hour.
    expect((await seaNow({ breakIds: ["mundaka"] }, account("ben"))).places).toHaveLength(1);
  });
});
