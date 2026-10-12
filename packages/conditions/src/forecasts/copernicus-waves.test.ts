import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cellsNear,
  datasetUrl,
  FineWavesFormatError,
  layoutOf,
  makeFineWaves,
} from "./copernicus-waves";

const HOUR_MS = 3600 * 1000;
// 2026-10-09 00:00 UTC: the first hour of the store.
const START_MS = Date.UTC(2026, 9, 9);
// Three days and two hours later: the hours read start at the store's third.
const NOW = START_MS + (3 * 24 + 2) * HOUR_MS;
const STORE = "https://store.example.org/arco/waves.zarr";
const CATALOGUE = "https://stac.marine.copernicus.eu/metadata/NWSHELF_ANALYSISFORECAST_WAV_004_014";
const DATASET = "cmems_mod_nws_wav_anfc_1.5km_PT1H-i_202511";
const NAMES = ["VHM0", "VTPK", "VTM10", "VMDR"];
const FILL = -32767;

// A store of ten hours, six rows and four columns, cut in pieces of six hours and two by two
// cells. Le Petit Minou falls on the row 3 and the column 1.
const PRODUCT = {
  links: [
    { rel: "self", href: "product.stac.json" },
    { rel: "item", href: "cmems_mod_nws_wav_anfc_1.5km_PT1H-i_202311/dataset.stac.json" },
    { rel: "item", href: `${DATASET}/dataset.stac.json` },
    {
      rel: "item",
      href: "cmems_mod_nws_wav_anfc_1.5km_static_202511--ext--bathy/dataset.stac.json",
    },
  ],
};
const cut = (piece: number) => Object.fromEntries(NAMES.map((name) => [name, piece]));
const RECORD = {
  assets: {
    geoChunked: {
      href: STORE,
      viewDims: {
        time: {
          chunkLen: cut(6),
          units: "milliseconds since 1970-01-01 00:00:00Z (no leap seconds)",
          coords: {
            type: "minMaxStep",
            min: START_MS,
            max: START_MS + 9 * HOUR_MS,
            step: HOUR_MS,
            len: 10,
          },
        },
        latitude: {
          chunkLen: cut(2),
          coords: { type: "minMaxStep", min: 48.3, max: 48.3675, step: 0.0135, len: 6 },
        },
        longitude: {
          chunkLen: cut(2),
          coords: { type: "minMaxStep", min: -4.66, max: -4.5691, step: 0.0303, len: 4 },
        },
      },
    },
  },
};
const SCALES: Record<string, number> = { VHM0: 0.002, VTPK: 0.01, VTM10: 0.01, VMDR: 0.1 };
const DESCRIPTION = {
  metadata: Object.fromEntries(
    NAMES.flatMap((name) => [
      [
        `${name}/.zarray`,
        {
          chunks: [6, 2, 2],
          dtype: "<i2",
          order: "C",
          fill_value: FILL,
          compressor: { id: "blosc", cname: "lz4", clevel: 5, shuffle: 1, blocksize: 0 },
          filters: null,
        },
      ],
      [`${name}/.zattrs`, { scale_factor: SCALES[name], add_offset: 0 }],
    ]),
  ),
};

/** A piece as Blosc keeps what it could not pack: a header, then the values as they are. */
function piece(valueAt: (hour: number, row: number, column: number) => number) {
  const values = new Int16Array(6 * 2 * 2);
  for (let hour = 0; hour < 6; hour += 1) {
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        values[(hour * 2 + row) * 2 + column] = valueAt(hour, row, column);
      }
    }
  }
  const frame = new Uint8Array(16 + values.byteLength);
  const view = new DataView(frame.buffer);
  frame.set([2, 1, 0x02, 2]);
  view.setUint32(4, values.byteLength, true);
  view.setUint32(8, values.byteLength, true);
  view.setUint32(12, frame.byteLength, true);
  frame.set(new Uint8Array(values.buffer), 16);
  return frame;
}

// The sea is at the row 4 and the column 1 alone, which is the first row and the second column of
// the pieces `*.2.0`. The store has hours 0 to 9: the second piece in time holds four of them.
const seaAt = (stored: (hour: number) => number, hours: number) =>
  piece((hour, row, column) => (row === 0 && column === 1 && hour < hours ? stored(hour) : FILL));
const PIECES: Record<string, Uint8Array> = {
  "VHM0/0.2.0": seaAt((hour) => 100 + hour * 10, 6),
  "VHM0/1.2.0": seaAt((hour) => 160 + hour * 10, 4),
  "VTPK/0.2.0": seaAt(() => 1105, 6),
  "VTPK/1.2.0": seaAt(() => 1210, 4),
  "VTM10/0.2.0": seaAt(() => 885, 6),
  "VTM10/1.2.0": seaAt(() => 901, 4),
  "VMDR/0.2.0": seaAt(() => 2537, 6),
  "VMDR/1.2.0": seaAt(() => 2544, 4),
  // The pieces around hold land alone, and the store has none for the others.
  "VHM0/0.1.0": piece(() => FILL),
  "VHM0/1.1.0": piece(() => FILL),
};

/** A store in place of the network. It answers 403 for a piece it does not have, as the real one. */
function store(broken: { product?: number } = {}) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    if (address === `${CATALOGUE}/product.stac.json`) {
      return broken.product
        ? new Response("no", { status: broken.product })
        : Response.json(PRODUCT);
    }
    if (address === `${CATALOGUE}/${DATASET}/dataset.stac.json`) return Response.json(RECORD);
    if (address === `${STORE}/.zmetadata`) return Response.json(DESCRIPTION);
    const found = PIECES[address.slice(STORE.length + 1)];
    return found ? new Response(found) : new Response("no", { status: 403 });
  });
  return asked;
}

