import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// One wind station for each place on a map: decision 048.
describe.skipIf(!TEST_DATABASE_URL)("the wind stations of a map", () => {
  const WEB = "https://app.example.org";
  const AT = new Date("2026-10-14T14:00:00Z");
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;

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
    const { db } = database;
    await db.delete(user);
    await db.delete(station);
    await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.org" });

    const stationOf = (id: string, provider: string, latitude: number) => ({
      id,
      provider,
      providerStationId: id,
      name: `Station ${id}`,
      latitude,
      longitude: -1.56,
      licenseType: "test",
      licenseUrl: "https://example.org/licence",
      attribution: "Test network",
      reportsWind: true,
      latestObservedAt: new Date("2026-10-14T13:50:00Z"),
    });
    await db.insert(station).values([
      // Three at one harbour, within a kilometre of each other.
      stationOf("beacon", "openwindmap", 43.47),
      stationOf("official", "meteofrance", 43.475),
      stationOf("hourly", "ndbc", 43.479),
      // Ten kilometres north, alone.
      stationOf("north", "openwindmap", 43.56),
    ]);
    await db.insert(reading).values(
      ["beacon", "official", "hourly", "north"].map((stationId) => ({
        stationId,
        observedAt: new Date("2026-10-14T13:50:00Z"),
        windSpeedMs: 6,
        windGustMs: stationId === "beacon" ? null : 9,
      })),
    );
  });

  const context = (): { context: Context } => ({
    context: {
      db: database.db,
      session: {
        user: { id: "ana", name: "ana", email: "ana@example.org", emailVerified: false },
        session: { id: "s-ana", userId: "ana", token: "t-ana", expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: WEB,
      adminSites: [],
      usage,
      forecasts: testForecasts().forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date("2026-10-14T08:00:00Z"), webOrigin: WEB },
    },
  });
  const ids = async (input: { measures: "wind"; places?: "all" | "one"; limit?: number }) =>
    (await call(v1Router.stations.list, input, context())).stations.map((one) => one.id);

  it("gives every station unless asked for one by place", async () => {
    expect(await ids({ measures: "wind" })).toEqual(["beacon", "hourly", "north", "official"]);
  });

  it("keeps the station that speaks best for each place", async () => {
    expect(await ids({ measures: "wind", places: "one" })).toEqual(["north", "official"]);
  });

  it("gives the place to a neighbour once the station kept stops measuring", async () => {
    vi.setSystemTime(new Date("2026-10-14T14:30:00Z"));
    await database.db
      .update(station)
      .set({ latestObservedAt: new Date("2026-10-14T10:00:00Z") })
      .where(eq(station.id, "official"));
    await database.db
      .update(reading)
      .set({ observedAt: new Date("2026-10-14T10:00:00Z") })
      .where(eq(reading.stationId, "official"));

    expect(await ids({ measures: "wind", places: "one" })).toEqual(["hourly", "north"]);
  });

  it("keeps to the limit after one station was chosen for each place", async () => {
    expect(await ids({ measures: "wind", places: "one", limit: 1 })).toEqual(["north"]);
  });
});
