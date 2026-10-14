import { fetchJson, fetchText } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

// AMeDAS, the network of automatic stations of the Japan Meteorological Agency, as the agency's
// own map reads it: the time of the last values, then every station at that time in one file.
const AMEDAS_URL = "https://www.jma.go.jp/bosai/amedas";
const LICENSE_URL = "https://www.jma.go.jp/jma/en/copyright.html";
// The agency asks that the page the data comes from be named.
const ATTRIBUTION =
  "Source: Japan Meteorological Agency website (https://www.jma.go.jp/bosai/map.html#contents=amedas)";

// A direction is one of sixteen points, 1 for north-northeast to 16 for north. 0 is a calm.
const DEGREES_PER_POINT = 22.5;
// Each value comes with a flag, 0 when the agency had nothing to say against it.
const NORMAL = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "jma", message });
}

/** A value and its flag, as `[10.7, 0]`, or null when it is missing or flagged. */
function normalValue(pair: unknown) {
  if (!Array.isArray(pair) || typeof pair[0] !== "number") return null;
  return pair[1] === NORMAL ? pair[0] : null;
}

/** A latitude or a longitude written as degrees and minutes, as `[45, 31.2]`. */
function degreesOf(pair: unknown) {
  if (!Array.isArray(pair) || typeof pair[0] !== "number" || typeof pair[1] !== "number") {
    return null;
  }
  // A tenth of a minute is less than a fifth of a kilometre: five decimals keep it.
  return Math.round((pair[0] + pair[1] / 60) * 100_000) / 100_000;
}

type Place = { name: string; latitude: number; longitude: number };

/** Reads the table of the stations: their name in English, or in Japanese, and their place. */
export function parseStationTable(json: unknown): Map<string, Place> | FormatError {
  if (!isRecord(json)) return formatError("the table of the stations is not an object");

  const places = new Map<string, Place>();
  for (const [id, entry] of Object.entries(json)) {
    if (!isRecord(entry)) continue;
    const latitude = degreesOf(entry.lat);
    const longitude = degreesOf(entry.lon);
    if (latitude === null || longitude === null || !isPosition(latitude, longitude)) continue;
    const name =
      typeof entry.enName === "string" && entry.enName.trim()
        ? entry.enName.trim()
        : typeof entry.kjName === "string"
          ? entry.kjName.trim()
          : "";
    places.set(id, { name, latitude, longitude });
  }
  return places;
}

/**
 * Reads the time of the last values, as `2026-10-14T22:40:00+09:00`, into the moment and the
 * name of its file, which is written in Japan's time: `20261014224000`.
 */
export function parseLatestTime(text: string) {
  const written = text.trim();
  const observedAt = parseZonedTime(written);
  if (!observedAt || !written.endsWith("+09:00")) {
    return formatError(`the time of the last values reads "${written.slice(0, 40)}"`);
  }
  return { observedAt, file: written.slice(0, 19).replace(/\D/g, "") };
}

/**
 * Reads the values of every station at one moment. Speeds are in metres per second, a mean
 * over ten minutes, and the direction is where the wind comes from.
 */
export function parseWindMap(
  json: unknown,
  observedAt: Date,
  places: ReadonlyMap<string, Place>,
): Snapshot | FormatError {
  if (!isRecord(json)) return formatError("the values of the stations are not an object");

  const stations: StationInput[] = [];
  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const [id, values] of Object.entries(json)) {
    // Most of the network measures the rain alone.
    if (!isRecord(values) || values.wind === undefined) continue;
    const place = places.get(id);
    const speed = normalValue(values.wind);
    if (!place || speed === null) continue;
    const windSpeedMs = plausible("windSpeedMs", speed);
    if (windSpeedMs === null) {
      rejected += 1;
      continue;
    }
    const point = normalValue(values.windDirection);

    stations.push({
      providerStationId: id,
      name: place.name || `Station ${id}`,
      latitude: place.latitude,
      longitude: place.longitude,
      licenseType: "pdl-1.0",
      licenseUrl: LICENSE_URL,
      attribution: ATTRIBUTION,
      commercialUse: true,
    });
    readings.push({
      providerStationId: id,
      observedAt,
      windSpeedMs,
      // The file holds no gust: the agency gives one for each station alone, the day's highest.
      windGustMs: null,
      windDirectionDeg:
        point === null || point === 0 || point > 16
          ? null
          : plausible("windDirectionDeg", point * DEGREES_PER_POINT),
    });
  }

  return { stations, readings, rejected };
}

export const jma: Provider = {
  id: "jma",
  // A value every ten minutes, out about six minutes after its time.
  schedule: "7-59/10 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const latest = parseLatestTime(yield* fetchText(`${AMEDAS_URL}/data/latest_time.txt`));
    if (latest instanceof FormatError) return yield* latest;
    const places = parseStationTable(yield* fetchJson(`${AMEDAS_URL}/const/amedastable.json`));
    if (places instanceof FormatError) return yield* places;

    const values = yield* fetchJson(`${AMEDAS_URL}/data/map/${latest.file}.json`);
    const snapshot = parseWindMap(values, latest.observedAt, places);
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
