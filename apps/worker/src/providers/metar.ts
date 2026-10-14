import { gunzipSync } from "node:zlib";

import { fetchBytes } from "@repo/upstream";
import { Effect } from "effect";

import { parseCsv } from "./csv";
import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

// The reports of the world's airports, METAR, as the Aviation Weather Center of the United
// States keeps them: the last report of every airport in one file, written again every minute,
// and the airports' names in another.
const CACHE_URL = "https://aviationweather.gov/data/cache";
const LICENSE_URL = "https://aviationweather.gov/data/api/";
const ATTRIBUTION = "NOAA Aviation Weather Center";
// The files weigh 250 kB and 360 kB compressed, and some five and twelve times that once open.
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_OPEN_BYTES = 64 * 1024 * 1024;

const MS_PER_KNOT = 1852 / 3600;
// A report older than this is not the wind now: some airports stop reporting for the night.
const SILENT_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "metar", message });
}

/** Opens a compressed file. The files of the cache are compressed whole, not on the way. */
export function openFile(bytes: Uint8Array) {
  const isCompressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
  try {
    const open = isCompressed ? gunzipSync(bytes, { maxOutputLength: MAX_OPEN_BYTES }) : bytes;
    return new TextDecoder().decode(open);
  } catch {
    return formatError("a file of the cache does not open, or is too large");
  }
}

/** Reads the airports' names, by the code that the reports name them with. */
export function parseStationNames(json: unknown): Map<string, string> | FormatError {
  if (!Array.isArray(json)) return formatError("the list of the airports is not a list");

  const names = new Map<string, string>();
  for (const entry of json) {
    if (!isRecord(entry) || typeof entry.icaoId !== "string") continue;
    if (typeof entry.site === "string" && entry.site.trim()) {
      names.set(entry.icaoId, entry.site.trim());
    }
  }
  return names;
}

/**
 * Reads the last report of every airport: the wind in knots, a mean over ten minutes, or two in
 * the United States, its direction where it comes from, and a gust when the report has one. A
 * direction of 0 is a calm, or a variable wind.
 */
export function parseReports(
  text: string,
  names: ReadonlyMap<string, string>,
  now = new Date(),
): Snapshot | FormatError {
  // The file is compressed whole, so a file that opened was not cut, and its last line ends
  // with no line break.
  const [header, ...rows] = parseCsv(text.endsWith("\n") ? text : `${text}\n`);
  if (!header) return formatError("the reports have no header");
  // A name may be written several times, as the layers of the sky are: the first one counts.
  const column = (name: string) => header.indexOf(name);
  const columns = {
    id: column("station_id"),
    time: column("observation_time"),
    latitude: column("latitude"),
    longitude: column("longitude"),
    direction: column("wind_dir_degrees"),
    speed: column("wind_speed_kt"),
    gust: column("wind_gust_kt"),
  };
  if (Object.values(columns).some((index) => index < 0)) {
    return formatError(`the header of the reports is "${header.join(",").slice(0, 120)}"`);
  }

  const stations: StationInput[] = [];
  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const row of rows) {
    if (!row) {
      rejected += 1;
      continue;
    }
    const field = (index: number) => row[index] ?? "";
    // A report without wind says nothing this provider keeps.
    if (field(columns.speed) === "") continue;

    const id = field(columns.id);
    const observedAt = parseZonedTime(field(columns.time));
    const latitude = Number(field(columns.latitude));
    const longitude = Number(field(columns.longitude));
    const speed = Number(field(columns.speed));
    if (
      !/^\w+$/.test(id) ||
      !observedAt ||
      field(columns.latitude) === "" ||
      field(columns.longitude) === "" ||
      !isPosition(latitude, longitude)
    ) {
      rejected += 1;
      continue;
    }
    if (now.getTime() - observedAt.getTime() > SILENT_MS) continue;
    const windSpeedMs = plausible("windSpeedMs", speed * MS_PER_KNOT);
    if (windSpeedMs === null) {
      rejected += 1;
      continue;
    }
    const gust = field(columns.gust) === "" ? null : Number(field(columns.gust));
    const direction = field(columns.direction) === "" ? null : Number(field(columns.direction));

    stations.push({
      providerStationId: id,
      name: names.get(id) ?? id,
      latitude,
      longitude,
      licenseType: "public-domain",
      licenseUrl: LICENSE_URL,
      attribution: ATTRIBUTION,
      commercialUse: true,
    });
    readings.push({
      providerStationId: id,
      observedAt,
      windSpeedMs,
      windGustMs: gust === null ? null : plausible("windGustMs", gust * MS_PER_KNOT),
      // The north is written 360.
      windDirectionDeg:
        direction === null || direction === 0 ? null : plausible("windDirectionDeg", direction),
    });
  }

  return { stations, readings, rejected };
}

export const metar: Provider = {
  id: "metar",
  // An airport reports every hour or every half hour, and more often when the weather turns.
  schedule: "3-59/20 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const list = openFile(
      yield* fetchBytes(`${CACHE_URL}/stations.cache.json.gz`, MAX_COMPRESSED_BYTES),
    );
    if (list instanceof FormatError) return yield* list;
    const json = yield* Effect.try({
      try: (): unknown => JSON.parse(list),
      catch: () => formatError("the list of the airports is not JSON"),
    });
    const names = parseStationNames(json);
    if (names instanceof FormatError) return yield* names;

    const reports = openFile(
      yield* fetchBytes(`${CACHE_URL}/metars.cache.csv.gz`, MAX_COMPRESSED_BYTES),
    );
    if (reports instanceof FormatError) return yield* reports;
    const snapshot = parseReports(reports, names);
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
