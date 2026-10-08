import { reading, station } from "@repo/db/schema/buoys";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Snapshot } from "./providers/provider";
import { saveSnapshot } from "./store";

const AT_1000 = new Date("2026-10-08T10:00:00Z");
const AT_1100 = new Date("2026-10-08T11:00:00Z");

function buoy(providerStationId: string, latitude = 48, longitude = -5) {
  return {
    providerStationId,
    name: providerStationId,
    latitude,
    longitude,
    licenseType: "test",
    licenseUrl: "https://example.org/licence",
    attribution: "Test",
    commercialUse: true,
  } satisfies Snapshot["stations"][number];
}

describe.skipIf(!TEST_DATABASE_URL)("saveSnapshot", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database.drop());

  const save = (stations: Snapshot["stations"], readings: Snapshot["readings"] = []) =>
    Effect.runPromise(saveSnapshot(database.db, "test", { stations, readings, rejected: 0 }));
  const stationRow = async (id: string) => {
    const [row] = await database.db
      .select()
      .from(station)
      .where(eq(station.id, `test-${id}`));
    return row;
  };
  const readingRows = (id: string) =>
    database.db
      .select()
      .from(reading)
      .where(eq(reading.stationId, `test-${id}`));

  it("writes a reading once, and changes nothing when the same snapshot comes again", async () => {
    const readings = [{ providerStationId: "once", observedAt: AT_1000, significantHeightM: 2 }];

    expect(await save([buoy("once")], readings)).toEqual({
      stations: 1,
      newReadings: 1,
      completedReadings: 0,
      failedStations: 0,
    });
    expect(await save([buoy("once")], readings)).toMatchObject({
      newReadings: 0,
      completedReadings: 0,
    });
    expect(await readingRows("once")).toHaveLength(1);
  });

  it("gives a reading the values it lacked and keeps the ones it had", async () => {
    await save(
      [buoy("completed")],
      [{ providerStationId: "completed", observedAt: AT_1000, significantHeightM: 2 }],
    );
    const written = await save(
      [buoy("completed")],
      [
        {
          providerStationId: "completed",
          observedAt: AT_1000,
          significantHeightM: 8,
          peakPeriodS: 10,
        },
      ],
    );

    expect(written).toMatchObject({ newReadings: 0, completedReadings: 1 });
    expect(await readingRows("completed")).toMatchObject([
      { significantHeightM: 2, peakPeriodS: 10 },
    ]);
  });

  it("keeps a reading validated only while every value it took was", async () => {
    const height = { providerStationId: "checked", observedAt: AT_1000, significantHeightM: 2 };
    await save([buoy("checked")], [{ ...height, validated: true }]);

    // Brings nothing, so it changes nothing, its mark included.
    await save([buoy("checked")], [{ ...height, validated: false }]);
    expect(await readingRows("checked")).toMatchObject([{ validated: true }]);

    await save([buoy("checked")], [{ ...height, peakPeriodS: 10, validated: false }]);
    expect(await readingRows("checked")).toMatchObject([{ peakPeriodS: 10, validated: false }]);
  });

  it("remembers what a station has reported, and its latest reading", async () => {
    await save(
      [buoy("measures")],
      [{ providerStationId: "measures", observedAt: AT_1100, significantHeightM: 2 }],
    );
    await save(
      [buoy("measures")],
      [{ providerStationId: "measures", observedAt: AT_1000, windSpeedMs: 7 }],
    );

    expect(await stationRow("measures")).toMatchObject({
      reportsWaves: true,
      reportsWind: true,
      latestObservedAt: AT_1100,
    });
  });

  describe("when a station is seen somewhere else", () => {
    // What is known of a station, then where it is seen next.
    const seenAfter = async (id: string, from: [number, number], to: [number, number]) => {
      await save([buoy(id, ...from)]);
      await database.db
        .update(station)
        .set({ exposure: "sheltered" })
        .where(eq(station.id, `test-${id}`));
      await save([buoy(id, ...to)]);
      return stationRow(id);
    };

    it("keeps what was known within five kilometres", async () => {
      // 0.044 degrees of latitude is 4.9 km.
      expect(await seenAfter("swinging", [51.44, 3.69], [51.484, 3.69])).toMatchObject({
        latitude: 51.484,
        exposure: "sheltered",
        movedAt: null,
      });
    });

    it("forgets it farther away, and notes when", async () => {
      // 0.046 degrees of latitude is 5.1 km.
      const moved = await seenAfter("moved", [51.44, 3.69], [51.486, 3.69]);

      expect(moved).toMatchObject({ latitude: 51.486, exposure: null });
      expect(moved?.movedAt).toBeInstanceOf(Date);
    });

    it("measures the distance on the ground, not in degrees", async () => {
      // 6 km east at 51 degrees north is 0.086 degrees, and 1 km east at 80 degrees is 0.051.
      expect(await seenAfter("east", [51.44, 3.69], [51.44, 3.776])).toMatchObject({
        exposure: null,
      });
      expect(await seenAfter("north", [80, 0], [80, 0.051])).toMatchObject({
        exposure: "sheltered",
      });
    });

    it("takes the short way round the 180th meridian and over the pole", async () => {
      expect(await seenAfter("dateline", [0, 179.99], [0, -179.99])).toMatchObject({
        exposure: "sheltered",
      });
      expect(await seenAfter("pole", [89.98, 0], [89.98, 180])).toMatchObject({
        exposure: "sheltered",
      });
    });
  });
});
