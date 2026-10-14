import { fetchBytes, fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

export const AEMET_ID = "aemet";

// AEMET OpenData, the open data of Spain's weather agency. A first request, with the key of an
// account, answers where the data waits; a second fetches it from there: every automatic
// station of Spain and its islands, an hour at a time, over the last hours.
const API_URL = "https://opendata.aemet.es/opendata/api/observacion/convencional/todas";
const DATA_HOST = "opendata.aemet.es";
const TERMS_URL = "https://www.aemet.es/en/nota_legal";
// The agency's legal notice asks for these words, or for "Information prepared by the State
// Meteorological Agency".
const ATTRIBUTION = "© AEMET";
// The data of every station over the last hours weighs some megabytes.
const MAX_DATA_BYTES = 64 * 1024 * 1024;

const SMALL_WORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "d", "l"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: AEMET_ID, message });
}

/**
 * The agency writes a name in capitals: `SANTANDER AEROPUERTO`, `SAN SEBASTIÁN, IGUELDO`. It is
 * stored as a place name is written: `Santander Aeropuerto`, `San Sebastián, Igueldo`.
 */
export function stationName(written: string) {
  let isFirst = true;
  return written
    .trim()
    .toLowerCase()
    .replace(/\p{L}[\p{L}\p{N}]*/gu, (word) => {
      const isSmall = !isFirst && SMALL_WORDS.has(word);
      isFirst = false;
      return isSmall ? word : word.charAt(0).toUpperCase() + word.slice(1);
    });
}

/**
 * Reads the first answer: where the data waits. The agency says in it whether it served the
 * request, with a status of its own, 200 when it did.
 */
export function parseDataAddress(json: unknown): string | FormatError {
  if (!isRecord(json)) return formatError("the answer is not an object");
  if (json.estado !== 200) {
    const said = typeof json.descripcion === "string" ? json.descripcion.slice(0, 120) : "";
    return formatError(`the agency answered ${String(json.estado)}: ${said}`);
  }
  if (typeof json.datos !== "string") return formatError("the answer names no data");
  // The address comes from the answer, so it is read only on the agency's own host.
  let address: URL;
  try {
    address = new URL(json.datos);
  } catch {
    return formatError("the address of the data does not read");
  }
  if (address.protocol !== "https:" || address.hostname !== DATA_HOST) {
    return formatError(`the data waits on another host, ${address.hostname}`);
  }
  return address.toString();
}

/**
 * The data is written in ISO-8859-15, as the agency's answer says. Text that is valid UTF-8 is
 * read as such, should the agency change it.
 */
export function decodeData(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-15").decode(bytes);
  }
}

/**
 * Reads the end of an hour of observation, which is in UTC: `2026-10-14T13:00:00+0000` as the
 * agency writes it, or with no zone, or with one written `+00:00` or `Z`.
 */
export function endOf(text: unknown) {
  if (typeof text !== "string") return null;
  const written = text.trim();
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(written)
    ? `${written}Z`
    : written.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  return parseZonedTime(zoned);
}

const numberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Reads the observations: one entry per station and hour. The wind is `vv`, the mean over the
 * ten minutes before `fint`, in metres per second, `dv`, its mean direction, and `vmax`, the
 * strongest three seconds of the hour before, which is the gust. A station with no anemometer
 * has no `vv`.
 */
export function parseObservations(json: unknown): Snapshot | FormatError {
  if (!Array.isArray(json)) return formatError("the observations are not a list");

  const stations = new Map<string, StationInput>();
  const readings: ReadingInput[] = [];
  let rejected = 0;
  // What the first row that could not be read held, to say what changed when none could be.
  let firstRejected: unknown;

  for (const entry of json) {
    if (!isRecord(entry)) {
      rejected += 1;
      firstRejected ??= entry;
      continue;
    }
    const speed = numberOrNull(entry.vv);
    if (speed === null) continue;

    const id = entry.idema;
    const observedAt = endOf(entry.fint);
    const latitude = numberOrNull(entry.lat);
    const longitude = numberOrNull(entry.lon);
    if (
      typeof id !== "string" ||
      !/^\w+$/.test(id) ||
      !observedAt ||
      latitude === null ||
      longitude === null ||
      !isPosition(latitude, longitude)
    ) {
      rejected += 1;
      firstRejected ??= entry;
      continue;
    }
    const windSpeedMs = plausible("windSpeedMs", speed);
    if (windSpeedMs === null) {
      rejected += 1;
      firstRejected ??= entry;
      continue;
    }
    const gust = numberOrNull(entry.vmax);
    const direction = numberOrNull(entry.dv);

    if (!stations.has(id)) {
      stations.set(id, {
        providerStationId: id,
        name: typeof entry.ubi === "string" && entry.ubi.trim() ? stationName(entry.ubi) : id,
        latitude,
        longitude,
        licenseType: "aemet-terms",
        licenseUrl: TERMS_URL,
        attribution: ATTRIBUTION,
        commercialUse: true,
      });
    }
    readings.push({
      providerStationId: id,
      observedAt,
      windSpeedMs,
      windGustMs: gust === null ? null : plausible("windGustMs", gust),
      // A calm wind has no direction.
      windDirectionDeg:
        direction === null || windSpeedMs === 0 ? null : plausible("windDirectionDeg", direction),
    });
  }

  if (readings.length === 0 && rejected > 0) {
    const shown = isRecord(firstRejected)
      ? ["idema", "fint", "lat", "lon", "vv"].map(
          (key) => `${key} ${JSON.stringify(firstRejected[key])}`,
        )
      : [JSON.stringify(firstRejected)];
    return formatError(
      `all ${rejected} rows were rejected, the first with ${shown.join(", ").slice(0, 200)}`,
    );
  }

  return { stations: [...stations.values()], readings, rejected };
}

/**
 * The stations of AEMET, for their wind. Its API asks for the key of an account, so an instance
 * fetches from it only when it holds one: decision 032.
 */
export function aemet(apiKey: string): Provider {
  return {
    id: AEMET_ID,
    // A station reports once an hour, and the run asks again for the hours before.
    schedule: "50 * * * *",
    fetchSnapshot: Effect.gen(function* () {
      // The key travels in a header: the address of a request is kept in an error.
      const address = parseDataAddress(yield* fetchJson(API_URL, { api_key: apiKey }));
      if (address instanceof FormatError) return yield* address;
      const text = decodeData(yield* fetchBytes(address, MAX_DATA_BYTES));
      const json = yield* Effect.try({
        try: (): unknown => JSON.parse(text),
        catch: () => formatError("the observations are not JSON"),
      });
      const snapshot = parseObservations(json);
      if (snapshot instanceof FormatError) return yield* snapshot;
      return snapshot;
    }),
  };
}
