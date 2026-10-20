import type { Station } from "@repo/client/viewer/types";
import { describe, expect, it } from "vitest";

import { boxAround, nearestBuoy, nearestWindStation } from "./nearby";

const NOW = Date.UTC(2026, 9, 20, 12);
const MINUTE = 60 * 1000;
const PLACE = { latitude: 43.48, longitude: -1.56 };

function station(
  id: string,
  at: { latitude: number; longitude: number },
  reading: { height?: number; wind?: number; minutesAgo: number },
  exposure: Station["exposure"] = "open",
): Station {
  return {
    id,
    name: id,
    ...at,
    exposure,
    latestReading: {
      observedAt: new Date(NOW - reading.minutesAgo * MINUTE),
      significantHeightMeters: reading.height ?? null,
      windSpeedMetersPerSecond: reading.wind ?? null,
    },
  } as unknown as Station;
}

describe("the station a place reads the sea on", () => {
  it("is the nearest buoy that still reports and that the sea reaches freely", () => {
    const stations = [
      station("far", { latitude: 44.6, longitude: -1.6 }, { height: 2, minutesAgo: 30 }),
      station("near", { latitude: 43.6, longitude: -1.7 }, { height: 1, minutesAgo: 30 }),
      station(
        "sheltered",
        { latitude: 43.49, longitude: -1.56 },
        { height: 0.3, minutesAgo: 30 },
        "sheltered",
      ),
      station("silent", { latitude: 43.5, longitude: -1.57 }, { height: 1, minutesAgo: 9000 }),
    ];
    expect(nearestBuoy(stations, PLACE, NOW)?.station.id).toBe("near");
  });

  it("is none beyond the distance a buoy says something of a spot", () => {
    const stations = [
      station("away", { latitude: 46, longitude: -1.56 }, { height: 2, minutesAgo: 30 }),
    ];
    expect(nearestBuoy(stations, PLACE, NOW)).toBeUndefined();
  });
});

describe("the station a place reads the wind on", () => {
  it("is the nearest that measured the wind lately, near enough to say it", () => {
    const stations = [
      station("old", { latitude: 43.48, longitude: -1.55 }, { wind: 5, minutesAgo: 200 }),
      station("near", { latitude: 43.5, longitude: -1.6 }, { wind: 5, minutesAgo: 10 }),
      station("far", { latitude: 43.9, longitude: -1.56 }, { wind: 5, minutesAgo: 10 }),
    ];
    const found = nearestWindStation(stations, PLACE, NOW);
    expect(found?.station.id).toBe("near");
    expect(found?.distanceKm).toBeLessThan(5);
  });
});

describe("the box the API is asked for around a place", () => {
  it("holds everything within the distance, its sides rounded so that the same point asks the same", () => {
    const box = boxAround(PLACE, 30).split(",").map(Number);
    expect(box).toHaveLength(4);
    const [west, south, east, north] = box as [number, number, number, number];
    expect(west).toBeLessThan(PLACE.longitude);
    expect(east).toBeGreaterThan(PLACE.longitude);
    expect(north - PLACE.latitude).toBeCloseTo(30 / 111.2, 2);
    expect(PLACE.latitude - south).toBeCloseTo(30 / 111.2, 2);
    expect(boxAround(PLACE, 30)).toBe(boxAround({ ...PLACE }, 30));
  });
});
