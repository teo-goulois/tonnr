import { fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseUtcTime } from "./utc-date";

// Cefas WaveNet gathers the wave buoys around the United Kingdom and Ireland: its own, and those
// of the Channel Coastal Observatory, the Met Office, the Marine Institute, and oil platforms.
// This answer holds the latest reading of every buoy.
const CURRENT_URL = "https://wavenet-api.cefas.co.uk/api/Map/Current";
// Cefas states a licence for each buoy. Its data policy leaves only this one without restriction.
const OPEN_LICENCE = "Open Government Licence";
const LICENCE_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

// A buoy out of service keeps its last reading in the answer, sometimes for months.
const RECENT_MS = 48 * 60 * 60 * 1000;

// Each result with the unit the parser was written for. A change of unit would store wrong
// values silently.
const RESULTS: Record<string, { measurement: Measurement; unit: string }> = {
  Hm0: { measurement: "significantHeightM", unit: "m" },
  Tpeak: { measurement: "peakPeriodS", unit: "s" },
  // The zero-crossing period.
  Tz: { measurement: "meanPeriodS", unit: "s" },
  W_PDIR: { measurement: "peakDirectionDeg", unit: "°" },
  W_SPR: { measurement: "directionalSpreadDeg", unit: "°" },
  // The temperature of the sea.
  TEMP: { measurement: "waterTemperatureC", unit: "°C" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatError(message: string) {
  return new FormatError({ provider: "cefas", message });
}

/**
 * Reads the map of current readings: one feature per buoy, with its owner, its licence, and its
 * latest values as text. Only the buoys under the Open Government Licence are kept.
 */
export function parseCurrentReadings(json: unknown, now = new Date()): Snapshot | FormatError {
  if (!isRecord(json) || !Array.isArray(json.features)) {
    return formatError("the answer has no list of buoys");
  }

  const stations = new Map<string, StationInput>();
  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const feature of json.features) {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};
    const licence = /Data usage license "([^"]+)"/.exec(text(properties.usage))?.[1];
    if (!licence) return formatError("a buoy does not state its licence");
    if (licence !== OPEN_LICENCE) continue;

    // A buoy that has no reading yet has no time.
    if (properties.timestamp == null || !isRecord(properties.results)) continue;

    const geometry = isRecord(feature) && isRecord(feature.geometry) ? feature.geometry : {};
    const [longitude, latitude]: unknown[] = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];
    // Cefas names a buoy by its id and by whether the buoy is its own or another body's.
    const id = [text(properties.id), text(properties.source)].filter(Boolean).join("-");
    // The answer gives its times in UTC without saying so.
    const stamp = text(properties.timestamp);
    const observedAt = parseUtcTime(/(Z|\+00:00)$/.test(stamp) ? stamp : `${stamp}Z`);
    if (
      text(properties.id) === "" ||
      stations.has(id) ||
      !observedAt ||
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !isPosition(latitude, longitude)
    ) {
      rejected += 1;
      continue;
    }
    if (now.getTime() - observedAt.getTime() > RECENT_MS) continue;

    const reading: ReadingInput = { providerStationId: id, observedAt };
    for (const [name, { measurement, unit }] of Object.entries(RESULTS)) {
      const result = properties.results[name];
      // A buoy lists only the results it measures.
      if (!isRecord(result)) continue;
      if (result.unit !== unit) {
        return formatError(`${name} is in "${text(result.unit)}", not "${unit}"`);
      }
      const value = Array.isArray(result.values) ? text(result.values[0]) : "";
      // An empty text stands for a missing value.
      reading[measurement] = value === "" ? null : plausible(measurement, Number(value));
    }
    if (reading.significantHeightM == null) continue;

    const owner = text(properties.provider);
    stations.set(id, {
      providerStationId: id,
      name: text(properties.title) || `Station ${id}`,
      latitude,
      longitude,
      licenseType: "ogl-3.0",
      licenseUrl: LICENCE_URL,
      attribution:
        `Data provided by ${owner && owner !== "Cefas" ? `${owner} through ` : ""}Cefas WaveNet. ` +
        "Contains public sector information licensed under the Open Government Licence v3.0.",
      // The licence allows it, but each buoy's notice adds "No re-use without prior agreement".
      // It stays unknown until Cefas says which one holds.
      commercialUse: null,
    });
    readings.push(reading);
  }

  return { stations: [...stations.values()], readings, rejected };
}

export const cefas: Provider = {
  id: "cefas",
  // A buoy reports every thirty minutes, and its reading appears about an hour later.
  schedule: "10,40 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const snapshot = parseCurrentReadings(yield* fetchJson(CURRENT_URL));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
