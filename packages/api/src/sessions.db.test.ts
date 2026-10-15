import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { surfSession } from "@repo/db/schema/sessions";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { forgetPastReads } from "./sessions";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// An account's log of its sessions: decision 043.
describe.skipIf(!TEST_DATABASE_URL)("an account's log of its sessions", () => {
  const WEB = "https://app.example.org";
  // A Saturday at noon, UTC.
  const AT = new Date("2026-10-10T12:00:00Z");
  // A point of the Breton coast, near enough a tide station.
  const POINT = { latitude: 47.84, longitude: -4.35 };
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let kept: ReturnType<typeof testForecasts>;

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
    forgetPastReads();
    const { db } = database;
    await db.delete(user);
    await db.delete(surfBreak);
    await db.delete(station);
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org" },
      { id: "ben", name: "Ben", email: "ben@example.org" },
    ]);
    await db.insert(surfBreak).values([
      { id: "point", slug: "point", name: "The point", ...POINT, offshoreDirectionDegrees: 90 },
      { id: "inland", slug: "inland", name: "A lake", latitude: 45.76, longitude: 4.83 },
    ]);
    await db.insert(spot).values([
      { id: "left", userId: "ana", name: "My left", ...POINT, breakId: "point" },
      {
        id: "faced",
        userId: "ana",
        name: "Faced",
        ...POINT,
        characteristics: { offshoreDirectionDegrees: 45 },
      },
      { id: "bens", userId: "ben", name: "Ben's", ...POINT },
    ]);
    const stationOf = (id: string, at: { latitude: number; longitude: number }) => ({
      id,
      provider: "test",
      providerStationId: id,
      name: `Station ${id}`,
      ...at,
      licenseType: "test",
      licenseUrl: "https://example.org/licence",
      attribution: "Test network",
    });
    await db.insert(station).values([
      // Thirty kilometres out: near enough for the waves, too far for the wind.
      { ...stationOf("buoy", { latitude: 47.84, longitude: -4.75 }), reportsWaves: true },
      // Nearer, and known to be sheltered: it does not speak for the open sea.
      {
        ...stationOf("harbour", { latitude: 47.85, longitude: -4.36 }),
        reportsWaves: true,
        exposure: "sheltered" as const,
      },
      { ...stationOf("mast", { latitude: 47.8, longitude: -4.37 }), reportsWind: true },
    ]);
    await db.insert(reading).values([
      {
        stationId: "buoy",
        observedAt: new Date("2026-10-10T09:30:00Z"),
        significantHeightM: 1.8,
        peakPeriodS: 13,
        peakDirectionDeg: 280,
        waterTemperatureC: 15.5,
      },
      // The day before: no part of the session.
      { stationId: "buoy", observedAt: new Date("2026-10-09T09:30:00Z"), significantHeightM: 3 },
      {
        stationId: "harbour",
        observedAt: new Date("2026-10-10T09:30:00Z"),
        significantHeightM: 0.2,
      },
      {
        stationId: "mast",
        observedAt: new Date("2026-10-10T09:42:00Z"),
        windSpeedMs: 6,
        windGustMs: 9,
        windDirectionDeg: 80,
      },
    ]);
  });

  const by = (id: string) => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
        session: { id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: WEB,
      adminSites: [],
      usage,
      forecasts: kept.forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-10T08:00:00Z"), webOrigin: WEB },
    };
    return { context };
  };
  const refusal = (code: string) =>
    expect.objectContaining({ code }) as unknown as ORPCError<string, unknown>;
  // A session of an hour and a half, that morning.
  const morning = { startedAt: new Date("2026-10-10T09:00:00Z"), durationMinutes: 90 };

  it("keeps a session at a break with everything the sea did while it lasted", async () => {
    const made = await call(
      v1Router.sessions.create,
      { breakId: "point", ...morning, rating: 4, note: "  Glassy until ten.\nTwo of us out.  " },
      by("ana"),
    );

    expect(made).toMatchObject({
      place: { name: "The point", ...POINT, breakId: "point", spotId: null },
      startedAt: morning.startedAt,
      durationMinutes: 90,
      rating: 4,
      note: "Glassy until ten.\nTwo of us out.",
      modelMissing: null,
      conditionsTakenAt: AT,
    });
    // The hours from the one the session began in to the one it ended in.
    expect(made.conditions?.model?.hours.map((hour) => hour.time)).toEqual([
      "2026-10-10T09:00:00.000Z",
      "2026-10-10T10:00:00.000Z",
    ]);
    expect(made.conditions?.model).toMatchObject({
      waveModels: ["ecmwf_wam"],
      swellModels: ["mfwam"],
    });
    // The buoy the sea reaches freely, not the nearer one in its harbour, and the readings of
    // the session alone.
    expect(made.conditions?.buoy).toMatchObject({
      stationId: "buoy",
      attribution: "Test network",
      readings: [{ observedAt: "2026-10-10T09:30:00.000Z", significantHeightMeters: 1.8 }],
    });
    expect(made.conditions?.buoy?.distanceKm).toBeGreaterThan(25);
    expect(made.conditions?.wind).toMatchObject({ stationId: "mast", readings: [{}] });
    expect(made.conditions?.tide?.heights.length).toBeGreaterThan(5);
    expect(made.conditions?.offshoreDirectionDegrees).toBe(90);
    expect(made.figures).toMatchObject({
      waveHeightMeters: 1.5,
      wavePeakPeriodSeconds: 11,
      waveDirectionDegrees: 295,
      primarySwellHeightMeters: 1.2,
      windSpeedMetersPerSecond: 5,
      windDirectionDegrees: 90,
      // The model's wind comes from where the shore faces away.
      shoreWind: "offshore",
      buoy: { name: "Station buoy", significantHeightMeters: 1.8, waterTemperatureCelsius: 15.5 },
      measuredWind: { name: "Station mast", speedMetersPerSecond: 6 },
    });
    expect(made.figures.tideHeightMeters).not.toBeNull();
    expect(made.figures.tideTrend).not.toBeNull();
    // The forecast in force answered: nothing was asked for the past.
    expect(kept.provider).toMatchObject({ asked: 1, past: [] });

    expect(await call(v1Router.sessions.get, { id: made.id }, by("ana"))).toEqual(made);
  });

  it("keeps a session at a spot of the account's own, facing the way the spot or its break says", async () => {
    const atSpot = await call(v1Router.sessions.create, { spotId: "left", ...morning }, by("ana"));
    expect(atSpot).toMatchObject({
      place: { name: "My left", breakId: null, spotId: "left" },
      rating: null,
      note: null,
    });
    // The spot says nothing of its shore: the break it was made from does.
    expect(atSpot.conditions?.offshoreDirectionDegrees).toBe(90);

    const faced = await call(v1Router.sessions.create, { spotId: "faced", ...morning }, by("ana"));
    expect(faced.conditions?.offshoreDirectionDegrees).toBe(45);
    expect(faced.figures.shoreWind).toBe("cross_offshore");
  });

  it("refuses a place that is none, another's spot, two places, and a session that has not begun", async () => {
    const create = (input: Record<string, unknown>) =>
      call(v1Router.sessions.create, input as never, by("ana"));

    await expect(create({ breakId: "nowhere", ...morning })).rejects.toThrow(refusal("NOT_FOUND"));
    await expect(create({ spotId: "bens", ...morning })).rejects.toThrow(refusal("NOT_FOUND"));
    await expect(create({ ...morning })).rejects.toThrow(refusal("BAD_REQUEST"));
    await expect(create({ breakId: "point", spotId: "left", ...morning })).rejects.toThrow(
      refusal("BAD_REQUEST"),
    );
    await expect(
      create({ breakId: "point", ...morning, startedAt: new Date("2026-10-10T13:00:00Z") }),
    ).rejects.toThrow(refusal("BAD_REQUEST"));
    // A rating is stars, by halves: from half a star to five.
    for (const rating of [6, 0, 4.3]) {
      await expect(create({ breakId: "point", ...morning, rating })).rejects.toThrow(
        refusal("BAD_REQUEST"),
      );
    }
    await expect(create({ breakId: "point", ...morning, durationMinutes: 5 })).rejects.toThrow(
      refusal("BAD_REQUEST"),
    );
    expect(await database.db.$count(surfSession)).toBe(0);
    // A session that begins now, or that a clock a little ahead says begins in a moment.
    await create({ breakId: "point", startedAt: new Date("2026-10-10T12:10:00Z") });
    expect(await database.db.$count(surfSession)).toBe(1);
  });

  it("asks the provider for the days of a session written later, and keeps what it gave", async () => {
    const made = await call(
      v1Router.sessions.create,
      { breakId: "point", startedAt: new Date("2026-09-20T07:30:00Z"), durationMinutes: 120 },
      by("ana"),
    );

    expect(kept.provider.past).toEqual([{ start: "2026-09-20", end: "2026-09-20" }]);
    expect(made.conditions?.model?.hours.map((hour) => hour.time)).toEqual([
      "2026-09-20T07:00:00.000Z",
      "2026-09-20T08:00:00.000Z",
      "2026-09-20T09:00:00.000Z",
    ]);
    // The provider's own models: the whole sea, and no swell apart.
    expect(made.figures).toMatchObject({ waveHeightMeters: 1.5, primarySwellHeightMeters: null });
    // The tide is computed for any day, and the stations kept nothing of that one.
    expect(made.conditions?.tide).not.toBeNull();
    expect(made.conditions).toMatchObject({ buoy: null, wind: null, modelMissing: null });
  });

  it("writes a session whatever the models do, and says why they gave nothing", async () => {
    // Further back than the provider answers: nothing is asked.
    const old = await call(
      v1Router.sessions.create,
      { breakId: "point", startedAt: new Date("2025-08-02T07:30:00Z") },
      by("ana"),
    );
    expect(old).toMatchObject({ modelMissing: "too_old", conditions: { model: null } });
    expect(old.conditions?.tide).not.toBeNull();
    expect(kept.provider.past).toEqual([]);

    // Inland: the models have no sea there, and no tide station is near.
    kept.provider.waves = () => null;
    const lake = await call(v1Router.sessions.create, { breakId: "inland", ...morning }, by("ana"));
    kept.provider.waves = () => 1.5;
    expect(lake).toMatchObject({ modelMissing: "no_sea", conditions: { model: null, tide: null } });
    expect(lake.figures).toMatchObject({ waveHeightMeters: null, tideHeightMeters: null });

    // The budget is spent: the session is written, and its conditions wait.
    kept.limit(kept.seen.spent);
    const waiting = await call(
      v1Router.sessions.create,
      { breakId: "point", startedAt: new Date("2026-09-20T07:30:00Z") },
      by("ana"),
    );
    expect(waiting).toMatchObject({ modelMissing: "unavailable", rating: null });

    // Sent again as it is once the provider may be asked, it reads them.
    kept.limit(Infinity);
    const read = await call(v1Router.sessions.update, { id: waiting.id }, by("ana"));
    expect(read).toMatchObject({ modelMissing: null, figures: { waveHeightMeters: 1.5 } });
  });

  it("lets an account have the past read so many times an hour, and no more", async () => {
    const old = { breakId: "point", startedAt: new Date("2026-09-20T07:30:00Z") };
    for (let index = 0; index < 20; index += 1) {
      await call(v1Router.sessions.create, old, by("ana"));
    }
    expect(kept.provider.past).toHaveLength(20);

    const refused = await call(v1Router.sessions.create, old, by("ana"));
    expect(refused).toMatchObject({ modelMissing: "unavailable" });
    expect(kept.provider.past).toHaveLength(20);
    // Another account is counted apart, and a session about now costs nothing.
    expect(await call(v1Router.sessions.create, old, by("ben"))).toMatchObject({
      modelMissing: null,
    });
    expect(
      await call(v1Router.sessions.create, { breakId: "point", ...morning }, by("ana")),
    ).toMatchObject({ modelMissing: null });

    // An hour on, the account's past is read again.
    vi.setSystemTime(new Date(AT.getTime() + 61 * 60 * 1000));
    expect(await call(v1Router.sessions.update, { id: refused.id }, by("ana"))).toMatchObject({
      modelMissing: null,
    });
  });

  it("changes a rating and a note without reading the sea again, and reads it when the session moves", async () => {
    const made = await call(v1Router.sessions.create, { breakId: "point", ...morning }, by("ana"));
    vi.setSystemTime(new Date("2026-10-10T18:00:00Z"));

    const rated = await call(
      v1Router.sessions.update,
      { id: made.id, rating: 4.5, note: "The best of the autumn." },
      by("ana"),
    );
    expect(rated).toMatchObject({ rating: 4.5, note: "The best of the autumn." });
    // The conditions are those of the morning, read at noon.
    expect(rated.conditionsTakenAt).toEqual(AT);
    expect(rated.conditions).toEqual(made.conditions);

    const cleared = await call(
      v1Router.sessions.update,
      { id: made.id, rating: null, note: null },
      by("ana"),
    );
    expect(cleared).toMatchObject({ rating: null, note: null });

    const moved = await call(
      v1Router.sessions.update,
      { id: made.id, startedAt: new Date("2026-10-10T14:00:00Z"), durationMinutes: 60 },
      by("ana"),
    );
    expect(moved.conditionsTakenAt).toEqual(new Date("2026-10-10T18:00:00Z"));
    expect(moved.conditions?.model?.hours.map((hour) => hour.time)).toEqual([
      "2026-10-10T14:00:00.000Z",
      "2026-10-10T15:00:00.000Z",
    ]);
    // No station measured anything that afternoon, and the shore faces as it was said to.
    expect(moved.conditions).toMatchObject({ buoy: null, offshoreDirectionDegrees: 90 });

    await expect(
      call(
        v1Router.sessions.update,
        { id: made.id, startedAt: new Date("2026-10-11T09:00:00Z") },
        by("ana"),
      ),
    ).rejects.toThrow(refusal("BAD_REQUEST"));
  });

  it("keeps how big the waves and the sets looked, never the sets smaller", async () => {
    const made = await call(
      v1Router.sessions.create,
      { breakId: "point", ...morning, waveSize: "chest", setSize: "overhead" },
      by("ana"),
    );
    expect(made).toMatchObject({ waveSize: "chest", setSize: "overhead" });
    await expect(
      call(
        v1Router.sessions.create,
        { breakId: "point", ...morning, waveSize: "head", setSize: "waist" },
        by("ana"),
      ),
    ).rejects.toThrow(refusal("BAD_REQUEST"));
    await expect(
      call(
        v1Router.sessions.create,
        { breakId: "point", ...morning, waveSize: "huge" } as never,
        by("ana"),
      ),
    ).rejects.toThrow(refusal("BAD_REQUEST"));

    // The sets are held to the waves as the session stands once it is changed.
    await expect(
      call(v1Router.sessions.update, { id: made.id, waveSize: "double_overhead" }, by("ana")),
    ).rejects.toThrow(refusal("BAD_REQUEST"));
    const bigger = await call(
      v1Router.sessions.update,
      { id: made.id, waveSize: "double_overhead", setSize: "triple_overhead" },
      by("ana"),
    );
    expect(bigger).toMatchObject({ waveSize: "double_overhead", setSize: "triple_overhead" });
    // A size alone is taken, and a size taken away is unsaid.
    const unsaid = await call(v1Router.sessions.update, { id: made.id, setSize: null }, by("ana"));
    expect(unsaid).toMatchObject({ waveSize: "double_overhead", setSize: null });
  });

  it("is the account's alone", async () => {
    const made = await call(v1Router.sessions.create, { breakId: "point", ...morning }, by("ana"));

    expect(await call(v1Router.sessions.list, {}, by("ben"))).toEqual({ sessions: [], next: null });
    await expect(call(v1Router.sessions.get, { id: made.id }, by("ben"))).rejects.toThrow(
      refusal("NOT_FOUND"),
    );
    await expect(
      call(v1Router.sessions.update, { id: made.id, rating: 1 }, by("ben")),
    ).rejects.toThrow(refusal("NOT_FOUND"));
    await expect(call(v1Router.sessions.delete, { id: made.id }, by("ben"))).rejects.toThrow(
      refusal("NOT_FOUND"),
    );

    expect(await call(v1Router.sessions.delete, { id: made.id }, by("ana"))).toEqual({
      id: made.id,
    });
    await expect(call(v1Router.sessions.get, { id: made.id }, by("ana"))).rejects.toThrow(
      refusal("NOT_FOUND"),
    );
  });

  it("lists the sessions the latest first, all of them or those of a place, page by page", async () => {
    const at = (hour: number) => new Date(`2026-10-10T${String(hour).padStart(2, "0")}:00:00Z`);
    const first = await call(
      v1Router.sessions.create,
      { breakId: "point", startedAt: at(6), durationMinutes: 60 },
      by("ana"),
    );
    const second = await call(
      v1Router.sessions.create,
      { spotId: "left", startedAt: at(8), durationMinutes: 60 },
      by("ana"),
    );
    const third = await call(
      v1Router.sessions.create,
      { breakId: "point", startedAt: at(10), durationMinutes: 60 },
      by("ana"),
    );
    const ids = (answer: { sessions: { id: string }[] }) => answer.sessions.map((one) => one.id);

    const all = await call(v1Router.sessions.list, {}, by("ana"));
    expect(ids(all)).toEqual([third.id, second.id, first.id]);
    expect(all.next).toBeNull();
    // A line of the log has the figures, and not what they were read from.
    expect(all.sessions[0]).toMatchObject({ figures: { waveHeightMeters: 1.5 } });
    expect(all.sessions[0]).not.toHaveProperty("conditions");

    expect(ids(await call(v1Router.sessions.list, { breakId: "point" }, by("ana")))).toEqual([
      third.id,
      first.id,
    ]);
    expect(ids(await call(v1Router.sessions.list, { spotId: "left" }, by("ana")))).toEqual([
      second.id,
    ]);

    const page = await call(v1Router.sessions.list, { limit: 2 }, by("ana"));
    expect(ids(page)).toEqual([third.id, second.id]);
    expect(page.next).toEqual(at(8));
    const rest = await call(v1Router.sessions.list, { limit: 2, before: at(8) }, by("ana"));
    expect(rest).toMatchObject({ sessions: [{ id: first.id }], next: null });
  });

  it("outlives its place, and goes with its account", async () => {
    const atSpot = await call(v1Router.sessions.create, { spotId: "left", ...morning }, by("ana"));
    const atBreak = await call(
      v1Router.sessions.create,
      { breakId: "point", ...morning },
      by("ana"),
    );
    const { db } = database;

    await db.delete(spot).where(eq(spot.id, "left"));
    await db.delete(surfBreak).where(eq(surfBreak.id, "point"));
    expect(await call(v1Router.sessions.get, { id: atSpot.id }, by("ana"))).toMatchObject({
      place: { name: "My left", ...POINT, spotId: null, breakId: null },
      figures: { waveHeightMeters: 1.5 },
    });
    expect(await call(v1Router.sessions.get, { id: atBreak.id }, by("ana"))).toMatchObject({
      place: { name: "The point", breakId: null },
    });

    await db.delete(user).where(eq(user.id, "ana"));
    expect(await db.$count(surfSession)).toBe(0);
  });

  it("says what the log comes to: in all, this year, this month, and place by place", async () => {
    // The database counts the year and the month on its own clock, which no test sets.
    vi.useRealTimers();
    kept = testForecasts();
    const now = new Date();
    const longAgo = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);

    expect(await call(v1Router.sessions.recap, {}, by("ana"))).toEqual({
      total: { count: 0, minutes: 0 },
      year: { count: 0, minutes: 0 },
      month: { count: 0, minutes: 0 },
      placeCount: 0,
      places: [],
    });

    const create = (input: {
      breakId?: string;
      spotId?: string;
      startedAt: Date;
      durationMinutes: number;
      rating?: number;
    }) => call(v1Router.sessions.create, input, by("ana"));
    await create({ breakId: "point", startedAt: now, durationMinutes: 60, rating: 4.5 });
    await create({ breakId: "point", startedAt: longAgo, durationMinutes: 120, rating: 3.5 });
    await create({ breakId: "point", startedAt: longAgo, durationMinutes: 30 });
    await create({ spotId: "left", startedAt: now, durationMinutes: 90 });
    await call(
      v1Router.sessions.create,
      { breakId: "point", startedAt: now, durationMinutes: 45 },
      by("ben"),
    );

    const recap = await call(v1Router.sessions.recap, { zone: "Europe/Paris" }, by("ana"));
    expect(recap).toMatchObject({
      total: { count: 4, minutes: 300 },
      month: { count: 2, minutes: 150 },
      placeCount: 2,
      places: [
        // Rated four and a half and three and a half stars, and once not at all.
        {
          name: "The point",
          breakId: "point",
          spotId: null,
          count: 3,
          minutes: 210,
          averageRating: 4,
        },
        {
          name: "My left",
          breakId: null,
          spotId: "left",
          count: 1,
          minutes: 90,
          averageRating: null,
        },
      ],
    });
    expect(recap.places[0]?.lastAt).toEqual(now);

    await expect(
      call(v1Router.sessions.recap, { zone: "Mars/Olympus" }, by("ana")),
    ).rejects.toThrow(refusal("BAD_REQUEST"));
  });
});
