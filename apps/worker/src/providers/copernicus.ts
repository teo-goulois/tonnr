import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import { fetchBytes, fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { isObservationTime } from "./utc-date";

// The Copernicus Marine Service gathers the measurements of Europe's national networks under one
// licence. This product covers the seas from Ireland to the Canaries, and Tonnr reads its
// moorings: the buoys of Spain, the Netherlands, Belgium, the English coasts, and others.
const PRODUCT_URL =
  "https://stac.marine.copernicus.eu/metadata/INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033/product.stac.json";
const PRODUCT_DOI = "https://doi.org/10.48670/moi-00043";
const LICENCE_URL = "https://marine.copernicus.eu/user-corner/service-commitments-and-licence";

// The last three days. Most measurements show up one to two hours after their time. The product
// says that they are distributed within 24 to 48 hours on average, and a day is added so that
// one that arrives that late is still read by the next hourly run.
const WINDOW_MS = 72 * 60 * 60 * 1000;
// A mooring is a platform of this type, and its identifier ends with the type. It is any fixed
// platform: a buoy, a pole, an oil platform, and some harbour or estuary sites.
const MOORING = "MO";
// The sea temperature is kept when it is measured within this depth, in metres.
const SURFACE_DEPTH_M = 5;
// Two positions this close are the same mooring: a hundred metres, far less than between two.
const SAME_SPOT_DEG = 0.001;

// What a run may read at most. The files come from outside. On 2026-10-08 the largest one
// weighed 1.5 MB, and a run over three days kept about 110,000 rows.
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const MAX_ROWS_PER_FILE = 200_000;
const MAX_ROWS_PER_RUN = 600_000;
// A variable's files over the window, and the files that may continue each of them.
const MAX_FILES_PER_VARIABLE = 4;
const MAX_OVERFLOW_FILES = 4;

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
// 3 and 4 bad, 5 changed, 6 below detection, 7 nominal, 8 interpolated, 9 missing.
const USABLE_FLAGS = new Set([0, 1, 2]);
const KNOWN_FLAGS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

// Buoys whose waves Tonnr already reads from their owner or through another provider, which
// would otherwise show twice. The institutions are written as the index of platforms writes
// them. The platforms were matched one by one on 2026-10-08.
const READ_ELSEWHERE = {
  institutions: new Set(["Marine Institute", "Met Eireann;Commissioners of Irish Lights"]),
  platforms: new Set([
    // Two buoys of the Instituto Hidrográfico, which the index lists under Puertos del Estado.
    "Leixoes-coast-buoy",
    "Sines-coast-buoy",
    // Three lightships of the Met Office whose waves NDBC relays. NDBC gives only the wind of
    // the Met Office's other buoys, so their waves are read here.
    "6200107",
    "6200170",
    "6200304",
  ]),
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

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

/**
 * Reads, from the dataset's record, where its files are and how they are cut. A file is named
 * by four numbers: its stretch of time, its band of depth, and its cuts in longitude and
 * latitude. Only the time changes from file to file here, so the three others are checked to
 * be what the parser takes them for: the band around the surface, and no horizontal cut.
 */
export function parseDataset(json: unknown): Layout | FormatError {
  const assets = isRecord(json) && isRecord(json.assets) ? json.assets : {};
  const files = isRecord(assets.timeChunked) ? assets.timeChunked : {};
  const platforms = isRecord(assets.platforms) ? assets.platforms : {};
  const dimensions = isRecord(files.viewDims) ? files.viewDims : {};
  const dimension = (name: string) => (isRecord(dimensions[name]) ? dimensions[name] : {});
  const lengths = (name: string) => {
    const cut = dimension(name).chunkLen;
    return isRecord(cut) ? cut : {};
  };
  const properties = isRecord(json) && isRecord(json.properties) ? json.properties : {};
  const described = isRecord(properties["cube:variables"]) ? properties["cube:variables"] : {};

  const time = dimension("time");
  const depth = dimension("elevation");
  if (
    typeof files.href !== "string" ||
    typeof platforms.href !== "string" ||
    typeof time.chunkRefCoord !== "number" ||
    !Number.isFinite(time.chunkRefCoord) ||
    time.chunkType !== "default"
  ) {
    return formatError("the dataset does not say where its files are or how they are cut in time");
  }
  if (depth.chunkType !== "symmetricGeometric" || depth.chunkRefCoord !== 0) {
    return formatError("the files of the dataset are no longer cut in bands around the surface");
  }

  const stretchS: Record<string, number> = {};
  for (const { name, unit } of VARIABLES) {
    const variable = described[name];
    const written = isRecord(variable) ? variable.unit : undefined;
    if (written !== unit) return formatError(`${name} is in "${String(written)}", not "${unit}"`);

    const stretch = lengths("time")[name];
    if (!isCount(stretch)) {
      return formatError(`the dataset does not say how the files of ${name} are cut in time`);
    }
    // The first band must hold everything down to the depth the sea temperature is kept from.
    const band = lengths("elevation")[name];
    if (!isCount(band) || band < SURFACE_DEPTH_M) {
      return formatError(`the files of ${name} no longer hold the first ${SURFACE_DEPTH_M} metres`);
    }
    if (lengths("longitude")[name] !== null || lengths("latitude")[name] !== null) {
      return formatError(`the files of ${name} are now cut by longitude or latitude`);
    }
    stretchS[name] = stretch;
  }

  return {
    filesUrl: files.href,
    platformsUrl: platforms.href,
    timeOriginS: time.chunkRefCoord,
    stretchS,
  };
}

/**
 * The files of one variable that hold the window ending now, without their extension: one, or
 * a few when the window crosses a cut.
 */
export function fileUrls(layout: Layout, variable: string, now: Date): string[] | FormatError {
  const stretch = layout.stretchS[variable] ?? Number.NaN;
  const number = (ms: number) => Math.floor((ms / 1000 - layout.timeOriginS) / stretch);
  const first = number(now.getTime() - WINDOW_MS);
  const last = number(now.getTime());
  if (!Number.isSafeInteger(first) || last - first >= MAX_FILES_PER_VARIABLE) {
    return formatError(`the window would take too many files of ${variable}`);
  }

  const urls: string[] = [];
  for (let index = first; index <= last; index += 1) {
    // The band around the surface, and no cut in longitude or latitude.
    urls.push(`${layout.filesUrl}/${variable}/${index}.0.0.0`);
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
    const text = isCompressed ? gunzipSync(bytes, { maxOutputLength: MAX_INDEX_BYTES }) : bytes;
    json = JSON.parse(new TextDecoder().decode(text));
  } catch {
    return formatError("the index of platforms is not JSON, or is too large");
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

// The two tables of a file, as the store writes them: plain columns and nothing else. An index,
// a view, a trigger, or a column with an expression would make reading the file run whatever
// the file says, so a file that holds anything more is refused before it is read.
const DATA_COLUMNS: readonly (readonly [name: string, type: string])[] = [
  ["platform_id", "TEXT"],
  ["platform_type", "TEXT"],
  ["time", "INTEGER"],
  ["longitude", "REAL"],
  ["latitude", "REAL"],
  ["elevation", "REAL"],
  ["is_approx_elevation", "INTEGER"],
  ["pressure", "REAL"],
  ["value", "REAL"],
  ["value_qc", "INTEGER"],
];
const TABLES: Record<string, readonly (readonly [string, string])[]> = {
  data: DATA_COLUMNS,
  meta: [["metadata", "TEXT"]],
};

/** Whether a `create table` statement declares these plain columns, in order, and nothing else. */
function declaresOnly(sql: unknown, name: string, columns: readonly (readonly [string, string])[]) {
  if (typeof sql !== "string") return false;
  const body = new RegExp(`^\\s*create\\s+table\\s+${name}\\s*\\(([^()]*)\\)\\s*$`, "is").exec(
    // The store leaves a comment after a column.
    sql.replaceAll(/--[^\n]*/g, ""),
  )?.[1];
  const declared = body?.split(",").map((column) => column.trim().split(/\s+/)) ?? [];

  return (
    declared.length === columns.length &&
    columns.every(
      ([column, type], index) =>
        declared[index]?.length === 2 &&
        declared[index][0] === column &&
        declared[index][1]?.toUpperCase() === type,
    )
  );
}

/**
 * Reads a file of one variable: a SQLite database with one row per platform, time, and depth.
 * Returns the rows from `since` on, how many rows it could not read, and how many more files
 * the store says continue this one. It stops at `maxRows` rows, which a run lowers to what it
 * may still take.
 */
export function readFile(
  bytes: Uint8Array,
  variable: string,
  since: Date,
  maxRows = MAX_ROWS_PER_FILE,
): { rows: Row[]; rejected: number; overflowFiles: number } | FormatError {
  const database = new DatabaseSync(":memory:");
  try {
    database.deserialize(bytes);
    const objects = database.prepare("select type, name, sql from sqlite_schema").all();
    const isPlain =
      objects.some((object) => object.name === "data") &&
      objects.every(
        (object) =>
          object.type === "table" &&
          typeof object.name === "string" &&
          Object.hasOwn(TABLES, object.name) &&
          declaresOnly(object.sql, object.name, TABLES[object.name] ?? []),
      );
    if (!isPlain) {
      return formatError(`the file of ${variable} does not have the tables this parser reads`);
    }
    // A damaged file would answer a query with fewer rows and no error. With plain tables only,
    // this check runs nothing the file wrote.
    if (database.prepare("pragma integrity_check(1)").get()?.integrity_check !== "ok") {
      return formatError(`the file of ${variable} is damaged`);
    }

    // A file too large for one database is continued in others, which its notes count. The
    // reader Copernicus publishes takes that count from the first file alone, as is done here.
    let overflowFiles = 0;
    const hasNotes = objects.some((object) => object.name === "meta");
    const notes = hasNotes ? database.prepare("select metadata from meta limit 1").get() : null;
    if (notes && notes.metadata !== null && notes.metadata !== "") {
      const parsed: unknown = typeof notes.metadata === "string" ? JSON.parse(notes.metadata) : 0;
      const isObject = isRecord(parsed) && !Array.isArray(parsed);
      const count = isObject ? parsed.overflow_chunks : null;
      const isAbsent = isObject && !Object.hasOwn(parsed, "overflow_chunks");
      if (!isAbsent && !(typeof count === "number" && Number.isInteger(count) && count >= 0)) {
        return formatError(`the file of ${variable} does not say how many files continue it`);
      }
      if (typeof count === "number" && count > MAX_OVERFLOW_FILES) {
        return formatError(`the file of ${variable} is continued in too many files`);
      }
      overflowFiles = typeof count === "number" ? count : 0;
    }

    const rows: Row[] = [];
    let rejected = 0;
    const statement = database.prepare(
      "select platform_id, platform_type, time, longitude, latitude, elevation, value, value_qc " +
        "from data where time >= ?",
    );
    for (const row of statement.iterate(Math.floor(since.getTime() / 1000))) {
      if (rows.length + rejected >= maxRows) {
        return formatError(`the file of ${variable} holds too many rows for the window`);
      }
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
    return { rows, rejected, overflowFiles };
  } catch {
    return formatError(`the file of ${variable} is not a database this parser can read`);
  } finally {
    database.close();
  }
}

/** Whether two rows of one mooring and moment say the same thing. */
function isSameRow(first: Row, second: Row) {
  return (
    first.value === second.value &&
    first.flag === second.flag &&
    first.latitude === second.latitude &&
    first.longitude === second.longitude
  );
}

/**
 * Builds the snapshot from the rows of each variable. A reading gathers, for one mooring and
 * moment, the value of every variable that has one. A moment is rejected when its rows
 * disagree: two different rows for one variable and depth, or two positions.
 */
export function buildSnapshot(
  rowsByVariable: ReadonlyMap<string, readonly Row[]>,
  institutions: ReadonlyMap<string, string>,
  now = new Date(),
): Snapshot {
  const since = now.getTime() - WINDOW_MS;
  type Moment = { reading: ReadingInput; latitude: number; longitude: number; timeS: number };
  const moments = new Map<string, Moment>();
  const ambiguous = new Set<string>();
  let rejected = 0;

  for (const { name, measurement } of VARIABLES) {
    // The rows of this variable, by mooring and moment, then by depth.
    const rowsByMoment = new Map<string, { code: string; byDepth: Map<number, Row> }>();

    for (const row of rowsByVariable.get(name) ?? []) {
      if (row.platformType !== MOORING || !row.platformId.endsWith(`___${MOORING}`)) continue;
      const code = row.platformId.slice(0, -`___${MOORING}`.length);
      if (
        READ_ELSEWHERE.platforms.has(code) ||
        READ_ELSEWHERE.institutions.has(institutions.get(row.platformId) ?? "")
      ) {
        continue;
      }

      if (
        code === "" ||
        !Number.isInteger(row.timeS) ||
        !isObservationTime(new Date(row.timeS * 1000)) ||
        !isPosition(row.latitude, row.longitude) ||
        (row.flag !== null && !KNOWN_FLAGS.has(row.flag))
      ) {
        rejected += 1;
        continue;
      }
      if (row.timeS * 1000 < since) continue;
      // The sea is measured at the surface or just under it. A value from above, or from the
      // deep, is another instrument's.
      if (row.elevation > 0 || row.elevation < -SURFACE_DEPTH_M) continue;

      const key = `${code} ${row.timeS}`;
      const moment = rowsByMoment.get(key) ?? { code, byDepth: new Map<number, Row>() };
      rowsByMoment.set(key, moment);
      const earlier = moment.byDepth.get(row.elevation);
      if (!earlier) {
        moment.byDepth.set(row.elevation, row);
      } else if (!isSameRow(earlier, row)) {
        // The same row twice says nothing new. Two rows that differ cannot both be right, and
        // nothing says which instrument each one is.
        ambiguous.add(key);
        rejected += 1;
      }
    }

    for (const [key, { code, byDepth }] of rowsByMoment) {
      const rows = [...byDepth.values()];
      const [first] = rows;
      if (!first) continue;
      const moment = moments.get(key) ?? {
        reading: { providerStationId: code, observedAt: new Date(first.timeS * 1000) },
        latitude: first.latitude,
        longitude: first.longitude,
        timeS: first.timeS,
      };
      moments.set(key, moment);

      // Every variable of a moment must place the mooring at the same spot, give or take the
      // rounding of a position.
      const isElsewhere = rows.some(
        (row) =>
          Math.abs(row.latitude - moment.latitude) > SAME_SPOT_DEG ||
          Math.abs(row.longitude - moment.longitude) > SAME_SPOT_DEG,
      );
      if (isElsewhere && !ambiguous.has(key)) {
        ambiguous.add(key);
        rejected += 1;
      }

      // Of the depths that have a usable value, the one nearest the surface. A value without a
      // flag is kept as one nobody checked.
      let nearest: { elevation: number; value: number } | undefined;
      for (const row of rows) {
        const isUsable = row.flag === null || USABLE_FLAGS.has(row.flag);
        const value = row.value !== null && isUsable ? plausible(measurement, row.value) : null;
        if (value !== null && (!nearest || row.elevation > nearest.elevation)) {
          nearest = { elevation: row.elevation, value };
        }
      }
      // A measurement keeps the value of the first variable that has one.
      if (nearest && moment.reading[measurement] == null) {
        moment.reading[measurement] = nearest.value;
      }
    }
  }

  const kept = [...moments.entries()]
    .filter(([key, moment]) => !ambiguous.has(key) && moment.reading.significantHeightM != null)
    .map(([, moment]) => moment);

  // A mooring is placed where its latest kept reading puts it.
  const latest = new Map<string, Moment>();
  for (const moment of kept) {
    const code = moment.reading.providerStationId;
    const known = latest.get(code);
    if (!known || moment.timeS > known.timeS) latest.set(code, moment);
  }

  const stations: StationInput[] = [...latest].map(([code, moment]) => {
    const institution = institutions.get(`${code}___${MOORING}`);
    return {
      providerStationId: code,
      // The product names a mooring by its code alone.
      name: code,
      latitude: moment.latitude,
      longitude: moment.longitude,
      licenseType: "copernicus-marine",
      licenseUrl: LICENCE_URL,
      // The credit the licence asks for, after the institution that owns the mooring.
      attribution:
        `${institution ? `${institution}. ` : ""}Generated using E.U. Copernicus Marine Service ` +
        `Information; ${PRODUCT_DOI}`,
      commercialUse: true,
    };
  });

  return { stations, readings: kept.map((moment) => moment.reading), rejected };
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
    const institutions = parsePlatforms(yield* fetchBytes(layout.platformsUrl, MAX_INDEX_BYTES));
    if (institutions instanceof FormatError) return yield* institutions;

    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_MS);
    const rowsByVariable = new Map<string, Row[]>();
    let rejected = 0;
    let total = 0;

    for (const { name } of VARIABLES) {
      const urls = fileUrls(layout, name, now);
      if (urls instanceof FormatError) return yield* urls;

      const rows: Row[] = [];
      for (const url of urls) {
        // A stretch of time with no measurement yet has no file, which the store answers with
        // 403 or 404. Any other failure fails the run, so no reading is stored without the
        // values of a file that could not be read.
        const bytes = yield* fetchBytes(`${url}.sqlite`, MAX_FILE_BYTES).pipe(
          Effect.catch((error) =>
            error.status === 403 || error.status === 404
              ? Effect.succeed(null)
              : Effect.fail(error),
          ),
        );
        if (bytes === null) continue;

        // Each file is counted as it is read, so a run never holds more rows than its budget.
        const allowance = () => Math.min(MAX_ROWS_PER_FILE, MAX_ROWS_PER_RUN - total);
        const take = (file: { rows: Row[]; rejected: number }) => {
          total += file.rows.length + file.rejected;
          rejected += file.rejected;
          for (const row of file.rows) rows.push(row);
        };

        const first = readFile(bytes, name, since, allowance());
        if (first instanceof FormatError) return yield* first;
        take(first);
        // A file the store announces must be there.
        for (let part = 1; part <= first.overflowFiles; part += 1) {
          const more = readFile(
            yield* fetchBytes(`${url}b${part}.sqlite`, MAX_FILE_BYTES),
            name,
            since,
            allowance(),
          );
          if (more instanceof FormatError) return yield* more;
          take(more);
        }
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