const PETIT_MINOU = { latitude: 48.3375, longitude: -4.616 };

describe("the record of the product", () => {
  it("names the dataset of the latest version", () => {
    expect(datasetUrl(PRODUCT)).toBe(`${CATALOGUE}/${DATASET}/dataset.stac.json`);
  });

  it("is refused when it holds no such dataset, or changed shape", () => {
    expect(datasetUrl({ links: [] })).toBeInstanceOf(FineWavesFormatError);
    expect(datasetUrl({ items: [] })).toBeInstanceOf(FineWavesFormatError);
  });
});

describe("the layout of the store", () => {
  it("is read from the dataset's record and the store's description", () => {
    expect(layoutOf(RECORD, DESCRIPTION)).toMatchObject({
      root: STORE,
      time: { start: START_MS, step: HOUR_MS, length: 10, piece: 6 },
      latitude: { start: 48.3, step: 0.0135, length: 6, piece: 2 },
      longitude: { start: -4.66, step: 0.0303, length: 4, piece: 2 },
      separator: ".",
      variables: { height: { name: "VHM0", scale: 0.002, offset: 0, fill: FILL } },
    });
  });

  it("is refused when a variable is stored or cut another way than expected", () => {
    const stored = (change: object) => ({
      metadata: {
        ...DESCRIPTION.metadata,
        "VTPK/.zarray": { ...DESCRIPTION.metadata["VTPK/.zarray"], ...change },
      },
    });

    expect(layoutOf(RECORD, stored({ dtype: "<f4" }))).toBeInstanceOf(FineWavesFormatError);
    expect(layoutOf(RECORD, stored({ chunks: [6, 4, 4] }))).toBeInstanceOf(FineWavesFormatError);
    expect(layoutOf(RECORD, stored({ compressor: { id: "zstd" } }))).toBeInstanceOf(
      FineWavesFormatError,
    );
  });

  it("is refused when the hours are counted another way", () => {
    const record = structuredClone(RECORD);
    record.assets.geoChunked.viewDims.time.units = "hours since 1950-01-01";

    expect(layoutOf(record, DESCRIPTION)).toBeInstanceOf(FineWavesFormatError);
  });
});

describe("the cells near a point", () => {
  const layout = layoutOf(RECORD, DESCRIPTION);
  if (layout instanceof FineWavesFormatError) throw layout;

  it("are those within reach inside the grid, nearest first", () => {
    const cells = cellsNear(layout, PETIT_MINOU);

    expect(cells[0]).toMatchObject({ row: 3, column: 1 });
    expect(cells.every((cell) => cell.away <= 4 && cell.row < 6 && cell.column < 4)).toBe(true);
    expect(cells.map((cell) => cell.away)).toEqual(
      cells.map((cell) => cell.away).sort((a, b) => a - b),
    );
  });

  it("are none for a point further from the grid than the reach", () => {
    expect(cellsNear(layout, { latitude: 48.5, longitude: -4.616 })).toEqual([]);
  });
});

describe("the fine model's waves at a point", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const run = <Value>(effect: Effect.Effect<Value>) => Effect.runPromise(effect);

  it("are those of the nearest cell that has a sea, hour by hour to the model's last", async () => {
    store();

    const waves = await run(makeFineWaves()(PETIT_MINOU, NOW));

    expect(waves?.model).toBe("nws_ww3");
    // The row 4 and the column 1: the cell under the point is land.
    expect(waves?.point).toEqual({ latitude: 48.354, longitude: -4.6297 });
    // From three days before now, which is the store's third hour, to its tenth.
    expect(waves?.time).toEqual(
      Array.from({ length: 8 }, (_, index) => (START_MS + (index + 2) * HOUR_MS) / 1000),
    );
    expect(waves?.height).toEqual([0.24, 0.26, 0.28, 0.3, 0.32, 0.34, 0.36, 0.38]);
    expect(waves?.peakPeriod).toEqual([11.05, 11.05, 11.05, 11.05, 12.1, 12.1, 12.1, 12.1]);
    expect(waves?.meanPeriod).toEqual([8.85, 8.85, 8.85, 8.85, 9.01, 9.01, 9.01, 9.01]);
    expect(waves?.direction).toEqual([253.7, 253.7, 253.7, 253.7, 254.4, 254.4, 254.4, 254.4]);
  });

  it("keep what was fetched for the next point nearby", async () => {
    const asked = store();
    const fineWaves = makeFineWaves();

    await run(fineWaves(PETIT_MINOU, NOW));
    const first = asked.length;
    await run(fineWaves({ latitude: 48.34, longitude: -4.62 }, NOW + 60_000));

    expect(first).toBeGreaterThan(3);
    expect(asked).toHaveLength(first);
  });

  it("are none where no cell within reach has a sea", async () => {
    store();

    // The rows 0 and 1 of the grid: land, and pieces the store does not have.
    expect(await run(makeFineWaves()({ latitude: 48.3, longitude: -4.66 }, NOW))).toBeNull();
  });

  it("are none outside the model's box, and nothing is asked", async () => {
    const asked = store();

    expect(await run(makeFineWaves()({ latitude: 43.66, longitude: -1.44 }, NOW))).toBeNull();
    expect(asked).toEqual([]);
  });

  it("are none when the store cannot be read: a forecast goes without them", async () => {
    store({ product: 400 });

    expect(await run(makeFineWaves()(PETIT_MINOU, NOW))).toBeNull();
  });

  it("are none when the store's last hour is long past", async () => {
    store();

    expect(await run(makeFineWaves()(PETIT_MINOU, NOW + 30 * 24 * HOUR_MS))).toBeNull();
  });
});
