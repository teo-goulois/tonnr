import { fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { isObservationTime } from "./utc-date";

// OpenWindMap took over the Pioupiou network, and its API kept the old address.
const LIVE_URL = "https://api.pioupiou.fr/v1/live-with-meta/all";
const LICENSE_URL = "https://developers.pioupiou.fr/data-licensing/";
const ATTRIBUTION =
  "Wind data (c) contributors of the OpenWindMap wind network <https://openwindmap.org>";

// A station silent for longer than this is treated as gone, not as a station with an old reading.
const SILENT_MS = 7 * 24 * 60 * 60 * 1000;
const KMH_PER_MS = 3.6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

/**
 * Reads the live feed: every station with its position and its last wind measurement.
 * Speeds come in km/h, averaged over four minutes. The heading is where the wind comes from.
 */
export function parseLiveStations(json: unknown, now = new Date()): Snapshot | FormatError {
  if (!isRecord(json) || !Array.isArray(json.data)) {
    return new FormatError({
      provider: "openwindmap",
      message: "the live feed has no station list",
    });
  }

  const stations: StationInput[] = [];
  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const entry of json.data) {
    if (!isRecord(entry) || !isRecord(entry.location) || !isRecord(entry.measurements)) {
      rejected += 1;
      continue;
    }

    const { location, measurements } = entry;
    const latitude = numberOrNull(location.latitude);
    const longitude = numberOrNull(location.longitude);
    const speedKmh = numberOrNull(measurements.wind_speed_avg);
    // A station that has never sent a position or a wind speed is not broken, only not set up yet.
    if (latitude === null || longitude === null || speedKmh === null) continue;
    // The network marks a position it no longer trusts, for a station that moved or lost its fix.
    if (location.success !== true) continue;
    if (typeof measurements.date !== "string") continue;

    const observedAt = new Date(measurements.date);
    const id = typeof entry.id === "number" || typeof entry.id === "string" ? String(entry.id) : "";
    if (id === "" || !isObservationTime(observedAt) || !isPosition(latitude, longitude)) {
      rejected += 1;
      continue;
    }
    if (now.getTime() - observedAt.getTime() > SILENT_MS) continue;

    const windSpeedMs = plausible("windSpeedMs", speedKmh / KMH_PER_MS);
    if (windSpeedMs === null) {
      rejected += 1;
      continue;
    }

    const gustKmh = numberOrNull(measurements.wind_speed_max);
    const heading = numberOrNull(measurements.wind_heading);
    const name = isRecord(entry.meta) && typeof entry.meta.name === "string" ? entry.meta.name : "";

    stations.push({
      providerStationId: id,
      name: name.trim() || `Station ${id}`,
      latitude,
      longitude,
      licenseType: "openwindmap-community",
      licenseUrl: LICENSE_URL,
      attribution: ATTRIBUTION,
      commercialUse: true,
    });
    readings.push({
      providerStationId: id,
      observedAt,
      windSpeedMs,
      windGustMs: gustKmh === null ? null : plausible("windGustMs", gustKmh / KMH_PER_MS),
      windDirectionDeg: heading === null ? null : plausible("windDirectionDeg", heading),
    });
  }

  return { stations, readings, rejected };
}

export const openwindmap: Provider = {
  id: "openwindmap",
  // The network asks for no more than one request a minute. Stations report every few minutes.
  schedule: "*/10 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const snapshot = parseLiveStations(yield* fetchJson(LIVE_URL));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
