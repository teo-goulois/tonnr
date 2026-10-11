import type { Database } from "@repo/db";
import type { NotificationPayload } from "@repo/db/schema/alerts";
import { reading, station } from "@repo/db/schema/buoys";
import { and, between, desc, eq, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import type { Transaction } from "./kept";

// Decision 031, "What the buoy says": the reading of a wave station near a spot, given beside
// "it is on" for its reader to judge.

const MINUTE_MS = 60 * 1000;
// A wave station is read for "it is on" when it is this near, and its reading this recent.
const STATION_KM = 60;
const READING_FRESH_MS = 2 * 60 * MINUTE_MS;
// Among the stations near enough, the nearest few are asked for a reading, the nearest first.
const STATIONS_ASKED = 5;
const EARTH_KM = 6371;
const KM_PER_DEGREE = 111.2;

type Place = { id: string; name: string; latitude: number; longitude: number };
type Line = NotificationPayload["lines"][number];

function distanceKm(
  one: { latitude: number; longitude: number },
  other: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(other.latitude - one.latitude) / 2) ** 2 +
    Math.cos(radians(one.latitude)) *
      Math.cos(radians(other.latitude)) *
      Math.sin(radians(other.longitude - one.longitude) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/**
 * The longitudes of a box that holds every point within a distance of a place: one range, two
 * when it passes the antimeridian, and null for every longitude, near a pole. The distance
 * itself is checked afterwards.
 */
export function longitudesNear(place: { latitude: number; longitude: number }, km: number) {
  const latitudes = km / KM_PER_DEGREE;
  // The parallel of the box that is nearest a pole is the narrowest: the box is as wide there.
  const farthest = Math.min(90, Math.abs(place.latitude) + latitudes);
  const width = latitudes / Math.cos((farthest * Math.PI) / 180);
  if (farthest >= 90 || width >= 180) return null;
  const [west, east] = [place.longitude - width, place.longitude + width];
  if (west < -180) return [[west + 360, 180] as const, [-180, east] as const];
  if (east > 180) return [[west, 180] as const, [-180, east - 360] as const];
  return [[west, east] as const];
}

/**
 * The latest wave reading of the nearest station that the sea reaches freely, near a place and
 * no older than two hours. Null far from any, or when none near has measured waves lately. It
 * is the whole sea where the station stands, and confirms nothing of a spot: decision 031,
 * "What the buoy says".
 */
export async function wavesNear(db: Database | Transaction, place: Place, now: Date) {
  const since = new Date(now.getTime() - READING_FRESH_MS);
  const latitudes = STATION_KM / KM_PER_DEGREE;
  const longitudes = longitudesNear(place, STATION_KM);
  const near = await db
    .select({
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      attribution: station.attribution,
    })
    .from(station)
    .where(
      and(
        eq(station.reportsWaves, true),
        // A station that is not known to be sheltered: open, or not told yet (decision 011).
        or(isNull(station.exposure), ne(station.exposure, "sheltered")),
        // A station that said nothing lately has no reading to give.
        gte(station.latestObservedAt, since),
        between(station.latitude, place.latitude - latitudes, place.latitude + latitudes),
        longitudes
          ? or(...longitudes.map(([west, east]) => between(station.longitude, west, east)))
          : undefined,
      ),
    );
  const nearest = near
    .map((one) => ({ ...one, distanceKm: distanceKm(place, one) }))
    .filter((one) => one.distanceKm <= STATION_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, STATIONS_ASKED);
  for (const one of nearest) {
    // Its latest reading that measured waves: a later one may hold the wind alone. One that
    // is dated after now is a clock that is wrong, and is not read.
    const [read] = await db
      .select()
      .from(reading)
      .where(
        and(
          eq(reading.stationId, one.id),
          isNotNull(reading.significantHeightM),
          gte(reading.observedAt, since),
          lte(reading.observedAt, now),
        ),
      )
      .orderBy(desc(reading.observedAt))
      .limit(1);
    if (!read) continue;
    return {
      stationId: one.id,
      name: one.name,
      distanceKm: Math.round(one.distanceKm * 10) / 10,
      observedAt: read.observedAt.toISOString(),
      significantHeightMeters: read.significantHeightM,
      peakPeriodSeconds: read.peakPeriodS,
      peakDirectionDegrees: read.peakDirectionDeg,
      attribution: one.attribution,
    } satisfies NonNullable<Line["buoy"]>;
  }
  return null;
}
