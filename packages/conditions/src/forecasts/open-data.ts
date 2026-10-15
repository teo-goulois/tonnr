import { OmDataType, type OmFileReader as Reader } from "@openmeteo/file-reader";
import { fetchJson, fetchRange, UpstreamError } from "@repo/upstream";
import { Cache, Duration, Effect, Exit, Schema } from "effect";
import { z } from "zod";

// Open-Meteo publishes the files its API reads on a public bucket, under CC-BY-4.0: one folder a
// model, one a variable, and files of a fortnight of hours in its own format, OM, chunked so
// that one point is read in a few kilobytes by range requests. This module reads them: a model's
// description, a series at a grid point, and the land mask that says where the sea is. It knows
// the bucket's layout and nothing of the models' meaning, which `model-files.ts` has. Decision 058.

export const BUCKET_URL = "https://openmeteo.s3.amazonaws.com";

/** A grid point, or a point of the earth. */
export type Point = { latitude: number; longitude: number };

export class OpenDataError extends Schema.TaggedError<OpenDataError>()("OpenDataError", {
  message: Schema.String,
}) {}

const fault = (message: string) => new OpenDataError({ message: `Open-Meteo's files: ${message}` });

// What a model says of itself in `static/meta.json`: its grid as a box, the length of its chunks
// in steps, the length of a step, and its last run.
const metaSchema = z.object({
  chunk_time_length: z.number().int().positive(),
  temporal_resolution_seconds: z.number().int().positive(),
  last_run_initialisation_time: z.number().int(),
  data_end_time: z.number().int(),
  crs_wkt: z.string(),
});

/** A model's description, as its `meta.json` gives it. */
export type Meta = {
  /** How many steps a chunk holds, and how long a step is, in seconds. */
  chunkSteps: number;
  stepSeconds: number;
  /** When the last run started, and the last hour its data reaches, in seconds since 1970. */
  lastRunAt: number;
  dataEndAt: number;
  /** The box of the grid, as the file labels its first and last rows and columns. */
  box: { south: number; west: number; north: number; east: number };
};

/** A regular grid: its box, its size, and the width of a cell. */
export type Grid = Meta["box"] & { ny: number; nx: number; dy: number; dx: number };

