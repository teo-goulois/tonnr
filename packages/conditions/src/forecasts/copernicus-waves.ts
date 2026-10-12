import { fetchBytes, fetchJson, type UpstreamError } from "@repo/upstream";
import { Effect, Schema } from "effect";
import { z } from "zod";

import { BloscError, unblosc } from "./blosc";
import { FINE_WAVE_MODEL, isInFineZone } from "./wave-models";

// The Copernicus Marine Service keeps its wave models as Zarr stores in a public bucket, readable
// without an account. This module reads one of them at a point: the Met Office's WaveWatch III
// over the north-west European shelf, on a grid of 1.5 km, hourly, about six days ahead. Near the
// shore it came out ten points ahead of the 9 km model against the buoys. Decision 037.
const CATALOGUE_URL = "https://stac.marine.copernicus.eu/metadata";
const PRODUCT = "NWSHELF_ANALYSISFORECAST_WAV_004_014";
// A dataset's name ends with a version, `_202511` on 2026-10-12, so it is looked up.
const DATASET_PREFIX = "cmems_mod_nws_wav_anfc_1.5km_PT1H-i_";

// The whole sea: its height, the period of its peak, its energy period, and where it comes from.
// The energy period is the mean period Open-Meteo gives for the other models.
const VARIABLES = {
  height: "VHM0",
  peakPeriod: "VTPK",
  meanPeriod: "VTM10",
  direction: "VMDR",
} as const;
type Value = keyof typeof VARIABLES;
const VALUES = Object.keys(VARIABLES) as Value[];
// The decimals a value keeps: as many as the store's own steps have, 2 mm, a hundredth of a
// second and a tenth of a degree. Rounding only takes away what the scale's float adds.
const DECIMALS: Record<Value, number> = { height: 3, peakPeriod: 2, meanPeriod: 2, direction: 1 };

// A spot stands on the shore, and the grid's nearest cell is often land: the sea is looked for
// this far around the point.
const REACH_KM = 4;
const KM_PER_DEGREE = 111.2;
// The hours read: from two days before today, which is at most three days back, to the model's
// last hour.
const PAST_MS = 3 * 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

// What comes from outside is bounded. A piece of the grid is 0.2 MB packed and 1.9 MB unpacked.
const MAX_PIECE_BYTES = 4 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 8 * 1024 * 1024;
// The store's layout is kept an hour, and a piece half an hour: the model is renewed once a day.
const LAYOUT_MS = 60 * 60 * 1000;
const PIECE_MS = 30 * 60 * 1000;
const KEPT_PIECES = 96;
// A point that takes longer than this goes without the fine model, and has the other.
const PATIENCE = "10 seconds";

export class FineWavesFormatError extends Schema.TaggedError<FineWavesFormatError>()(
  "FineWavesFormatError",
  { message: Schema.String },
) {}

function formatError(message: string) {
  return new FineWavesFormatError({ message: `Copernicus Marine's wave model: ${message}` });
}

const axis = z.object({
  chunkLen: z.record(z.string(), z.number().int().positive()),
  coords: z.object({
    type: z.literal("minMaxStep"),
    min: z.number(),
    step: z.number().positive(),
    len: z.number().int().positive(),
  }),
});

const product = z.object({
  links: z.array(z.object({ rel: z.string(), href: z.string() })),
});

// The record of a dataset says where its store is and how it is cut.
const dataset = z.object({
  assets: z.object({
    geoChunked: z.object({
      href: z.string().startsWith("https://"),
      viewDims: z.object({
        time: axis.extend({ units: z.string() }),
        latitude: axis,
        longitude: axis,
      }),
    }),
  }),
});

// The store's own description of an array, and of how to read its numbers.
const array = z.object({
  chunks: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  dtype: z.literal("<i2"),
  order: z.literal("C"),
  fill_value: z.number().int(),
  compressor: z.object({ id: z.literal("blosc") }),
  filters: z.null().optional(),
  dimension_separator: z.string().optional(),
});
const scaling = z.object({ scale_factor: z.number().positive(), add_offset: z.number() });
const description = z.object({ metadata: z.record(z.string(), z.unknown()) });

type Axis = { start: number; step: number; length: number; piece: number };
type Layout = {
  root: string;
  time: Axis;
  latitude: Axis;
  longitude: Axis;
  separator: string;
  variables: Record<Value, { name: string; scale: number; offset: number; fill: number }>;
};

/** The dataset of the product whose name starts as expected: the latest when there are several. */
export function datasetUrl(productJson: unknown) {
  const parsed = product.safeParse(productJson);
  if (!parsed.success) return formatError("the product's record changed shape");
  const names = parsed.data.links
    .filter((link) => link.rel === "item" && link.href.startsWith(DATASET_PREFIX))
    .map((link) => link.href)
    .sort();
  const latest = names.at(-1);
  if (!latest) return formatError(`no dataset named ${DATASET_PREFIX}…`);
  return new URL(latest, `${CATALOGUE_URL}/${PRODUCT}/`).href;
}

