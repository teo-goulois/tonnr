import { fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { utcDate } from "./utc-date";

// The open data of IPMA, Portugal's weather institute: every station of the mainland, Madeira
// and the Azores, an hour at a time, over the last day.
const API_URL = "https://api.ipma.pt/open-data/observation/meteorology/stations";
const TERMS_URL = "https://api.ipma.pt/";

// The direction is one of eight points: 1 or 9 for north, 2 for northeast, round to 8 for
// northwest, and 0 for no direction.
const DEGREES_BY_CLASS: Readonly<Record<number, number>> = {
  1: 360,
  2: 45,
  3: 90,
  4: 135,
  5: 180,
  6: 225,
  7: 270,
  8: 315,
  9: 360,
};
// What the institute writes for a value it does not have.
const NO_DATA = -99;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "ipma", message });
}

type Place = { name: string; latitude: number; longitude: number };

/** Reads the stations: their id, their name and their place. */
export function parseStations(json: unknown): Map<string, Place> | FormatError {
  if (!Array.isArray(json)) return formatError("the list of the stations is not a list");

  const places = new Map<string, Place>();
  for (const feature of json) {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry))
      continue;
    const { idEstacao: id, localEstacao: name } = feature.properties;
    const coordinates = feature.geometry.coordinates;
    if ((typeof id !== "number" && typeof id !== "string") || !Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates as unknown[];
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    if (!isPosition(latitude, longitude)) continue;
    places.set(String(id), {
      name: typeof name === "string" ? name.trim() : "",
      latitude,
      longitude,
    });
  }
  return places;
}

/** Reads an hour of the file, as `2026-10-14T13:00`, which is written in UTC. */
function hourOf(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(key);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return utcDate(year, month, day, hour, minute);
}

/**
 * Reads the observations of the last day: for each hour, the values of every station. Wind is
 * `intensidadeVento`, in metres per second at ten metres, and `idDireccVento`, where it comes
 * from. The file gives no gust.
 */
export function parseObservations(
  json: unknown,
  places: ReadonlyMap<string, Place>,
): Snapshot | FormatError {
  if (!isRecord(json)) return formatError("the observations are not an object");

  const stations = new Map<string, StationInput>();
  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const [key, hour] of Object.entries(json)) {
    const observedAt = hourOf(key);
    if (!observedAt || !isRecord(hour)) {
      rejected += 1;
      continue;
    }
    for (const [id, values] of Object.entries(hour)) {
      // A station that sent nothing that hour is written as null.
      if (!isRecord(values)) continue;
      const speed = values.intensidadeVento;
      if (typeof speed !== "number" || speed === NO_DATA) continue;
      const place = places.get(id);
      if (!place) continue;
      const windSpeedMs = plausible("windSpeedMs", speed);
      if (windSpeedMs === null) {
        rejected += 1;
        continue;
      }
      const direction =
        typeof values.idDireccVento === "number" ? DEGREES_BY_CLASS[values.idDireccVento] : null;

      stations.set(id, {
        providerStationId: id,
        name: place.name || `Station ${id}`,
        latitude: place.latitude,
        longitude: place.longitude,
        licenseType: "ipma-terms",
        licenseUrl: TERMS_URL,
        attribution: "IPMA",
        // The institute's terms let its information be used free of charge, for no profit.
        commercialUse: false,
      });
      readings.push({
        providerStationId: id,
        observedAt,
        windSpeedMs,
        windGustMs: null,
        windDirectionDeg: direction === undefined || direction === null ? null : direction,
      });
    }
  }

  return { stations: [...stations.values()], readings, rejected };
}

export const ipma: Provider = {
  id: "ipma",
  // The file is written once an hour, about half past, with the hour before.
  schedule: "45 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const places = parseStations(yield* fetchJson(`${API_URL}/stations.json`));
    if (places instanceof FormatError) return yield* places;
    const snapshot = parseObservations(yield* fetchJson(`${API_URL}/observations.json`), places);
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
