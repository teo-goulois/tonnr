import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { ForecastFormatError } from "@repo/conditions/forecasts/open-meteo";
import { providerDown, testForecasts } from "@repo/conditions/forecasts/testing";
import { user } from "@repo/db/schema/auth";
import { spot } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
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
      criteria: { swellHeightMeters: { min: 1 } },
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
    },
  });
  const here = { latitude: 43.63, longitude: -1.46 };
  const forecast = (input: Record<string, number> = {}) =>
    call(v1Router.forecasts.get, { ...here, ...input }, context());
  const conditions = (input: Record<string, number> = {}) =>
    call(v1Router.spots.conditions, { id: "home", ...input }, context());
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
    expect(found.source.attribution).toContain("DWD");
  });

  it("gives an older forecast when the provider cannot be asked, and says so", async () => {
    await forecast();
    vi.advanceTimersByTime(5 * 3600 * 1000);
    kept.provider.fails = providerDown;
    const said = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await forecast()).toMatchObject({ fetchedAt: AT, stale: true });
    expect(await conditions()).toMatchObject({ forecastFetchedAt: AT, forecastStale: true });
    said.mockRestore();
  });

  it("gives a spot's conditions with the forecast's own moment", async () => {
    const found = await conditions({ days: 1 });

    expect(found).toMatchObject({ forecastFetchedAt: AT, forecastStale: false });
    expect(found.hours).toHaveLength(24);
    expect(found.forecastSource.attribution).toContain("DWD");
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