/** How the store is laid out, from the dataset's record and the store's own description. */
export function layoutOf(datasetJson: unknown, descriptionJson: unknown) {
  const record = dataset.safeParse(datasetJson);
  if (!record.success) return formatError("the dataset's record changed shape");
  const { href, viewDims } = record.data.assets.geoChunked;
  if (!viewDims.time.units.startsWith("milliseconds since 1970-01-01")) {
    return formatError(`times counted in "${viewDims.time.units}"`);
  }
  const described = description.safeParse(descriptionJson);
  if (!described.success) return formatError("the store's description changed shape");

  const axisOf = (dimension: z.infer<typeof axis>, name: string): Axis | null => {
    const piece = dimension.chunkLen[name];
    return piece === undefined
      ? null
      : {
          start: dimension.coords.min,
          step: dimension.coords.step,
          length: dimension.coords.len,
          piece,
        };
  };
  const first = VARIABLES.height;
  const time = axisOf(viewDims.time, first);
  const latitude = axisOf(viewDims.latitude, first);
  const longitude = axisOf(viewDims.longitude, first);
  if (!time || !latitude || !longitude) return formatError(`no cut given for ${first}`);
  if (time.step !== HOUR_MS) return formatError(`a field every ${time.step} ms`);

  let separator = ".";
  const variables = {} as Layout["variables"];
  for (const value of VALUES) {
    const name = VARIABLES[value];
    const shape = array.safeParse(described.data.metadata[`${name}/.zarray`]);
    const scale = scaling.safeParse(described.data.metadata[`${name}/.zattrs`]);
    if (!shape.success || !scale.success) return formatError(`${name} is stored another way`);
    const [times, rows, columns] = shape.data.chunks;
    if (times !== time.piece || rows !== latitude.piece || columns !== longitude.piece) {
      return formatError(`${name} is cut another way than its record says`);
    }
    separator = shape.data.dimension_separator ?? ".";
    variables[value] = {
      name,
      scale: scale.data.scale_factor,
      offset: scale.data.add_offset,
      fill: shape.data.fill_value,
    };
  }
  return { root: href, time, latitude, longitude, separator, variables } satisfies Layout;
}

const kilometers = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) =>
  Math.hypot(
    (to.latitude - from.latitude) * KM_PER_DEGREE,
    (to.longitude - from.longitude) * KM_PER_DEGREE * Math.cos((from.latitude * Math.PI) / 180),
  );

/** The cells of the grid within reach of a point, nearest first. */
export function cellsNear(
  layout: Pick<Layout, "latitude" | "longitude">,
  point: { latitude: number; longitude: number },
) {
  const { latitude, longitude } = layout;
  const row = Math.round((point.latitude - latitude.start) / latitude.step);
  const column = Math.round((point.longitude - longitude.start) / longitude.step);
  const rows = Math.ceil(REACH_KM / (latitude.step * KM_PER_DEGREE));
  const columns = Math.ceil(
    REACH_KM / (longitude.step * KM_PER_DEGREE * Math.cos((point.latitude * Math.PI) / 180)),
  );
  const cells = [];
  for (let y = row - rows; y <= row + rows; y += 1) {
    for (let x = column - columns; x <= column + columns; x += 1) {
      if (y < 0 || y >= latitude.length || x < 0 || x >= longitude.length) continue;
      const center = {
        latitude: latitude.start + y * latitude.step,
        longitude: longitude.start + x * longitude.step,
      };
      const away = kilometers(point, center);
      if (away <= REACH_KM) cells.push({ row: y, column: x, away, ...center });
    }
  }
  return cells.sort((a, b) => a.away - b.away);
}

/** The waves of the fine model at a point: a value for each hour it has, null where it has none. */
export type FineWaves = {
  model: typeof FINE_WAVE_MODEL.id;
  // The centre of the grid's cell that was read.
  point: { latitude: number; longitude: number };
  // Seconds since 1970, one for each hour, in order.
  time: number[];
} & Record<Value, (number | null)[]>;

type Kept<Held> = { held: Held; until: number };

/**
 * What reads the fine model, with what it keeps between two points: the layout of the store,
 * and the pieces it fetched, packed as they came. Nearby points are in the same pieces.
 */
