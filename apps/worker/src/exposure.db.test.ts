import { station } from "@repo/db/schema/buoys";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { updateExposure } from "./exposure";
import type { Snapshot } from "./providers/provider";
import { saveSnapshot } from "./store";

// Six buoys along an open coast and five sites 21 km up an estuary, each more than 5 km from the
// next. The sea runs at 2 m every day. Each site tells one thing the query must get right.
const SEA = Array.from({ length: 6 }, (_, index) => ({
  id: `sea-${index}`,
  latitude: 51.5 + index * 0.05,
  longitude: 3,
}));
const SITES = ["estuary", "high-today", "short-day", "one-reading", "moved"].map((id, index) => ({
  id,
  latitude: 51.5 + index * 0.05,
  longitude: 3.3,
}));

const WHOLE_DAY = [0, 6, 12, 18];
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, "0")}:00Z`);

function readings(id: string, days: string[], heights: number | number[], hours = WHOLE_DAY) {
  return days.flatMap((day) =>
    hours.map((hour, index) => ({
      providerStationId: id,
      observedAt: at(day, hour),
      significantHeightM: typeof heights === "number" ? heights : (heights[index] ?? 0),
    })),
  );
}

const LOW_DAYS = ["2026-10-07", "2026-10-08", "2026-10-09"];
const SCENE: Snapshot["readings"] = [
  ...SEA.flatMap((buoy) =>
    readings(buoy.id, ["2026-10-06", ...LOW_DAYS, "2026-10-10", "2026-10-11"], 2),
  ),
  ...readings("estuary", LOW_DAYS, 0.1),
  // Low on three days, then as high as the sea on the fourth.
  ...readings("high-today", LOW_DAYS, 0.1),
  ...readings("high-today", ["2026-10-10"], 2),
  // Low on three days, and high on a day it covers in three quarters only.
  ...readings("short-day", LOW_DAYS, 0.1),
  ...readings("short-day", ["2026-10-06"], 2, [0, 6, 12]),
  // Low on three days, and one high reading among four on another.
  ...readings("one-reading", LOW_DAYS, 0.1),
  ...readings("one-reading", ["2026-10-06"], [0, 0, 0, 4]),
  // In the open for two days, then moved to where it is low for two.
  ...readings("moved", ["2026-10-06", "2026-10-07"], 2),
  ...readings("moved", ["2026-10-08", "2026-10-09"], 0.1),
];

describe.skipIf(!TEST_DATABASE_URL)("updateExposure", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
    await Effect.runPromise(
      saveSnapshot(database.db, "test", {
        stations: [...SEA, ...SITES].map(({ id, latitude, longitude }) => ({
          providerStationId: id,
          name: id,
          latitude,
          longitude,
          licenseType: "test",
          licenseUrl: "https://example.org/licence",
          attribution: "Test",
          commercialUse: true,
        })),
        readings: SCENE,
        rejected: 0,
      }),
    );
    await database.db
      .update(station)
      .set({ movedAt: new Date("2026-10-08T00:00:00Z") })
      .where(eq(station.id, "test-moved"));
  });
  afterAll(() => database.drop());

  const exposures = async () => {
    const rows = await database.db
      .select({ id: station.id, exposure: station.exposure })
      .from(station);
    return Object.fromEntries(rows.map((row) => [row.id.replace("test-", ""), row.exposure]));
  };

  it("reads each station's exposure from whole days of readings", async () => {
    // Late on the 10th: that day's readings cover its four quarters, and it is not over.
    const found = await Effect.runPromise(
      updateExposure(database.db, new Date("2026-10-10T23:50:00Z")),
    );

    expect(found).toEqual({ stations: 11, open: 6, sheltered: 4, changed: 10 });
    expect(await exposures()).toEqual({
      ...Object.fromEntries(SEA.map((buoy) => [buoy.id, "open"])),
      estuary: "sheltered",
      // The day under way does not count yet.
      "high-today": "sheltered",
      // A day covered in three of its quarters does not count.
      "short-day": "sheltered",
      // One high reading among four does not make a day's strong waves.
      "one-reading": "sheltered",
      // Its two days in the open were before it moved, and two low days are not three.
      moved: null,
    });
  });

  it("changes nothing when the same days are read again", async () => {
    const found = await Effect.runPromise(
      updateExposure(database.db, new Date("2026-10-10T23:55:00Z")),
    );

    expect(found).toEqual({ stations: 11, open: 6, sheltered: 4, changed: 0 });
  });

  it("takes sheltered back once a day that was not low is over", async () => {
    const found = await Effect.runPromise(
      updateExposure(database.db, new Date("2026-10-11T03:47:00Z")),
    );

    expect(found).toEqual({ stations: 11, open: 6, sheltered: 3, changed: 1 });
    expect(await exposures()).toMatchObject({ estuary: "sheltered", "high-today": null });
  });
});
