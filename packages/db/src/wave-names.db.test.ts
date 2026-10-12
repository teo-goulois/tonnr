import { readFileSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { alert, alertSpot, alertWindow, notification } from "./schema/alerts";
import { user } from "./schema/auth";
import { spot } from "./schema/spots";
import { createTestDatabase, migrationsFolder, TEST_DATABASE_URL } from "./testing";

// The migration that names the whole sea `wave…` where it was saved as `swell…`: decision 038.
const statements = readFileSync(
  path.join(migrationsFolder, "20261012092749_wave-names", "migration.sql"),
  "utf8",
).split("--> statement-breakpoint");

describe.skipIf(!TEST_DATABASE_URL)("the migration of the sea's names", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const START = new Date("2026-10-12T06:00:00Z");
  // What was saved before: the whole sea under the names of a swell.
  const before = {
    criteria: {
      swellHeightMeters: { min: 1, max: 2.5 },
      swellPeriodSeconds: { min: 10 },
      swellDirectionDegrees: { from: 250, to: 310 },
      windSpeedMetersPerSecond: { max: 8 },
      tideTrend: "rising",
    },
    figures: {
      swellHeightMeters: 1.8,
      swellPeriodSeconds: 11,
      swellDirectionDegrees: 280,
      windSpeedMetersPerSecond: 5,
      windDirectionDegrees: 90,
      tideHeightMeters: 2.4,
      tideTrend: "rising",
    },
  };
  const after = {
    criteria: {
      waveHeightMeters: { min: 1, max: 2.5 },
      wavePeakPeriodSeconds: { min: 10 },
      waveDirectionDegrees: { from: 250, to: 310 },
      windSpeedMetersPerSecond: { max: 8 },
      tideTrend: "rising",
    },
    figures: {
      waveHeightMeters: 1.8,
      wavePeakPeriodSeconds: 11,
      waveDirectionDegrees: 280,
      windSpeedMetersPerSecond: 5,
      windDirectionDegrees: 90,
      tideHeightMeters: 2.4,
      tideTrend: "rising",
    },
  };
  // A name that holds the old word, quotes and all: it is a name, and stays as it was written.
  const NAME = 'My "swellHeightMeters": spot';

  beforeAll(async () => {
    database = await createTestDatabase();
    const { db } = database;
    await db.insert(user).values({ id: "owner", name: "Owner", email: "o@example.org" });
    await db.insert(spot).values({
      id: "home",
      userId: "owner",
      name: NAME,
      latitude: 43.63,
      longitude: -1.46,
      criteria: before.criteria as never,
    });
    await db.insert(alert).values([
      { id: "old", userId: "owner", name: NAME, criteria: before.criteria as never },
      // One that was saved since, and one that asks nothing of the waves: both stay as they are.
      { id: "new", userId: "owner", name: "Clean", criteria: after.criteria as never },
      {
        id: "wind",
        userId: "owner",
        name: "Wind",
        criteria: { windSpeedMetersPerSecond: { max: 5 } },
      },
    ]);
    await db.insert(alertSpot).values({ spotId: "home", alertId: "old", position: 0 });
    await db.insert(alertWindow).values({
      alertId: "old",
      spotId: "home",
      seaStart: START,
      seaEnd: new Date(START.getTime() + 2 * 3600_000),
      hours: [
        { time: START.toISOString(), ...before.figures },
        { time: new Date(START.getTime() + 3600_000).toISOString(), ...before.figures },
      ] as never,
    });
    await db.insert(notification).values({
      id: "told",
      userId: "owner",
      alertId: "old",
      moment: "found",
      key: "told",
      payload: {
        alertName: NAME,
        zone: "Europe/Paris",
        lines: [{ spotId: "home", spotName: NAME, open: [], sea: before.figures }],
      } as never,
    });
    for (const statement of statements) await db.$client.query(statement);
  });
  afterAll(() => database?.drop());

  it("renames an alert's conditions, and leaves the others as they were", async () => {
    const { db } = database;
    const criteriaOf = async (id: string) =>
      (await db.select().from(alert).where(eq(alert.id, id)))[0]?.criteria;

    expect(await criteriaOf("old")).toEqual(after.criteria);
    expect(await criteriaOf("new")).toEqual(after.criteria);
    expect(await criteriaOf("wind")).toEqual({ windSpeedMetersPerSecond: { max: 5 } });
    expect((await db.select().from(spot))[0]?.criteria).toEqual(after.criteria);
  });

  it("renames the figures a window and a notification keep, hour by hour", async () => {
    const { db } = database;
    const [window] = await db.select().from(alertWindow);
    const [told] = await db.select().from(notification);

    expect(window?.hours).toEqual([
      { time: START.toISOString(), ...after.figures },
      { time: new Date(START.getTime() + 3600_000).toISOString(), ...after.figures },
    ]);
    expect(told?.payload.lines[0]?.sea).toEqual(after.figures);
  });

  it("keeps a name that holds the old word as it was written", async () => {
    const { db } = database;
    const [told] = await db.select().from(notification);

    expect((await db.select().from(alert).where(eq(alert.id, "old")))[0]?.name).toBe(NAME);
    expect(told?.payload.alertName).toBe(NAME);
    expect(told?.payload.lines[0]?.spotName).toBe(NAME);
  });

  it("changes nothing the second time", async () => {
    const { db } = database;
    for (const statement of statements) {
      expect((await db.$client.query(statement)).rowCount).toBe(0);
    }
  });
});