export function makeFineWaves() {
  let layout: Kept<Layout> | null = null;
  // Null for a piece the store does not have: it holds no sea.
  const pieces = new Map<string, Kept<Uint8Array | null>>();

  const readLayout = Effect.fn("readFineWavesLayout")(function* (now: number) {
    if (layout && layout.until > now) return layout.held;
    const url = datasetUrl(yield* fetchJson(`${CATALOGUE_URL}/${PRODUCT}/product.stac.json`));
    if (url instanceof FineWavesFormatError) return yield* url;
    const record = dataset.safeParse(yield* fetchJson(url));
    if (!record.success) return yield* formatError("the dataset's record changed shape");
    const read = layoutOf(
      record.data,
      yield* fetchJson(`${record.data.assets.geoChunked.href}/.zmetadata`),
    );
    if (read instanceof FineWavesFormatError) return yield* read;
    layout = { held: read, until: now + LAYOUT_MS };
    return read;
  });

  const readPiece = Effect.fn("readFineWavesPiece")(function* (url: string, now: number) {
    const kept = pieces.get(url);
    if (kept && kept.until > now) return kept.held;
    const packed = yield* fetchBytes(url, MAX_PIECE_BYTES).pipe(
      // The store answers 403 for a piece it does not have, as for one it refuses.
      Effect.catch((error: UpstreamError) =>
        error.status === 403 || error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    );
    pieces.delete(url);
    pieces.set(url, { held: packed, until: now + PIECE_MS });
    // The oldest goes first: a map keeps its keys in the order they came.
    for (const key of pieces.keys()) {
      if (pieces.size <= KEPT_PIECES) break;
      pieces.delete(key);
    }
    return packed;
  });

  const read = Effect.fn("readFineWaves")(function* (
    point: { latitude: number; longitude: number },
    now: number,
  ) {
    const found = yield* readLayout(now);
    const { time, latitude, longitude } = found;
    const first = Math.max(0, Math.floor((now - PAST_MS - time.start) / time.step));
    if (first >= time.length) return null;
    const hours = time.length - first;

    // One variable at one cell, hour by hour: the pieces that hold its hours, unpacked.
    const unpacked = new Map<string, Int16Array | null>();
    const series = Effect.fn("readFineWavesSeries")(function* (
      value: Value,
      row: number,
      column: number,
    ) {
      const variable = found.variables[value];
      const raw: (number | null)[] = [];
      for (
        let piece = Math.floor(first / time.piece);
        piece * time.piece < time.length;
        piece += 1
      ) {
        const key = [
          piece,
          Math.floor(row / latitude.piece),
          Math.floor(column / longitude.piece),
        ].join(found.separator);
        const url = `${found.root}/${variable.name}/${key}`;
        if (!unpacked.has(url)) {
          const packed = yield* readPiece(url, now);
          const expected = time.piece * latitude.piece * longitude.piece * 2;
          const bytes =
            packed === null
              ? null
              : yield* Effect.try({
                  try: () => unblosc(packed, MAX_UNPACKED_BYTES),
                  catch: (cause) =>
                    formatError(cause instanceof BloscError ? cause.message : String(cause)),
                });
          if (bytes !== null && bytes.byteLength !== expected) {
            return yield* formatError(`a piece of ${bytes.byteLength} bytes, not ${expected}`);
          }
          unpacked.set(
            url,
            bytes === null ? null : new Int16Array(bytes.buffer, bytes.byteOffset, expected / 2),
          );
        }
        const values = unpacked.get(url) ?? null;
        const from = Math.max(first, piece * time.piece);
        const until = Math.min(time.length, (piece + 1) * time.piece);
        for (let hour = from; hour < until; hour += 1) {
          const at =
            ((hour % time.piece) * latitude.piece + (row % latitude.piece)) * longitude.piece +
            (column % longitude.piece);
          const stored = values?.[at] ?? variable.fill;
          raw.push(
            stored === variable.fill
              ? null
              : Number((stored * variable.scale + variable.offset).toFixed(DECIMALS[value])),
          );
        }
      }
      return raw;
    });

    // The nearest cell that has a sea at some hour is the one that is read.
    for (const cell of cellsNear(found, point)) {
      const height = yield* series("height", cell.row, cell.column);
      if (height.every((meters) => meters === null)) continue;
      const [peakPeriod, meanPeriod, direction] = yield* Effect.all(
        (["peakPeriod", "meanPeriod", "direction"] as const).map((value) =>
          series(value, cell.row, cell.column),
        ),
        { concurrency: 3 },
      );
      const waves: FineWaves = {
        model: FINE_WAVE_MODEL.id,
        // The grid's steps are not round numbers: five decimals are a metre.
        point: {
          latitude: Number(cell.latitude.toFixed(5)),
          longitude: Number(cell.longitude.toFixed(5)),
        },
        time: Array.from(
          { length: hours },
          (_, index) => (time.start + (first + index) * time.step) / 1000,
        ),
        height,
        peakPeriod: peakPeriod ?? [],
        meanPeriod: meanPeriod ?? [],
        direction: direction ?? [],
      };
      return waves;
    }
    return null;
  });

  /**
   * The fine model's waves at a point, or null: outside its sea, and whenever it cannot be read.
   * A failure here never fails a forecast, which then has the other models alone.
   */
  return (point: { latitude: number; longitude: number }, now = Date.now()) => {
    if (!isInFineZone(point)) return Effect.succeed(null);
    return read(point, now).pipe(
      Effect.timeoutOption(PATIENCE),
      Effect.map((answered) => (answered._tag === "Some" ? answered.value : null)),
      Effect.catch((error) =>
        Effect.logWarning("the fine wave model could not be read", error).pipe(Effect.as(null)),
      ),
    );
  };
}

export type FetchFineWaves = ReturnType<typeof makeFineWaves>;
