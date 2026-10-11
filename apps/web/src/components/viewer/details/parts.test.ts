import { describe, expect, it } from "vitest";

import type { Station } from "../types";
import { boxAround, nearestWindStation } from "./parts";

const NOW = Date.UTC(2026, 9, 11, 18);
const MINUTE = 60 * 1000;
// La Torche, in Brittany.
const PLACE = { latitude: 47.84, longitude: -4.35 };

// A wind station so many kilometres north of the place, with a reading so many minutes old.
function station(id: string, kmNorth: number, minutesAgo: number, speed: number | null = 8) {
  return {
    id,
    name: id,
    latitude: PLACE.latitude + kmNorth / 111.2,
    longitude: PLACE.longitude,
    latestReading: {
      observedAt: new Date(NOW - minutesAgo * MINUTE),
      windSpeedMetersPerSecond: speed,
      windGustMetersPerSecond: null,
      windDirectionDegrees: 270,
    },
  } as unknown as Station;
}

describe("boxAround", () => {
  it("holds everything within the distance, wider in degrees of longitude than of latitude", () => {
    const [west, south, east, north] = boxAround(PLACE, 30).split(",").map(Number);

    expect(north! - PLACE.latitude).toBeCloseTo(0.27, 2);
    expect(PLACE.latitude - south!).toBeCloseTo(0.27, 2);
    expect(east! - PLACE.longitude).toBeCloseTo(0.402, 2);
    expect(PLACE.longitude - west!).toBeCloseTo(0.402, 2);
  });

  it("asks the same question of the same point, and stays on the globe", () => {
    expect(boxAround(PLACE, 30)).toBe(boxAround({ ...PLACE }, 30));
    expect(boxAround({ latitude: 89.9, longitude: 179.9 }, 30).split(",").map(Number)).toEqual([
      expect.any(Number),
      expect.any(Number),
      180,
      90,
    ]);
  });
});

describe("nearestWindStation", () => {
  it("takes the nearest station that measured the wind lately", () => {
    const found = nearestWindStation(
      [station("far", 20, 5), station("near", 4, 10), station("nearer-but-silent", 1, 180)],
      PLACE,
      NOW,
    );

    expect(found?.station.id).toBe("near");
    expect(found?.distanceKm).toBeCloseTo(4, 1);
  });

  it("leaves out a station without a wind speed, and one further than thirty kilometres", () => {
    expect(nearestWindStation([station("no-wind", 2, 5, null)], PLACE, NOW)).toBeUndefined();
    expect(nearestWindStation([station("too-far", 31, 5)], PLACE, NOW)).toBeUndefined();
    expect(nearestWindStation([], PLACE, NOW)).toBeUndefined();
  });
});
