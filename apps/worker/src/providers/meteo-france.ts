import { fetchBytes, fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

export const METEO_FRANCE_ID = "meteofrance";

// The package of observations: every station of the network at one moment.
const API_URL = "https://public-api.meteofrance.fr/public/DPPaquetObs/v2";
const LICENSE_URL = "https://www.etalab.gouv.fr/licence-ouverte-open-licence/";

const SLOT_MS = 6 * 60 * 1000;
// The package of a moment is written three minutes after it, with nine wind stations in ten,
// and again six minutes later with the rest. Half a minute is left for it to be there.
const FIRST_PACKAGE_MS = 3.5 * 60 * 1000;
// The list of stations weighed 140 kB on 2026-10-11.
const MAX_LIST_BYTES = 4 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

/**
 * The two moments to ask for: the latest whose first package is out, and the one before it,
 * whose package is complete by then. A station that was late for a run is in the next one.
 */
export function slotsToAsk(now: Date): [latest: Date, previous: Date] {
  const latest = Math.floor((now.getTime() - FIRST_PACKAGE_MS) / SLOT_MS) * SLOT_MS;
  return [new Date(latest), new Date(latest - SLOT_MS)];
}

// The words a French place name writes in small letters when they are not its first.
const SMALL_WORDS = new Set([
  "a",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "en",
  "et",
  "l",
  "la",
  "le",
  "les",
  "sous",
  "sur",
]);

/**
 * The network writes a name in capitals, with an underscore before some suffixes: `PTE DU RAZ`,
 * `BELLE-ILE_AERO`. It is stored as a place name is written: `Pte du Raz`, `Belle-Ile Aero`.
 */
export function stationName(written: string) {
  let isFirst = true;
  return written
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\p{L}[\p{L}\p{N}]*/gu, (word) => {
      const isSmall = !isFirst && SMALL_WORDS.has(word);
      isFirst = false;
      return isSmall ? word : word.charAt(0).toUpperCase() + word.slice(1);
    });
}

/**
 * Reads the list of stations, a text with a line per station and semicolons between its
 * fields, and gives the name of each station by its number. The package names none.
 */
export function parseStationNames(text: string): Map<string, string> | FormatError {
  const [header = "", ...lines] = text.split(/\r?\n/);
  const columns = header.split(";").map((column) => column.trim());
  const idColumn = columns.indexOf("Id_station");
  const nameColumn = columns.indexOf("Nom_usuel");
  if (idColumn < 0 || nameColumn < 0) {
    return new FormatError({
      provider: METEO_FRANCE_ID,
      message: "the list of stations has no column for a station's number or for its name",
    });
  }

  const names = new Map<string, string>();
  for (const line of lines) {
    const fields = line.split(";");
    const id = fields[idColumn]?.trim() ?? "";
    const name = fields[nameColumn]?.trim() ?? "";
    if (id !== "" && name !== "") names.set(id, name);
  }
  return names;
}

/**
 * Reads the package of one moment: a list with an entry per station. Speeds are in metres per
 * second, averaged over ten minutes, and the gust is the strongest of those ten minutes. A
 * station without a wind speed has no anemometer, or sent nothing for that moment.
 */
export function parseObservations(
  json: unknown,
  names: ReadonlyMap<string, string>,
): Snapshot | FormatError {
  if (!Array.isArray(json)) {
    return new FormatError({
      provider: METEO_FRANCE_ID,
      message: "the package is not a list of stations",
    });
  }

  const stations: StationInput[] = [];
  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const entry of json) {
    if (!isRecord(entry)) {
      rejected += 1;
      continue;
    }

    const speed = numberOrNull(entry.ff);
    if (speed === null) continue;

    const id = typeof entry.geo_id_insee === "string" ? entry.geo_id_insee.trim() : "";
    const latitude = numberOrNull(entry.lat);
    const longitude = numberOrNull(entry.lon);
    const observedAt =
      typeof entry.validity_time === "string" ? parseZonedTime(entry.validity_time) : null;
    const windSpeedMs = plausible("windSpeedMs", speed);
    if (
      id === "" ||
      latitude === null ||
      longitude === null ||
      !isPosition(latitude, longitude) ||
      !observedAt ||
      windSpeedMs === null
    ) {
      rejected += 1;
      continue;
    }

    const gust = numberOrNull(entry.raf10);
    const direction = numberOrNull(entry.dd);
    const name = names.get(id);

    stations.push({
      providerStationId: id,
      name: name ? stationName(name) : `Station ${id}`,
      latitude,
      longitude,
      licenseType: "etalab-2.0",
      licenseUrl: LICENSE_URL,
      attribution: "Météo-France",
      commercialUse: true,
    });
    readings.push({
      providerStationId: id,
      observedAt,
      windSpeedMs,
      windGustMs: gust === null ? null : plausible("windGustMs", gust),
      // A direction of 0 is how the network writes a calm wind. North is 360.
      windDirectionDeg:
        direction === null || direction === 0 ? null : plausible("windDirectionDeg", direction),
    });
  }

  return { stations, readings, rejected };
}

/** One snapshot of the packages of several moments, with each station once. */
export function mergeSnapshots(snapshots: readonly Snapshot[]): Snapshot {
  const stations = new Map<string, StationInput>();
  for (const snapshot of snapshots) {
    for (const station of snapshot.stations) {
      if (!stations.has(station.providerStationId))
        stations.set(station.providerStationId, station);
    }
  }

  return {
    stations: [...stations.values()],
    readings: snapshots.flatMap((snapshot) => snapshot.readings),
    rejected: snapshots.reduce((sum, snapshot) => sum + snapshot.rejected, 0),
  };
}

// The API takes a moment without a fraction of a second.
const asked = (slot: Date) => `${slot.toISOString().slice(0, 19)}Z`;

/**
 * Météo-France's stations on land, for their wind. Its API asks for the key of an account, so
 * an instance fetches from it only when it holds one: decision 032.
 */
export function meteoFrance(apiKey: string): Provider {
  const headers = { apikey: apiKey };

  return {
    id: METEO_FRANCE_ID,
    // A station reports every six minutes, and a package is out three minutes after its moment.
    schedule: "4-59/6 * * * *",
    fetchSnapshot: Effect.gen(function* () {
      const list = yield* fetchBytes(`${API_URL}/liste-stations`, MAX_LIST_BYTES, headers);
      // The API says it writes the list in Latin-1.
      const names = parseStationNames(new TextDecoder("latin1").decode(list));
      if (names instanceof FormatError) return yield* names;

      const snapshots: Snapshot[] = [];
      for (const slot of slotsToAsk(new Date())) {
        const url = `${API_URL}/paquet/stations/infrahoraire-6m?date=${encodeURIComponent(asked(slot))}&format=json`;
        // The package of a moment that is not out yet is an empty list, and no error.
        const snapshot = parseObservations(yield* fetchJson(url, headers), names);
        if (snapshot instanceof FormatError) return yield* snapshot;
        snapshots.push(snapshot);
      }
      return mergeSnapshots(snapshots);
    }),
  };
}
