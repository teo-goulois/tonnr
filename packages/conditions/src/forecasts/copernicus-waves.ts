import { fetchBytes, fetchJson, type UpstreamError } from "@repo/upstream";
import { Cache, Duration, Effect, Exit, Schema } from "effect";
import { z } from "zod";

import { BloscError, unblosc } from "./blosc";
import { FINE_WAVE_MODEL, isInFineZone, SWELL_MODEL } from "./wave-models";

// The Copernicus Marine Service keeps its wave models as Zarr stores in a public bucket, readable
// without an account. This module reads two of them at a point. The Met Office's WaveWatch III
// over the north-west European shelf, on a grid of 1.5 km, hourly, about six days ahead: near
// the shore it came out ten points ahead of the 9 km model against the buoys. And Météo-France's
// MFWAM over the world, on a grid of 9 km, every three hours, for the swell it gives apart from
// the wind sea, which the models asked of Open-Meteo do not. Decisions 037 and 038.
const CATALOGUE_URL = "https://stac.marine.copernicus.eu/metadata";

const KM_PER_DEGREE = 111.2;
// The hours read: from two days before today, which is at most three days back, to the model's
// last hour.
const PAST_MS = 3 * 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

// What comes from outside is bounded. A piece of a grid is 0.2 to 0.5 MB packed, and 2 MB
// unpacked.
const MAX_PIECE_BYTES = 4 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 8 * 1024 * 1024;
// A store's layout is kept an hour, and a piece half an hour: a model is renewed once or twice a
// day. A store keeps this many pieces at most, packed as they came: 0.2 to 0.5 MB each, so
// about 20 MB. Two points that need the same piece at the same moment share one fetch.
const LAYOUT_MS = 60 * 60 * 1000;
const PIECE_MS = 30 * 60 * 1000;
const KEPT_PIECES = 48;
// A point that takes longer than this goes without the store, and has what the others give.
const PATIENCE = "10 seconds";
// After the store could not be read, or took too long, it is left alone for this long: every
// cold forecast would otherwise wait on it in turn.
const QUIET_MS = 60 * 1000;

type Point = { latitude: number; longitude: number };

/** A store to read: where it is in the catalogue, what is read of it, and where. */
type Store<Value extends string> = {
  product: string;
  // A dataset's name ends with a version, `_202511` on 2026-10-12, so it is looked up.
  datasetPrefix: string;
  stepMs: number;
  variables: Record<Value, string>;
  // The variable that says a cell has a sea: a cell without it at every hour is passed over.
  sea: Value;
  // A spot stands on the shore, and the grid's nearest cell is often land: the sea is looked
  // for this far around the point.
  reachKm: number;
  covers: (point: Point) => boolean;
};

export class WaveStoreFormatError extends Schema.TaggedError<WaveStoreFormatError>()(
  "WaveStoreFormatError",
  { message: Schema.String },
) {}

function formatError(message: string) {
  return new WaveStoreFormatError({ message: `Copernicus Marine's wave model: ${message}` });
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
type Layout<Value extends string> = {
  root: string;
  time: Axis;
  latitude: Axis;
  longitude: Axis;
  separator: string;
  variables: Record<
    Value,
    { name: string; scale: number; offset: number; fill: number; decimals: number }
  >;
};

/** The dataset of a product whose name starts as expected: the latest when there are several. */
export function datasetUrl(store: Pick<Store<string>, "product" | "datasetPrefix">, json: unknown) {
  const parsed = product.safeParse(json);
  if (!parsed.success) return formatError("the product's record changed shape");
  const names = parsed.data.links
    .filter((link) => link.rel === "item" && link.href.startsWith(store.datasetPrefix))
    .map((link) => link.href)
    .sort();
  const latest = names.at(-1);
  if (!latest) return formatError(`no dataset named ${store.datasetPrefix}…`);
  return new URL(latest, `${CATALOGUE_URL}/${store.product}/`).href;
}

/** How a store is laid out, from the dataset's record and the store's own description. */
export function layoutOf<Value extends string>(
  store: Pick<Store<Value>, "variables" | "stepMs" | "sea">,
  datasetJson: unknown,
  descriptionJson: unknown,
) {
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
  const first = store.variables[store.sea];
  const time = axisOf(viewDims.time, first);
  const latitude = axisOf(viewDims.latitude, first);
  const longitude = axisOf(viewDims.longitude, first);
  if (!time || !latitude || !longitude) return formatError(`no cut given for ${first}`);
  if (time.step !== store.stepMs) return formatError(`a field every ${time.step} ms`);

  let separator = ".";
  const variables = {} as Layout<Value>["variables"];
  for (const value of Object.keys(store.variables) as Value[]) {
    const name = store.variables[value];
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
      // As many decimals as the store's own step has: rounding only takes away what the scale,
      // a float, adds to a whole number of steps.
      decimals: Math.min(4, Math.max(0, Math.ceil(-Math.log10(scale.data.scale_factor)))),
    };
  }
  return { root: href, time, latitude, longitude, separator, variables } satisfies Layout<Value>;
}

