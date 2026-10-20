import { freshnessOf } from "../format";
import { HOUR_MS, distanceKm } from "./samples";
import type { Station } from "./types";

// Which stations a surf break or a spot reads the sea and the wind on, as the panel of each app
// finds them: the buoy nearest it that still reports, the wind station nearest it that measured
// lately, and the box the API is asked for the wind stations around it.

/** A station a place reads the sea or the wind on, and how far it stands. */
export type Nearby = { station: Station; distanceKm: number };

type Place = { latitude: number; longitude: number };

// A buoy further than this says little of the sea at a spot.
export const NEARBY_KM = 150;
// The wind is a local thing: a station further than this says little of it at a spot.
export const WIND_NEARBY_KM = 30;
// A wind measured longer ago than this is not the wind now. The map draws no badge for it either.
const LIVE_WIND = 2 * HOUR_MS;

/** The buoy nearest a place that still reports, among those the sea reaches freely. */
export function nearestBuoy(stations: Station[], place: Place, now: number) {
  let nearest: Nearby | undefined;
  for (const station of stations) {
    const reading = station.latestReading;
    if (station.exposure === "sheltered" || reading?.significantHeightMeters == null) continue;
    if (freshnessOf(reading.observedAt, now) === "none") continue;
    const distance = distanceKm(place, station);
    if (distance <= NEARBY_KM && (!nearest || distance < nearest.distanceKm)) {
      nearest = { station, distanceKm: distance };
    }
  }
  return nearest;
}

/** The station nearest a place among those that measured the wind lately. */
export function nearestWindStation(stations: Station[], place: Place, now: number) {
  let nearest: Nearby | undefined;
  for (const station of stations) {
    const reading = station.latestReading;
    if (reading?.windSpeedMetersPerSecond == null) continue;
    if (now - reading.observedAt.getTime() > LIVE_WIND) continue;
    const distance = distanceKm(place, station);
    if (distance <= WIND_NEARBY_KM && (!nearest || distance < nearest.distanceKm)) {
      nearest = { station, distanceKm: distance };
    }
  }
  return nearest;
}

/**
 * The box around a point that holds everything within a distance of it, as the API takes a box:
 * "west,south,east,north". Its sides are rounded so that the same point asks the same question.
 */
export function boxAround(place: Place, km: number) {
  const north = km / 111.2;
  const east = north / Math.max(0.1, Math.cos((place.latitude * Math.PI) / 180));
  const within = (value: number, most: number) => Math.min(most, Math.max(-most, value));
  return [
    within(place.longitude - east, 180),
    within(place.latitude - north, 90),
    within(place.longitude + east, 180),
    within(place.latitude + north, 90),
  ]
    .map((side) => side.toFixed(3))
    .join(",");
}
