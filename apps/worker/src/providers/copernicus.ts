import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import { fetchBytes, fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { isObservationTime } from "./utc-date";

// The Copernicus Marine Service gathers the measurements of Europe's national networks under one
// licence. This product covers the seas from Ireland to the Canaries, and Tonn reads its
// moorings: the buoys of Spain, the Netherlands, Belgium, the English coasts, and others.
const PRODUCT_URL =
  "https://stac.marine.copernicus.eu/metadata/INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033/product.stac.json";
const PRODUCT_DOI = "https://doi.org/10.48670/moi-00043";
const LICENCE_URL = "https://marine.copernicus.eu/user-corner/service-commitments-and-licence";

// The last twelve hours. A measurement shows up one to two hours after its time.
const WINDOW_MS = 12 * 60 * 60 * 1000;
// A mooring is a platform of this type, and its identifier ends with the type.
const MOORING = "MO";

// Each variable with the measurement it feeds and the unit the parser was written for. A change
// of unit would store wrong values silently. A measurement takes the first variable that has a
// value: the zero-crossing period before the spectral mean period.
const VARIABLES: readonly { name: string; measurement: Measurement; unit: string }[] = [
  { name: "VHM0", measurement: "significantHeightM", unit: "m" },
  { name: "VZMX", measurement: "maxHeightM", unit: "m" },
  { name: "VTPK", measurement: "peakPeriodS", unit: "s" },
  { name: "VTZA", measurement: "meanPeriodS", unit: "s" },
  { name: "VTM02", measurement: "meanPeriodS", unit: "s" },
  // The direction at the spectral peak, where the waves come from, counted from true north.
  { name: "VPED", measurement: "peakDirectionDeg", unit: "degree" },
  { name: "VPSP", measurement: "directionalSpreadDeg", unit: "degree" },
  { name: "TEMP", measurement: "waterTemperatureC", unit: "degrees_C" },
];
// The wind of these moorings is left out for now. It comes at other moments than the waves, so
// a mooring's latest reading would often be one of wind alone, with no wave height to show.
// Without this one a run has nothing to store.
const REQUIRED_VARIABLE = "VHM0";

// The quality flags of the in-situ products: 0 for no check, 1 good, 2 probably good, then
// 3 to 9 for values that are bad, changed, unused, nominal, interpolated, or missing.
const USABLE_FLAGS = new Set([0, 1, 2]);
const KNOWN_FLAGS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

// Buoys that Tonn already reads from their owner or through another provider, which would
// otherwise show twice. The institutions are written as the index of platforms writes them.
const READ_ELSEWHERE = {
  institutions: new Set([
    "Marine Institute",
    "Met Eireann;Commissioners of Irish Lights",
    // NDBC relays the Met Office's buoys.
    "Met Office- Exeter",
    "Met Office Exeter",
  ]),
  // The index lists these two buoys of the Instituto Hidrográfico under Puertos del Estado.
  platforms: new Set(["Leixoes-coast-buoy", "Sines-coast-buoy"]),
};

export type Layout = {
  // Where the files of one variable for every platform are.
  filesUrl: string;
  platformsUrl: string;
  // A file holds a stretch of time. Its number counts the stretches since this moment.
  timeOriginS: number;
  stretchS: Record<string, number>;
};

export type Row = {
  platformId: string;
  platformType: string;
  timeS: number;
  longitude: number;
  latitude: number;
  elevation: number;
  value: number | null;
  flag: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "copernicus", message });
}

/** Finds, in the product's record, the record of its dataset of latest measurements. */
export function parseProduct(json: unknown): string | FormatError {
  const links = isRecord(json) && Array.isArray(json.links) ? json.links : [];
  const latest = links.filter(
    (link) => isRecord(link) && link.rel === "item" && link.title === "Latest",
  );
  const href = isRecord(latest[0]) ? latest[0].href : undefined;
  if (latest.length !== 1 || typeof href !== "string") {
    return formatError("the product does not name one dataset of latest measurements");
  }
  return new URL(href, PRODUCT_URL).href;
}

/** Reads, from the dataset's record, where its files are and how they are cut in time. */
export function parseDataset(json: unknown): Layout | FormatError {
  const assets = isRecord(json) && isRecord(json.assets) ? json.assets : {};
  const files = isRecord(assets.timeChunked) ? assets.timeChunked : {};
  const platforms = isRecord(assets.platforms) ? assets.platforms : {};
  const dimensions = isRecord(files.viewDims) ? files.viewDims : {};
  const time = isRecord(dimensions.time) ? dimensions.time : {};
  const lengths = isRecord(time.chunkLen) ? time.chunkLen : {};
  const properties = isRecord(json) && isRecord(json.properties) ? json.properties : {};
  const described = isRecord(properties["cube:variables"]) ? properties["cube:variables"] : {};

  if (
    typeof files.href !== "string" ||
    typeof platforms.href !== "string" ||
    typeof time.chunkRefCoord !== "number" ||
    time.chunkType !== "default"
  ) {
    return formatError("the dataset does not say where its files are or how they are cut in time");
  }
  // The files are named by four numbers: time, depth, longitude, latitude. Only time is read
  // here, so the two horizontal ones must stay uncut.
  for (const axis of ["longitude", "latitude"]) {
    const cut = isRecord(dimensions[axis]) ? dimensions[axis].chunkLen : undefined;
    if (!isRecord(cut) || VARIABLES.some(({ name }) => cut[name] !== null)) {
      return formatError(`the files of the dataset are now cut by ${axis}`);
    }
  }

  const stretchS: Record<string, number> = {};
  for (const { name, unit } of VARIABLES) {
    const variable = described[name];
    const written = isRecord(variable) ? variable.unit : undefined;
    if (written !== unit) return formatError(`${name} is in "${String(written)}", not "${unit}"`);

    const length = lengths[name];
    if (typeof length !== "number" || !(length > 0)) {
      return formatError(`the dataset does not say how the files of ${name} are cut in time`);
    }
    stretchS[name] = length;
  }

  return {
    filesUrl: files.href,
    platformsUrl: platforms.href,
    timeOriginS: time.chunkRefCoord,
    stretchS,
  };
}