const kilometers = (from: Point, to: Point) =>
  Math.hypot(
    (to.latitude - from.latitude) * KM_PER_DEGREE,
    (to.longitude - from.longitude) * KM_PER_DEGREE * Math.cos((from.latitude * Math.PI) / 180),
  );

/** The cells of a grid within reach of a point, nearest first. */
export function cellsNear(
  layout: Pick<Layout<string>, "latitude" | "longitude">,
  point: Point,
  reachKm: number,
) {
  const { latitude, longitude } = layout;
  const row = Math.round((point.latitude - latitude.start) / latitude.step);
  const column = Math.round((point.longitude - longitude.start) / longitude.step);
  // Never more rows or columns than the grid has. Near a pole a degree of longitude is next
  // to nothing, and the columns within reach would be more than a number can count by one:
  // a loop over them would never end.
  const rows = Math.min(latitude.length, Math.ceil(reachKm / (latitude.step * KM_PER_DEGREE)));
  const across = longitude.step * KM_PER_DEGREE * Math.cos((point.latitude * Math.PI) / 180);
  const columns = Math.min(longitude.length, Math.ceil(reachKm / across) || 0);
  const cells = [];
  for (let y = Math.max(0, row - rows); y <= row + rows && y < latitude.length; y += 1) {
    for (
      let x = Math.max(0, column - columns);
      x <= column + columns && x < longitude.length;
      x += 1
    ) {
      const center = {
        latitude: latitude.start + y * latitude.step,
        longitude: longitude.start + x * longitude.step,
      };
      const away = kilometers(point, center);
      if (away <= reachKm) cells.push({ row: y, column: x, away, ...center });
    }
  }
  return cells.sort((a, b) => a.away - b.away);
}

/** What a store gives at a point: a value for each of its steps, null where it has none. */
type Read<Value extends string> = {
  // The centre of the grid's cell that was read.
  point: Point;
  // Seconds since 1970, one for each of the store's steps, in order.
  time: number[];
  values: Record<Value, (number | null)[]>;
};

