import { fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

// The open data of the Danish Meteorological Institute: the stations of Denmark, the Faroes and
// Greenland, a value every ten minutes. No key.
const API_URL = "https://opendataapi.dmi.dk/v2/metObs/collections";
const LICENSE_URL = "https://www.dmi.dk/friedata/guides-til-frie-data/vilkar-for-brug-af-data";
// The institute asks for these words under data shown as it gave them.
const ATTRIBUTION = "Kilde: DMI";

// The mean speed and the mean direction over the last ten minutes, and the highest three-second
// mean in them, which is the gust.
const SPEED = "wind_speed";
const DIRECTION = "wind_dir";
const GUST = "wind_max";
export const PARAMETERS = [SPEED, DIRECTION, GUST] as const;
type Parameter = (typeof PARAMETERS)[number];

// The last hour holds six values of a station, and every station of the network reports wind.
const LIMIT = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "dmi", message });
}

function featuresOf(json: unknown, what: string) {
  if (!isRecord(json) || json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
    return formatError(`the ${what} are not a collection of features`);
  }
  // The answer is cut at the limit, and another page follows: a station would then lose values.
  if (json.features.length >= LIMIT) return formatError(`the ${what} fill a whole page`);
  return json.features as unknown[];
}

type Place = { name: string; latitude: number; longitude: number };

/** Reads the stations in service now: their id, their name and their place. */
export function parseStations(json: unknown): Map<string, Place> | FormatError {
  const features = featuresOf(json, "stations");
  if (features instanceof FormatError) return features;

  const places = new Map<string, Place>();
  for (const feature of features) {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry))
      continue;
    const { stationId, name } = feature.properties;
    const coordinates = feature.geometry.coordinates;
    if (typeof stationId !== "string" || !Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates as unknown[];
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    if (!isPosition(latitude, longitude)) continue;
    places.set(stationId, {
      name: typeof name === "string" ? name.trim() : "",
      latitude,
      longitude,
    });
  }
  return places;
}

/**
 * Reads the values of the last hour, one collection per parameter, into readings: one per
 * station and moment that has a speed. Speeds are in metres per second, and the direction is
 * where the wind comes from.
 */
export function parseObservations(
  collections: Readonly<Record<Parameter, unknown>>,
  places: ReadonlyMap<string, Place>,
): Snapshot | FormatError {
  // The values of each moment of a station, by parameter.
  const moments = new Map<
    string,
    { stationId: string; observedAt: Date } & Partial<Record<Parameter, number>>
  >();
  let rejected = 0;

  for (const parameter of PARAMETERS) {
    const features = featuresOf(collections[parameter], `values of ${parameter}`);
    if (features instanceof FormatError) return features;

    for (const feature of features) {
      const properties = isRecord(feature) ? feature.properties : undefined;
      if (!isRecord(properties)) {
        rejected += 1;
        continue;
      }
      const { stationId, observed, value } = properties;
      const observedAt = typeof observed === "string" ? parseZonedTime(observed) : null;
      if (typeof stationId !== "string" || !observedAt || typeof value !== "number") {
        rejected += 1;
        continue;
      }
      const key = `${stationId} ${observedAt.toISOString()}`;
      const moment = moments.get(key) ?? { stationId, observedAt };
      moment[parameter] = value;
      moments.set(key, moment);
    }
  }

  const stations = new Map<string, StationInput>();
  const readings: ReadingInput[] = [];

  for (const moment of moments.values()) {
    if (moment[SPEED] === undefined) continue;
    // A station that left the list of those in service is no longer where it was.
    const place = places.get(moment.stationId);
    if (!place) continue;
    const windSpeedMs = plausible("windSpeedMs", moment[SPEED]);
    if (windSpeedMs === null) {
      rejected += 1;
      continue;
    }
    const gust = moment[GUST];
    const direction = moment[DIRECTION];

    stations.set(moment.stationId, {
      providerStationId: moment.stationId,
      name: place.name || `Station ${moment.stationId}`,
      latitude: place.latitude,
      longitude: place.longitude,
      licenseType: "cc-by-4.0",
      licenseUrl: LICENSE_URL,
      attribution: ATTRIBUTION,
      commercialUse: true,
    });
    readings.push({
      providerStationId: moment.stationId,
      observedAt: moment.observedAt,
      windSpeedMs,
      windGustMs: gust === undefined ? null : plausible("windGustMs", gust),
      // A calm wind is written with the direction 0, which is no direction.
      windDirectionDeg:
        direction === undefined || windSpeedMs === 0
          ? null
          : plausible("windDirectionDeg", direction),
    });
  }

  return { stations: [...stations.values()], readings, rejected };
}

const observationsUrl = (parameter: Parameter) =>
  `${API_URL}/observation/items?parameterId=${parameter}&period=latest-hour&limit=${LIMIT}`;

export const dmi: Provider = {
  id: "dmi",
  // A value every ten minutes, out less than a minute after its moment. Some stations send
  // theirs later, which the next run, asking for the last hour again, takes in.
  schedule: "2-59/10 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    // The stations in service at this moment: the list keeps each station's earlier versions.
    const now = `${new Date().toISOString().slice(0, 19)}Z`;
    const places = parseStations(
      yield* fetchJson(`${API_URL}/station/items?status=Active&datetime=${now}&limit=${LIMIT}`),
    );
    if (places instanceof FormatError) return yield* places;

    const collections = {} as Record<Parameter, unknown>;
    for (const parameter of PARAMETERS) {
      collections[parameter] = yield* fetchJson(observationsUrl(parameter));
    }
    const snapshot = parseObservations(collections, places);
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