/** The files of one variable that hold the window ending now: one, or two across a cut. */
export function fileUrls(layout: Layout, variable: string, now: Date) {
  const stretch = layout.stretchS[variable] ?? Number.NaN;
  const number = (ms: number) => Math.floor((ms / 1000 - layout.timeOriginS) / stretch);
  const first = number(now.getTime() - WINDOW_MS);
  const last = number(now.getTime());

  const urls: string[] = [];
  for (let index = first; index <= last; index += 1) {
    // Depth, longitude, and latitude: the surface, and no cut.
    urls.push(`${layout.filesUrl}/${variable}/${index}.0.0.0.sqlite`);
  }
  return urls;
}

/**
 * Reads the index of platforms and returns the institution of each platform. The index is a
 * compressed file, which the store may already have decompressed on the way.
 */
export function parsePlatforms(bytes: Uint8Array): Map<string, string> | FormatError {
  let json: unknown;
  try {
    const isCompressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
    json = JSON.parse(new TextDecoder().decode(isCompressed ? gunzipSync(bytes) : bytes));
  } catch {
    return formatError("the index of platforms is not JSON");
  }

  const platforms = isRecord(json) && isRecord(json.platforms) ? json.platforms : null;
  const dicts = isRecord(json) && isRecord(json.dicts) ? json.dicts : {};
  const names = isRecord(dicts.inst) ? dicts.inst : null;
  if (!platforms || !names) return formatError("the index of platforms has no institutions");

  const institutions = new Map<string, string>();
  for (const [platformId, platform] of Object.entries(platforms)) {
    const reference = isRecord(platform) ? platform.inst : undefined;
    const name = typeof reference === "string" ? names[reference] : undefined;
    if (typeof name === "string" && name.trim() !== "") institutions.set(platformId, name.trim());
  }
  return institutions;
}

const COLUMNS = [
  "platform_id",
  "platform_type",
  "time",
  "longitude",
  "latitude",
  "elevation",
  "value",
  "value_qc",
];

/**
 * Reads a file of one variable: a SQLite database with one row per platform, time, and depth.
 * Returns the rows from `since` on, and how many rows it could not read.
 */
export function readFile(
  bytes: Uint8Array,
  variable: string,
  since: Date,
): { rows: Row[]; rejected: number } | FormatError {
  const database = new DatabaseSync(":memory:");
  try {
    database.deserialize(bytes);
    // The file comes from outside: it is only ever read, and `data` must be a plain table.
    database.enableDefensive(true);
    const table = database.prepare("select type from sqlite_schema where name = 'data'").get();
    const columns = database
      .prepare("select name from pragma_table_info('data')")
      .all()
      .map((column) => column.name);
    if (table?.type !== "table" || COLUMNS.some((column) => !columns.includes(column))) {
      return formatError(`the file of ${variable} does not have the table this parser reads`);
    }

    const rows: Row[] = [];
    let rejected = 0;
    const statement = database.prepare(
      `select ${COLUMNS.join(", ")} from data where time >= ? order by time`,
    );
    for (const row of statement.iterate(Math.floor(since.getTime() / 1000))) {
      const { platform_id, platform_type, time, longitude, latitude, elevation, value, value_qc } =
        row;
      if (
        typeof platform_id !== "string" ||
        typeof platform_type !== "string" ||
        typeof time !== "number" ||
        typeof longitude !== "number" ||
        typeof latitude !== "number" ||
        (elevation !== null && typeof elevation !== "number") ||
        (value !== null && typeof value !== "number") ||
        (value_qc !== null && typeof value_qc !== "number")
      ) {
        rejected += 1;
        continue;
      }
      rows.push({
        platformId: platform_id,
        platformType: platform_type,
        timeS: time,
        longitude,
        latitude,
        // A measurement at the surface may come without a depth.
        elevation: elevation ?? 0,
        value,
        flag: value_qc,
      });
    }
    return { rows, rejected };
  } catch {
    return formatError(`the file of ${variable} is not a database this parser can read`);
  } finally {
    database.close();
  }
}

