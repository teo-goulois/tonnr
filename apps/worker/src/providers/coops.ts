import { fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { utcDate } from "./utc-date";

// NOAA's tide stations, CO-OPS, whose meteorological sensors stand on the shore itself: the list
// of the stations that have them, then the last hour of each one's wind, one station a request.
const STATIONS_URL =
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=met";
const DATA_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const TERMS_URL = "https://tidesandcurrents.noaa.gov/disclaimers.html";
// The API asks each program to name itself.
const APPLICATION = "tonnr";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "coops", message });
}

type Place = { id: string; name: string; latitude: number; longitude: number };

/** Reads the stations with meteorological sensors: their id, name and place. */
export function parseStations(json: unknown): Place[] | FormatError {
  if (!isRecord(json) || !Array.isArray(json.stations)) {
    return formatError("the list has no stations");
  }
  const places: Place[] = [];
  for (const entry of json.stations) {
    if (!isRecord(entry)) continue;
    const { id, name, lat: latitude, lng: longitude } = entry;
    if (typeof id !== "string" || !/^\w+$/.test(id)) continue;
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    if (!isPosition(latitude, longitude)) continue;
    places.push({ id, name: typeof name === "string" ? name.trim() : "", latitude, longitude });
  }
  return places;
}

const number = (text: unknown) =>
  typeof text === "string" && text.trim() !== "" ? Number(text) : Number.NaN;

/**
 * Reads the wind of one station: a value every six minutes, in metres per second, with its gust
 * and the direction where the wind comes from. The values are preliminary, not quality-checked.
 * A station whose sensors give no wind answers with an error, which is no reading.
 */
export function parseWind(json: unknown, place: Place): Snapshot | FormatError {
  if (isRecord(json) && json.error !== undefined)
    return { stations: [], readings: [], rejected: 0 };
  if (!isRecord(json) || !Array.isArray(json.data)) {
    return formatError(`the wind of ${place.id} has no data`);
  }

  const readings: ReadingInput[] = [];
  let rejected = 0;
  for (const row of json.data) {
    const time = isRecord(row) && typeof row.t === "string" ? row.t : "";
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(time);
    const observedAt = match
      ? utcDate(...(match.slice(1).map(Number) as [number, number, number, number, number]))
      : null;
    if (!isRecord(row) || !observedAt) {
      rejected += 1;
      continue;
    }
    // The flags say that the speed passed the sensor's highest, or changed faster than wind does.
    if (typeof row.f === "string" && row.f.includes("1")) continue;
    const speed = number(row.s);
    // A value the station did not measure is written as an empty text.
    if (Number.isNaN(speed)) continue;
    const windSpeedMs = plausible("windSpeedMs", speed);
    if (windSpeedMs === null) {
      rejected += 1;
      continue;
    }
    const gust = number(row.g);
    const direction = number(row.d);

    readings.push({
      providerStationId: place.id,
      observedAt,
      windSpeedMs,
      windGustMs: Number.isNaN(gust) ? null : plausible("windGustMs", gust),
      windDirectionDeg:
        Number.isNaN(direction) || windSpeedMs === 0
          ? null
          : plausible("windDirectionDeg", direction),
    });
  }

  const stations: StationInput[] =
    readings.length === 0
      ? []
      : [
          {
            providerStationId: place.id,
            name: place.name || `Station ${place.id}`,
            latitude: place.latitude,
            longitude: place.longitude,
            licenseType: "public-domain",
            licenseUrl: TERMS_URL,
            attribution: "NOAA CO-OPS",
            commercialUse: true,
          },
        ];
  return { stations, readings, rejected };
}

const windUrl = (id: string) =>
  `${DATA_URL}?range=1&station=${id}&product=wind&units=metric&time_zone=gmt&format=json&application=${APPLICATION}`;

export const coops: Provider = {
  id: "coops",
  // A value every six minutes. A run asks for the last hour of every station, three hundred
  // requests, so it comes every half hour and keeps every value.
  schedule: "11,41 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const places = parseStations(yield* fetchJson(STATIONS_URL));
    if (places instanceof FormatError) return yield* places;

    // Two at a time, to stay light on a public service.
    const snapshots = yield* Effect.forEach(
      places,
      (place) =>
        Effect.gen(function* () {
          const snapshot = parseWind(yield* fetchJson(windUrl(place.id)), place);
          if (snapshot instanceof FormatError) return yield* snapshot;
          return snapshot;
        }).pipe(
          Effect.catch((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`coops: skipped station ${place.id}`, error);
              return null;
            }),
          ),
        ),
      { concurrency: 2 },
    );

    const read = snapshots.filter((snapshot) => snapshot !== null);
    if (places.length > 0 && read.length === 0) {
      return yield* formatError("no station's wind could be read");
    }
    return {
      stations: read.flatMap((snapshot) => snapshot.stations),
      readings: read.flatMap((snapshot) => snapshot.readings),
      rejected: read.reduce((sum, snapshot) => sum + snapshot.rejected, 0),
    };
  }),
};
