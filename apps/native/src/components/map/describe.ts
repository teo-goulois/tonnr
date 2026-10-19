import { periodOf, type Station } from "@repo/client/viewer/types";

import { freshnessOf, formatSeconds, toKnots } from "@/lib/format";
import { formatHeight, windFigure } from "@/lib/units";

import type { MapStation, MapWind } from "./features";

// What the map draws of a station, as the web's route describes it, in the reader's units.

const HOUR_MS = 60 * 60 * 1000;
// A wind reading older than this says little of the wind now. The web's own.
const FRESH_WIND_MS = 2 * HOUR_MS;

/** A buoy, with its last reading when it is recent enough to say the sea now. */
export function describeStation(station: Station, now: number): MapStation {
  const reading = station.latestReading;
  const freshness = freshnessOf(reading?.observedAt, now);
  const shown = freshness === "none" ? null : reading;
  const height = shown?.significantHeightMeters ?? null;
  const period = periodOf(shown);
  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    heightMeters: height,
    periodSeconds: period,
    directionDegrees: shown?.peakDirectionDegrees ?? null,
    freshness,
    isSheltered: station.exposure === "sheltered",
    figures: [height !== null && formatHeight(height), period !== null && formatSeconds(period)]
      .filter(Boolean)
      .join(" · "),
  };
}

/** A station's wind, or none when it measured none lately. */
export function describeWind(station: Station, now: number): MapWind | null {
  const reading = station.latestReading;
  const speed = toKnots(reading?.windSpeedMetersPerSecond);
  if (!reading || speed === null || now - reading.observedAt.getTime() > FRESH_WIND_MS) {
    return null;
  }
  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    speedKnots: speed,
    directionDegrees: reading.windDirectionDegrees,
    figure: windFigure(speed),
  };
}