/**
 * Builds the snapshot from the rows of each variable. A reading gathers, for one mooring and
 * moment, the value of every variable that has one.
 */
export function buildSnapshot(
  rowsByVariable: ReadonlyMap<string, readonly Row[]>,
  institutions: ReadonlyMap<string, string>,
  now = new Date(),
): Snapshot {
  const since = now.getTime() - WINDOW_MS;
  const readings = new Map<string, ReadingInput>();
  const positions = new Map<string, { at: number; latitude: number; longitude: number }>();
  let rejected = 0;

  for (const { name, measurement } of VARIABLES) {
    // The depth of the value already kept for a reading, to prefer the one nearest the surface.
    const depths = new Map<string, number>();

    for (const row of rowsByVariable.get(name) ?? []) {
      if (row.platformType !== MOORING || !row.platformId.endsWith(`___${MOORING}`)) continue;
      const code = row.platformId.slice(0, -`___${MOORING}`.length);
      if (
        READ_ELSEWHERE.platforms.has(code) ||
        READ_ELSEWHERE.institutions.has(institutions.get(row.platformId) ?? "")
      ) {
        continue;
      }

      const observedAt = new Date(row.timeS * 1000);
      if (
        code === "" ||
        !Number.isInteger(row.timeS) ||
        !isObservationTime(observedAt) ||
        !isPosition(row.latitude, row.longitude) ||
        (row.flag !== null && !KNOWN_FLAGS.has(row.flag))
      ) {
        rejected += 1;
        continue;
      }
      if (observedAt.getTime() < since) continue;
      // The sea is measured at the surface or under it. A value above it is another instrument's.
      if (row.elevation > 0) continue;

      const key = `${code} ${row.timeS}`;
      const reading = readings.get(key) ?? { providerStationId: code, observedAt };
      // A value without a flag is kept as one nobody checked.
      const usable = row.flag === null || USABLE_FLAGS.has(row.flag);
      const value = row.value !== null && usable ? plausible(measurement, row.value) : null;

      const depth = depths.get(key);
      const isNearer = depth !== undefined && Math.abs(row.elevation) < Math.abs(depth);
      if (value !== null && (reading[measurement] == null || isNearer)) {
        reading[measurement] = value;
        depths.set(key, row.elevation);
      }
      readings.set(key, reading);

      const position = positions.get(code);
      if (!position || row.timeS > position.at) {
        positions.set(code, { at: row.timeS, latitude: row.latitude, longitude: row.longitude });
      }
    }
  }

  const kept = [...readings.values()].filter((reading) => reading.significantHeightM != null);
  const reporting = new Set(kept.map((reading) => reading.providerStationId));

  const stations: StationInput[] = [];
  for (const [code, position] of positions) {
    if (!reporting.has(code)) continue;
    const institution = institutions.get(`${code}___${MOORING}`);
    stations.push({
      providerStationId: code,
      // The product names a mooring by its code alone.
      name: code,
      latitude: position.latitude,
      longitude: position.longitude,
      licenseType: "copernicus-marine",
      licenseUrl: LICENCE_URL,
      // The credit the licence asks for, after the institution that owns the mooring.
      attribution:
        `${institution ? `${institution}. ` : ""}Generated using E.U. Copernicus Marine Service ` +
        `Information; ${PRODUCT_DOI}`,
      commercialUse: true,
    });
  }

  return { stations, readings: kept, rejected };
}

export const copernicus: Provider = {
  id: "copernicus",
  // Most moorings report every hour, some every ten minutes.
  schedule: "12 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const datasetUrl = parseProduct(yield* fetchJson(PRODUCT_URL));
    if (datasetUrl instanceof FormatError) return yield* datasetUrl;
    const layout = parseDataset(yield* fetchJson(datasetUrl));
    if (layout instanceof FormatError) return yield* layout;
    const institutions = parsePlatforms(yield* fetchBytes(layout.platformsUrl));
    if (institutions instanceof FormatError) return yield* institutions;

    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_MS);
    const rowsByVariable = new Map<string, Row[]>();
    let rejected = 0;

    for (const { name } of VARIABLES) {
      const rows: Row[] = [];
      for (const url of fileUrls(layout, name, now)) {
        // A stretch of time with no measurement yet has no file, which the store answers with
        // 403 or 404. Any other failure fails the run, so no reading is stored without the
        // values of the file that could not be read.
        const bytes = yield* fetchBytes(url).pipe(
          Effect.catch((error) =>
            error.status === 403 || error.status === 404
              ? Effect.succeed(null)
              : Effect.fail(error),
          ),
        );
        if (bytes === null) continue;

        const file = readFile(bytes, name, since);
        if (file instanceof FormatError) return yield* file;
        rows.push(...file.rows);
        rejected += file.rejected;
      }
      rowsByVariable.set(name, rows);
    }
    if ((rowsByVariable.get(REQUIRED_VARIABLE) ?? []).length === 0) {
      return yield* formatError("no file of wave heights could be read");
    }

    const snapshot = buildSnapshot(rowsByVariable, institutions, now);
    return { ...snapshot, rejected: snapshot.rejected + rejected };
  }),
};