export function metaOf(json: unknown): Meta | OpenDataError {
  const parsed = metaSchema.safeParse(json);
  if (!parsed.success) return fault("a model's description changed shape");
  // `BBOX[south, west, north, east]`, inside the WKT of the grid's coordinate system.
  const bbox = /BBOX\[([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\]/.exec(parsed.data.crs_wkt);
  if (!bbox) return fault("a model's description names no grid");
  const [south, west, north, east] = bbox.slice(1).map(Number) as [number, number, number, number];
  return {
    chunkSteps: parsed.data.chunk_time_length,
    stepSeconds: parsed.data.temporal_resolution_seconds,
    lastRunAt: parsed.data.last_run_initialisation_time,
    dataEndAt: parsed.data.data_end_time,
    box: { south, west, north, east },
  };
}

/** A chunk's number: the second asked, divided by the length of a chunk in seconds. */
export function chunkAt(meta: Pick<Meta, "chunkSteps" | "stepSeconds">, seconds: number) {
  return Math.floor(seconds / (meta.chunkSteps * meta.stepSeconds));
}

/** The first second of a chunk. */
export function chunkStart(meta: Pick<Meta, "chunkSteps" | "stepSeconds">, chunk: number) {
  return chunk * meta.chunkSteps * meta.stepSeconds;
}

/** A grid from a model's box and the size of its files. */
export function gridOf(box: Meta["box"], ny: number, nx: number): Grid {
  return {
    ...box,
    ny,
    nx,
    dy: ny > 1 ? (box.north - box.south) / (ny - 1) : 1,
    dx: nx > 1 ? (box.east - box.west) / (nx - 1) : 1,
  };
}

/** Whether a grid goes round the earth, so that its last column neighbours its first. */
export function isGlobal(grid: Grid) {
  return grid.east - grid.west + grid.dx >= 360 - 1e-6;
}

/**
 * The row and the column of the grid point nearest a point, or null when the point is off the
 * grid. A global grid wraps its columns.
 */
export function cellOf(grid: Grid, point: Point) {
  const row = Math.round((point.latitude - grid.south) / grid.dy);
  if (row < 0 || row >= grid.ny) return null;
  let column = Math.round((point.longitude - grid.west) / grid.dx);
  if (isGlobal(grid)) column = ((column % grid.nx) + grid.nx) % grid.nx;
  else if (column < 0 || column >= grid.nx) return null;
  return { row, column };
}

/** The point of the earth a grid cell stands at. */
export function pointAt(grid: Grid, cell: { row: number; column: number }): Point {
  // A grid's steps are not round numbers: five decimals are a metre.
  return {
    latitude: Number((grid.south + cell.row * grid.dy).toFixed(5)),
    longitude: Number((grid.west + cell.column * grid.dx).toFixed(5)),
  };
}

/** Whether a point lies in a model's box. */
export function covers(box: Meta["box"], point: Point) {
  return (
    point.latitude >= box.south &&
    point.latitude <= box.north &&
    point.longitude >= box.west &&
    point.longitude <= box.east
  );
}

// The reader asks for bytes by their offset. They are fetched in blocks and kept, so that the
// trailer and the index of a file are read once, and a chunk read for one cell answers its
// neighbours on the same row of the grid. A block is 64 KB, and 512 are kept: 32 MB.
export const BLOCK_BYTES = 64 * 1024;
const KEPT_BLOCKS = 512;

// What the bucket is asked at most for one block: a block, which a server that ignored the
// range would have to exceed to be refused.
const MAX_BLOCK_BYTES = BLOCK_BYTES;

// A model's description is read again every half hour: its runs come every three to twelve. A
// file's version is asked again after five minutes, by a probe of a few of its bytes.
const META_MS = 30 * 60 * 1000;
const VERSION_MS = 5 * 60 * 1000;
const PROBE_BYTES = 32;

type Range = (
  url: string,
  offset: number,
  size: number,
) => Effect.Effect<{ bytes: Uint8Array; total: number | null; etag: string | null }, UpstreamError>;

type Io = {
  json: (url: string) => Effect.Effect<unknown, UpstreamError>;
  range: Range;
};

/** A series of a variable at one grid point: the second of each step, and the value, null where none. */
export type Series = { time: number[]; values: (number | null)[] };

/** What reads the files of a model, through the one place that calls a provider. */
export type OpenData = {
  meta: (model: string) => Effect.Effect<Meta, OpenDataError>;
  /** The grid of a model, from its description and the size of one of its files. */
  grid: (model: string, variable: string, seconds: number) => Effect.Effect<Grid, OpenDataError>;
  /**
   * A variable at a grid cell over a span of seconds, the start included and the end left out,
   * from the chunks that hold it. A chunk the bucket does not have gives no value.
   */
  series: (
    model: string,
    variable: string,
    cell: { row: number; column: number },
    span: { from: number; until: number },
  ) => Effect.Effect<Series, OpenDataError>;
  /**
   * The land mask of a wave model around a cell: a square of `reach` cells each way, read from
   * `static/HSURF.om`, where -999 marks the sea. Each value says whether its cell is sea.
   */
  seaAround: (
    model: string,
    cell: { row: number; column: number },
    reach: number,
  ) => Effect.Effect<{ row: number; column: number; isSea: boolean }[], OpenDataError>;
};

/** How a file is named in the bucket. */
export const fileUrl = {
  meta: (model: string) => `${BUCKET_URL}/data/${model}/static/meta.json`,
  landMask: (model: string) => `${BUCKET_URL}/data/${model}/static/HSURF.om`,
  chunk: (model: string, variable: string, chunk: number) =>
    `${BUCKET_URL}/data/${model}/${variable}/chunk_${chunk}.om`,
};

/** The value -999 marks the sea in a model's land mask. */
const SEA = -999;

export function makeOpenData(io: Io = { json: fetchJson, range: fetchRange }): OpenData {
  // The blocks of the files, by file version and block number, newest last.
  const blocks = new Map<string, Promise<Uint8Array>>();
  const keep = (key: string, block: Promise<Uint8Array>) => {
    blocks.set(key, block);
    if (blocks.size > KEPT_BLOCKS) blocks.delete(blocks.keys().next().value!);
  };

  // A file's version and size, learnt by a probe of its first bytes and kept a few minutes: a
  // chunk is rewritten at each run of its model, and the blocks of a version are its alone.
  const versions = new Map<string, { etag: string | null; total: number; at: number }>();
  const probe = (url: string, signal: AbortSignal) => {
    const known = versions.get(url);
    if (known && Date.now() - known.at < VERSION_MS) return Promise.resolve(known);
    return Effect.runPromise(io.range(url, 0, PROBE_BYTES), { signal }).then(
      ({ total, etag, bytes }) => {
        const version = { etag, total: total ?? bytes.byteLength, at: Date.now() };
        versions.set(url, version);
        return version;
      },
    );
  };

  const CHANGED = " changed while it was being read";

  // A reader of one file, which fetches its blocks through `io` and keeps them. The version it
  // reads is the one its first probe found, for every block it reads after: a block that comes
  // with another, because the bucket rewrote the file meanwhile, fails the whole read, which is
  // tried once more from the new version. The signal stops every fetch of the reader.
  const backendOf = (url: string, signal: AbortSignal) => {
    let pinned: Promise<{ etag: string | null; total: number }> | null = null;
    const version = () => (pinned ??= probe(url, signal));
    const block = async (index: number) => {
      const own = await version();
      const key = `${url}@${own.etag ?? "?"}:${index}`;
      const kept = blocks.get(key);
      if (kept) return kept;
      // A block shared by the readers that wait for it is fetched with the first one's signal,
      // and bounded by the request's own timeout when that one gives up.
      const fetched = Effect.runPromise(io.range(url, index * BLOCK_BYTES, MAX_BLOCK_BYTES), {
        signal,
      }).then(({ bytes, etag }) => {
        if (etag !== own.etag) {
          versions.delete(url);
          throw fault(`${url}${CHANGED}`);
        }
        return bytes;
      });
      keep(key, fetched);
      fetched.catch(() => blocks.delete(key));
      return fetched;
    };
    return {
      count: async () => (await version()).total,
      getBytes: async (offset: number, size: number) => {
        const out = new Uint8Array(size);
        let written = 0;
        for (let at = offset; at < offset + size;) {
          if (signal.aborted) throw fault(`${url}: the read was stopped`);
          const index = Math.floor(at / BLOCK_BYTES);
          const bytes = await block(index);
          const start = at - index * BLOCK_BYTES;
          const part = bytes.subarray(start, Math.min(bytes.byteLength, start + size - written));
          if (part.byteLength === 0) throw fault(`${url} is shorter than its index says`);
          out.set(part, written);
          written += part.byteLength;
          at += part.byteLength;
        }
        return out;
      },
      close: async () => {},
    };
  };

  const isChanged = (error: OpenDataError) => error.message.endsWith(CHANGED);

  /**
   * Opens a file, lets `use` read it, and disposes it: one step, whose signal stops the fetches
   * of the reader when the step is interrupted or times out, and whose disposal waits for the
   * read to end. A file that changed under the read is read again, once, from its new version.
   */
  const withFile = <Value>(url: string, use: (file: Reader) => Promise<Value>) =>
    Effect.tryPromise({
      try: async (signal) => {
        const { OmFileReader } = await import("@openmeteo/file-reader");
        const file = await OmFileReader.create(backendOf(url, signal));
        try {
          return await use(file);
        } finally {
          file.dispose();
        }
      },
      catch: (cause) =>
        cause instanceof OpenDataError
          ? cause
          : cause instanceof UpstreamError
            ? new OpenDataError({ message: `${url}: ${cause.status ?? "could not be read"}` })
            : fault(`${url}: ${String(cause)}`),
    }).pipe(Effect.retry({ times: 1, while: isChanged }));

  const metas = Effect.runSync(
    Cache.makeWith(
      (model: string) =>
        io.json(fileUrl.meta(model)).pipe(
          Effect.mapError((cause) =>
            fault(`the description of ${model}: ${cause.status ?? "unread"}`),
          ),
          Effect.flatMap((json) => {
            const meta = metaOf(json);
            return meta instanceof OpenDataError ? Effect.fail(meta) : Effect.succeed(meta);
          }),
        ),
      {
        capacity: 64,
        // A failure is not kept, so the next question asks again.
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.millis(META_MS) : Duration.zero),
      },
    ),
  );
  const meta = (model: string) => Cache.get(metas, model);

  // Whether a chunk file exists is learnt by opening it. One that the bucket lacks, because the
  // model has not reached those days, gives no value.
  const isMissing = (error: OpenDataError) => error.message.endsWith(" 404");

  const grid = Effect.fn("gridOf")(function* (model: string, variable: string, seconds: number) {
    const found = yield* meta(model);
    const url = fileUrl.chunk(model, variable, chunkAt(found, seconds));
    const dims = yield* withFile(url, async (file) => file.getDimensions());
    const [ny, nx] = dims;
    if (dims.length !== 3 || !ny || !nx) return yield* fault(`${url} is not a grid over time`);
    return gridOf(found.box, ny, nx);
  });

  const series = Effect.fn("seriesOf")(function* (
    model: string,
    variable: string,
    cell: { row: number; column: number },
    span: { from: number; until: number },
  ) {
    const found = yield* meta(model);
    const first = chunkAt(found, span.from);
    const last = chunkAt(found, span.until - 1);
    const chunks = Array.from({ length: last - first + 1 }, (_, index) => first + index);
    // The chunks of a span are read together: a span of eight days often straddles two.
    const reads = yield* Effect.all(
      chunks.map((chunk) =>
        withFile(fileUrl.chunk(model, variable, chunk), async (file) => {
          const [, , nt] = file.getDimensions();
          const floats = await file.read({
            type: OmDataType.FloatArray,
            ranges: [
              { start: cell.row, end: cell.row + 1 },
              { start: cell.column, end: cell.column + 1 },
              { start: 0, end: nt ?? 0 },
            ],
          });
          return Array.from(floats);
        }).pipe(Effect.catchIf(isMissing, () => Effect.succeed(null))),
      ),
      { concurrency: "unbounded" },
    );
    const time: number[] = [];
    const values: (number | null)[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const start = chunkStart(found, chunk);
      const read = reads[index];
      for (let step = 0; step < found.chunkSteps; step += 1) {
        const seconds = start + step * found.stepSeconds;
        if (seconds < span.from || seconds >= span.until) continue;
        const value = read?.[step];
        time.push(seconds);
        values.push(value === undefined || !Number.isFinite(value) ? null : value);
      }
    }
    return { time, values };
  });

  const seaAround = Effect.fn("seaAround")(function* (
    model: string,
    cell: { row: number; column: number },
    reach: number,
  ) {
    const url = fileUrl.landMask(model);
    const found = yield* meta(model);
    return yield* withFile(url, async (file) => {
      const [ny, nx] = file.getDimensions();
      if (!ny || !nx) throw fault(`${url} is not a grid`);
      const grid = gridOf(found.box, ny, nx);
      const rows = {
        start: Math.max(0, cell.row - reach),
        end: Math.min(ny, cell.row + reach + 1),
      };
      // A global grid's last column neighbours its first: a square across the seam is read in
      // two parts. A grid that ends is cut at its edge.
      const spans: { start: number; end: number }[] = [];
      const first = cell.column - reach;
      const last = cell.column + reach;
      if (isGlobal(grid) && (first < 0 || last >= nx)) {
        if (first < 0) spans.push({ start: first + nx, end: nx }, { start: 0, end: last + 1 });
        else spans.push({ start: first, end: nx }, { start: 0, end: last - nx + 1 });
      } else {
        spans.push({ start: Math.max(0, first), end: Math.min(nx, last + 1) });
      }
      const cells: { row: number; column: number; isSea: boolean }[] = [];
      for (const columns of spans) {
        const floats = await file.read({ type: OmDataType.FloatArray, ranges: [rows, columns] });
        const width = columns.end - columns.start;
        for (const [index, value] of floats.entries()) {
          cells.push({
            row: rows.start + Math.floor(index / width),
            column: columns.start + (index % width),
            isSea: value === SEA,
          });
        }
      }
      return cells;
    });
  });

  return { meta, grid, series, seaAround };
}