// What is kept for a while, and a failure not at all: the next point asks again.
const keptFor = (ms: number) => (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isSuccess(exit) ? Duration.millis(ms) : Duration.zero;

/**
 * What reads a store, with what it keeps between two points: the layout of the store, and the
 * pieces it fetched, packed as they came. Nearby points are in the same pieces, and two points
 * that need one at the same moment share its fetch. It answers null outside the store's sea,
 * and whenever the store cannot be read: a failure here never fails a forecast, which then has
 * what the other sources give, and the store is then left alone for a minute.
 */
function makeWaveStore<Value extends string>(store: Store<Value>) {
  const fetchLayout = Effect.fn("fetchWaveStoreLayout")(function* (product: string) {
    const url = datasetUrl(
      store,
      yield* fetchJson(`${CATALOGUE_URL}/${product}/product.stac.json`),
    );
    if (url instanceof WaveStoreFormatError) return yield* url;
    const record = dataset.safeParse(yield* fetchJson(url));
    if (!record.success) return yield* formatError("the dataset's record changed shape");
    const read = layoutOf(
      store,
      record.data,
      yield* fetchJson(`${record.data.assets.geoChunked.href}/.zmetadata`),
    );
    if (read instanceof WaveStoreFormatError) return yield* read;
    return read;
  });
  // One layout, the product's, kept an hour.
  const layouts = Effect.runSync(
    Cache.makeWith(fetchLayout, { capacity: 1, timeToLive: keptFor(LAYOUT_MS) }),
  );

  // A piece, packed as it came, or null for one the store does not have: it holds no sea. The
  // store answers 403 for such a piece, as for one it refuses.
  const fetchPiece = (url: string) =>
    fetchBytes(url, MAX_PIECE_BYTES).pipe(
      Effect.catch((error: UpstreamError) =>
        error.status === 403 || error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    );
  const pieces = Effect.runSync(
    Cache.makeWith(fetchPiece, { capacity: KEPT_PIECES, timeToLive: keptFor(PIECE_MS) }),
  );
  const readPiece = (url: string) => Cache.get(pieces, url);

  // The store failed, or took too long: nothing is asked of it before this moment.
  let quietUntil = 0;

  const read = Effect.fn("readWaveStore")(function* (point: Point, now: number) {
    const found = yield* Cache.get(layouts, store.product);
    const { time, latitude, longitude } = found;
    const first = Math.max(0, Math.floor((now - PAST_MS - time.start) / time.step));
    if (first >= time.length) return null;

    // One variable at one cell, step by step: the pieces that hold its hours, unpacked.
    const unpacked = new Map<string, Int16Array | null>();
    const series = Effect.fn("readWaveStoreSeries")(function* (
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
          const packed = yield* readPiece(url);
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
        for (let step = from; step < until; step += 1) {
          const at =
            ((step % time.piece) * latitude.piece + (row % latitude.piece)) * longitude.piece +
            (column % longitude.piece);
          const stored = values?.[at] ?? variable.fill;
          raw.push(
            stored === variable.fill
              ? null
              : Number((stored * variable.scale + variable.offset).toFixed(variable.decimals)),
          );
        }
      }
      return raw;
    });

    // The nearest cell that has a sea at some hour is the one that is read.
    const others = (Object.keys(store.variables) as Value[]).filter((value) => value !== store.sea);
    for (const cell of cellsNear(found, point, store.reachKm)) {
      const sea = yield* series(store.sea, cell.row, cell.column);
      if (sea.every((value) => value === null)) continue;
      const rest = yield* Effect.all(
        others.map((value) => series(value, cell.row, cell.column)),
        { concurrency: 3 },
      );
      const values = { [store.sea]: sea } as Record<Value, (number | null)[]>;
      for (const [index, value] of others.entries()) values[value] = rest[index] ?? [];
      const answer: Read<Value> = {
        // A grid's steps are not round numbers: five decimals are a metre.
        point: {
          latitude: Number(cell.latitude.toFixed(5)),
          longitude: Number(cell.longitude.toFixed(5)),
        },
        time: Array.from(
          { length: time.length - first },
          (_, index) => (time.start + (first + index) * time.step) / 1000,
        ),
        values,
      };
      return answer;
    }
    return null;
  });

  return (point: Point, now: number) => {
    if (!store.covers(point) || now < quietUntil) return Effect.succeed(null);
    return read(point, now).pipe(
      Effect.timeoutOption(PATIENCE),
      Effect.flatMap((answered) =>
        answered._tag === "Some"
          ? Effect.succeed(answered.value)
          : Effect.logWarning(`the wave model ${store.product} took too long`).pipe(
              Effect.andThen(Effect.sync(() => (quietUntil = now + QUIET_MS))),
              Effect.as(null),
            ),
      ),
      Effect.catch((error) =>
        Effect.logWarning(`the wave model ${store.product} could not be read`, error).pipe(
          Effect.andThen(Effect.sync(() => (quietUntil = now + QUIET_MS))),
          Effect.as(null),
        ),
      ),
    );
  };
}

// The fine model. Its whole sea: the height, the period of the peak, the energy period, which is
// the mean period Open-Meteo gives for the other models, and where it comes from. And its first
// swell apart from the wind sea: its height and where it comes from.
const FINE_STORE: Store<
  "height" | "peakPeriod" | "meanPeriod" | "direction" | "swellHeight" | "swellDirection"
> = {
  product: "NWSHELF_ANALYSISFORECAST_WAV_004_014",
  datasetPrefix: "cmems_mod_nws_wav_anfc_1.5km_PT1H-i_",
  stepMs: HOUR_MS,
  variables: {
    height: "VHM0",
    peakPeriod: "VTPK",
    meanPeriod: "VTM10",
    direction: "VMDR",
    swellHeight: "VHM0_SW1",
    swellDirection: "VMDR_SW1",
  },
  sea: "height",
  reachKm: 4,
  covers: isInFineZone,
};

// The world's model, read for its first swell alone. Its grid is 9 km wide, so the sea is
// looked for further from the shore.
const SWELL_STORE: Store<"swellHeight" | "swellDirection"> = {
  product: "GLOBAL_ANALYSISFORECAST_WAV_001_027",
  datasetPrefix: "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i_",
  stepMs: 3 * HOUR_MS,
  variables: { swellHeight: "VHM0_SW1", swellDirection: "VMDR_SW1" },
  sea: "swellHeight",
  reachKm: 14,
  covers: () => true,
};

/** The fine model's waves at a point: a value for each hour it has, null where it has none. */
export type FineWaves = {
  model: typeof FINE_WAVE_MODEL.id;
  point: Point;
  // Seconds since 1970, one for each hour, in order.
  time: number[];
} & Record<keyof typeof FINE_STORE.variables, (number | null)[]>;

/** The swell the world's model gives apart, at a point, every three hours. */
export type Swell = {
  model: typeof SWELL_MODEL.id;
  point: Point;
  // Seconds since 1970, one every three hours, in order.
  time: number[];
} & Record<keyof typeof SWELL_STORE.variables, (number | null)[]>;

/** What reads the fine model at a point. It answers null outside its sea, and when it cannot. */
export function makeFineWaves() {
  const read = makeWaveStore(FINE_STORE);
  return (point: Point, now = Date.now()) =>
    read(point, now).pipe(
      Effect.map((found): FineWaves | null =>
        found
          ? { model: FINE_WAVE_MODEL.id, point: found.point, time: found.time, ...found.values }
          : null,
      ),
    );
}

/** What reads the swell apart at a point. It answers null where it has no sea, and when it cannot. */
export function makeSwell() {
  const read = makeWaveStore(SWELL_STORE);
  return (point: Point, now = Date.now()) =>
    read(point, now).pipe(
      Effect.map((found): Swell | null =>
        found
          ? { model: SWELL_MODEL.id, point: found.point, time: found.time, ...found.values }
          : null,
      ),
    );
}

export type FetchFineWaves = ReturnType<typeof makeFineWaves>;
export type FetchSwell = ReturnType<typeof makeSwell>;

// The stores, for the tests of what reads them.
export const STORES = { fine: FINE_STORE, swell: SWELL_STORE };
