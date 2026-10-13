import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { ForecastFormatError } from "@repo/conditions/forecasts/open-meteo";
import { providerDown, testForecasts } from "@repo/conditions/forecasts/testing";
import { user } from "@repo/db/schema/auth";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { testPlaces, testVerification } from "./testing";
import { v1Router } from "./routers/index";
import { createUsage, type Usage } from "./usage";

// A forecast as a caller gets it: decision 023. The provider is a function, the store a memory.
describe.skipIf(!TEST_DATABASE_URL)("a forecast, as the API gives it", () => {
  const AT = new Date("2026-10-09T08:00:00Z");
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let kept: ReturnType<typeof testForecasts>;

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
    await database.db.insert(user).values({ id: "owner", name: "Owner", email: "o@example.org" });
    await database.db.insert(spot).values({
      id: "home",
      userId: "owner",
      name: "Home",
      latitude: 43.63,
      longitude: -1.46,
      visibility: "private",
    });
  });
  afterAll(() => database?.drop());
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(AT);
    kept = testForecasts();
  });

  const context = (): { context: Context } => ({
    context: {
      db: database.db,
      session: {
        user: { id: "owner", name: "Owner", email: "o@example.org" },
        session: { id: "s", userId: "owner", token: "t", expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: "https://app.example.org",
      adminSites: ["https://admin.example.org"],
      usage,
      server: { startedAt: AT, webOrigin: "https://app.example.org" },
      forecasts: kept.forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
    },
  });
  const here = { latitude: 43.63, longitude: -1.46 };
  const forecast = (input: Record<string, number> = {}) =>
    call(v1Router.forecasts.get, { ...here, ...input }, context());
  // What conditions would give at the spot, which an alert's editor asks for.
  const conditions = (input: Record<string, number> = {}) =>
    call(
      v1Router.alerts.preview,
      { spotIds: ["home"], criteria: { waveHeightMeters: { min: 1 } }, ...input },
      context(),
    );
  const refusal = async (asked: Promise<unknown>) => {
    const error = await asked.then(
      () => null,
      (thrown: unknown) => thrown,
    );
    if (!(error instanceof ORPCError)) throw new Error("answered, or failed some other way");
    return { code: error.code, message: error.message };
  };

  it("says when it was fetched, that it is fresh, and whom to credit", async () => {
    const found = await forecast({ days: 2, pastDays: 1 });

    expect(found).toMatchObject({
      point: { latitude: 43.625, longitude: -1.4583 },
      fetchedAt: AT,
      stale: false,
    });
    expect(found.hours).toHaveLength(3 * 24);
    expect(found.hours[0]?.time).toEqual(new Date("2026-10-08T00:00:00Z"));
    expect(found.source.attribution).toContain("Open-Meteo");
    // The producer of the model that answered, and the model itself.
    expect(found.source.attribution).toContain("ECMWF");
    expect(found.waveModels).toEqual([
      {
        name: "ECMWF WAM",
        producer: "ECMWF",
        resolutionKilometers: 9,
        from: new Date("2026-10-08T00:00:00Z"),
      },
    ]);
    expect(found.hours[0]).toMatchObject({ wavePeriodSeconds: 8, wavePeakPeriodSeconds: 11 });
  });

  describe("over a period and at a spacing of the caller's own", () => {
    const asked = (input: Record<string, unknown>) =>
      call(v1Router.forecasts.get, { ...here, ...input } as never, context());
    const times = (found: { hours: { time: Date }[] }) =>
      found.hours.map(({ time }) => time.toISOString().slice(8, 16));

    it("answers the hours of the period alone, in place of whole days", async () => {
      const found = await asked({ start: "2026-10-10T06:00:00Z", end: "2026-10-10T20:00:00Z" });
      expect(found.hours).toHaveLength(14);
      expect(times(found).at(0)).toBe("10T06:00");
      expect(times(found).at(-1)).toBe("10T19:00");
    });

    it("answers one hour in so many, from the first one", async () => {
      expect(times(await asked({ days: 1, stepHours: 6 }))).toEqual([
        "09T00:00",
        "09T06:00",
        "09T12:00",
        "09T18:00",
      ]);
      expect(
        times(
          await asked({
            start: "2026-10-10T06:00:00Z",
            end: "2026-10-10T20:00:00Z",
            stepHours: 3,
          }),
        ),
      ).toEqual(["10T06:00", "10T09:00", "10T12:00", "10T15:00", "10T18:00"]);
    });

    it("reaches as far back and as far ahead as a forecast does, and no further", async () => {
      const whole = await asked({ start: "2026-10-07T00:00:00Z", end: "2026-10-16T00:00:00Z" });
      expect(whole.hours).toHaveLength(9 * 24);

      expect(
        await refusal(asked({ start: "2026-10-06T23:00:00Z", end: "2026-10-09T00:00:00Z" })),
      ).toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("2 days before") });
      expect(
        await refusal(asked({ start: "2026-10-09T00:00:00Z", end: "2026-10-16T01:00:00Z" })),
      ).toMatchObject({ code: "BAD_REQUEST" });
    });

    it("takes a start with its end, and an end after its start", async () => {
      expect(await refusal(asked({ start: "2026-10-10T06:00:00Z" }))).toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(
        await refusal(asked({ start: "2026-10-10T06:00:00Z", end: "2026-10-10T06:00:00Z" })),
      ).toMatchObject({ code: "BAD_REQUEST" });
      expect(await refusal(asked({ days: 1, stepHours: 13 }))).toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });

  it("gives the swell apart beside the whole sea, with the model it comes from", async () => {
    const found = await forecast({ days: 1 });

    expect(found.hours[0]).toMatchObject({
      waveHeightMeters: 1.5,
      primarySwellHeightMeters: 1.2,
      primarySwellDirectionDegrees: 290,
    });
    expect(found.swellModels).toEqual([
      {
        name: "MFWAM",
        producer: "Météo-France",
        resolutionKilometers: 9,
        from: new Date("2026-10-09T00:00:00Z"),
      },
    ]);
    // Both producers are credited.
    const credited = found.source.credits.map((credit) => credit.text).join(" ");
    expect(credited).toContain("ECMWF");
    expect(credited).toContain("Météo-France");
  });

  it("holds an alert's hours to what it asks of the swell apart, not of the whole sea", async () => {
    const asking = (criteria: object) =>
      call(v1Router.alerts.preview, { spotIds: ["home"], criteria, days: 1 }, context());
    // The whole sea is 1.5 m, and the swell in it 1.2 m from 290°.
    const met = await asking({ primarySwellHeightMeters: { min: 1 } });
    const tooSmall = await asking({ primarySwellHeightMeters: { min: 1.4 } });
    const elsewhere = await asking({ primarySwellDirectionDegrees: { from: 180, to: 250 } });

    expect(met.spots[0]?.hours[0]).toMatchObject({
      waveHeightMeters: 1.5,
      primarySwellHeightMeters: 1.2,
      primarySwellDirectionDegrees: 290,
      unmet: [],
    });
    expect(tooSmall.spots[0]?.hours[0]?.unmet).toEqual(["primarySwellHeightMeters"]);
    expect(elsewhere.spots[0]?.hours[0]?.unmet).toEqual(["primarySwellDirectionDegrees"]);
    expect(tooSmall.spots[0]?.windows).toEqual([]);
  });

  it("gives an older forecast when the provider cannot be asked, and says so", async () => {
    await forecast();
    vi.advanceTimersByTime(5 * 3600 * 1000);
    kept.provider.fails = providerDown;
    const said = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await forecast()).toMatchObject({ fetchedAt: AT, stale: true });
    expect((await conditions()).spots[0]).toMatchObject({
      forecastFetchedAt: AT,
      forecastStale: true,
    });
    said.mockRestore();
  });

  it("gives a spot's conditions with the forecast's own moment", async () => {
    const found = await conditions({ days: 1 });

    expect(found.spots[0]).toMatchObject({ forecastFetchedAt: AT, forecastStale: false });
    expect(found.spots[0]?.hours).toHaveLength(24);
    expect(found.forecastSource.attribution).toContain("ECMWF");
    // One fetch answered both the point and the spot, which are in one cell.
    await forecast();
    expect(kept.provider.asked).toBe(1);
  });

  it("answers 404 for a point with no sea, and 503 when no forecast can be had", async () => {
    kept.provider.waves = () => null;
    expect(await refusal(forecast())).toMatchObject({ code: "NOT_FOUND" });
    expect(await refusal(conditions())).toMatchObject({ code: "NOT_FOUND" });
    // An older forecast that shows no sea is no sea all the same.
    vi.advanceTimersByTime(5 * 3600 * 1000);
    kept.provider.fails = providerDown;
    expect(await refusal(forecast())).toMatchObject({ code: "NOT_FOUND" });

    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    kept = testForecasts();
    kept.provider.fails = providerDown;
    expect(await refusal(forecast())).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "The forecast provider did not answer. Try again in a moment.",
    });
    kept = testForecasts();
    kept.provider.fails = () => new ForecastFormatError({ message: "changed" });
    expect(await refusal(conditions())).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(said).toHaveBeenCalled();
    said.mockRestore();
  });

  it("says that the instance has asked all it may, when its budget is spent", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    kept.limit(0);

    const refused = await refusal(forecast());
    expect(refused.code).toBe("SERVICE_UNAVAILABLE");
    expect(refused.message).toContain("has asked its forecast provider all it may");
    expect((await refusal(conditions())).message).toContain("all it may");
    // Nothing was sent, and nothing is in the log: the instance did what it was built to do.
    expect(kept.provider.asked).toBe(0);
    expect(said).not.toHaveBeenCalled();
    said.mockRestore();
  });

  it("takes seven days and two past days at most", async () => {
    expect((await forecast({ days: 7, pastDays: 2 })).hours).toHaveLength(9 * 24);
    expect(await refusal(forecast({ days: 8 }))).toMatchObject({ code: "BAD_REQUEST" });
    expect(await refusal(forecast({ pastDays: 3 }))).toMatchObject({ code: "BAD_REQUEST" });
    expect(await refusal(conditions({ days: 8 }))).toMatchObject({ code: "BAD_REQUEST" });
  });
});
