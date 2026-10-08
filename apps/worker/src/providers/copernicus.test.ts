import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  buildSnapshot,
  fileUrls,
  parseDataset,
  parsePlatforms,
  parseProduct,
  readFile,
  type Layout,
  type Row,
} from "./copernicus";
import { FormatError } from "./format-error";

const now = new Date("2026-10-08T12:15:00Z");
const AT_1000 = Date.UTC(2026, 9, 8, 10) / 1000;
const AT_1100 = Date.UTC(2026, 9, 8, 11) / 1000;

const UNITS: Record<string, string> = {
  VHM0: "m",
  VZMX: "m",
  VTPK: "s",
  VTZA: "s",
  VTM02: "s",
  VPED: "degree",
  VPSP: "degree",
  TEMP: "degrees_C",
};

// The dataset's record, cut down to what the parser reads.
function dataset(change: (record: ReturnType<typeof wholeDataset>) => void = () => {}) {
  const record = wholeDataset();
  change(record);
  return record;
}

function wholeDataset() {
  const perVariable = <Value>(value: Value) =>
    Object.fromEntries(Object.keys(UNITS).map((name) => [name, value])) as Record<string, Value>;

  return {
    properties: {
      "cube:variables": Object.fromEntries(
        Object.entries(UNITS).map(([name, unit]) => [name, { id: name, unit }]),
      ) as Record<string, { id: string; unit: string }>,
    },
    assets: {
      platforms: { href: "https://store.example/latest/platforms.json.gz" },
      timeChunked: {
        href: "https://store.example/latest/timeChunked",
        viewDims: {
          time: {
            chunkLen: perVariable<number | null>(86_400),
            chunkRefCoord: 1_706_400_000,
            chunkType: "default",
          },
          longitude: { chunkLen: perVariable<number | null>(null) },
          latitude: { chunkLen: perVariable<number | null>(null) },
        },
      },
    },
  };
}

function layout(): Layout {
  const parsed = parseDataset(dataset());
  if (parsed instanceof FormatError) throw parsed;
  return parsed;
}

function row(change: Partial<Row> = {}): Row {
  return {
    platformId: "6200024___MO",
    platformType: "MO",
    timeS: AT_1100,
    longitude: -3.04,
    latitude: 43.64,
    elevation: 0,
    value: 3.16,
    flag: 1,
    ...change,
  };
}

const INSTITUTIONS = new Map([
  ["6200024___MO", "Puertos del Estado"],
  ["6200091___MO", "Marine Institute"],
  ["Leixoes-coast-buoy___MO", "Puertos del Estado"],
]);

function snapshot(rows: Record<string, Row[]>, institutions = INSTITUTIONS) {
  return buildSnapshot(new Map(Object.entries(rows)), institutions, now);
}

// A file as the store serves it: a SQLite database with the table of one variable.
function file(rows: unknown[][], create = TABLE) {
  const database = new DatabaseSync(":memory:");
  database.exec(create);
  for (const values of rows) {
    database
      .prepare("insert into data values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(...(values as (string | number | null)[]));
  }
  const bytes = database.serialize();
  database.close();
  return bytes;
}

const TABLE = `create table data (
  platform_id text, platform_type text, time integer, longitude real, latitude real,
  elevation real, is_approx_elevation integer, pressure real, value real, value_qc integer
)`;

describe("parseProduct", () => {
  it("finds the record of the dataset of latest measurements", () => {
    const links = [
      { rel: "item", title: "History", href: "ins--ext--history/dataset.stac.json" },
      { rel: "item", title: "Latest", href: "ins--ext--latest/dataset.stac.json" },
      { rel: "license", title: "Licence", href: "https://marine.copernicus.eu/licence" },
    ];

    expect(parseProduct({ links })).toBe(
      "https://stac.marine.copernicus.eu/metadata/INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033/ins--ext--latest/dataset.stac.json",
    );
  });

  it("reports a product that names no such dataset, or two", () => {
    const latest = { rel: "item", title: "Latest", href: "latest/dataset.stac.json" };

    expect(parseProduct({ links: [] })).toBeInstanceOf(FormatError);
    expect(parseProduct({ links: [latest, latest] })).toBeInstanceOf(FormatError);
    expect(parseProduct("<html></html>")).toBeInstanceOf(FormatError);
  });
});

describe("parseDataset", () => {
  it("reads where the files are and how each variable is cut in time", () => {
    expect(layout()).toEqual({
      filesUrl: "https://store.example/latest/timeChunked",
      platformsUrl: "https://store.example/latest/platforms.json.gz",
      timeOriginS: 1_706_400_000,
      stretchS: Object.fromEntries(Object.keys(UNITS).map((name) => [name, 86_400])),
    });
  });

  it("reports a change of unit instead of storing wrong values", () => {
    const result = parseDataset(
      dataset((record) => {
        record.properties["cube:variables"].VHM0 = { id: "VHM0", unit: "cm" };
      }),
    );

    expect(result).toBeInstanceOf(FormatError);
    expect(result).toMatchObject({ message: expect.stringContaining("VHM0") });
  });

  it("reports files that are cut in another way than by time", () => {
    const byLongitude = dataset((record) => {
      record.assets.timeChunked.viewDims.longitude.chunkLen.VHM0 = 10;
    });
    const otherType = dataset((record) => {
      record.assets.timeChunked.viewDims.time.chunkType = "geometric";
    });
    const noLength = dataset((record) => {
      record.assets.timeChunked.viewDims.time.chunkLen.VTPK = null;
    });

    for (const record of [byLongitude, otherType, noLength]) {
      expect(parseDataset(record)).toBeInstanceOf(FormatError);
    }
  });

  it("reports an answer that is not the dataset's record", () => {
    expect(parseDataset({ message: "Not Found" })).toBeInstanceOf(FormatError);
  });
});

describe("fileUrls", () => {
  it("names the file of the stretch of time that holds the window", () => {
    // Twelve hours back from 12:15 stay within the day that started 618 days after the origin.
    expect(fileUrls(layout(), "VHM0", new Date("2026-10-08T12:15:00Z"))).toEqual([
      "https://store.example/latest/timeChunked/VHM0/984.0.0.0.sqlite",
    ]);
  });

  it("names two files when the window crosses a cut", () => {
    expect(fileUrls(layout(), "VHM0", new Date("2026-10-08T06:00:00Z"))).toEqual([
      "https://store.example/latest/timeChunked/VHM0/983.0.0.0.sqlite",
      "https://store.example/latest/timeChunked/VHM0/984.0.0.0.sqlite",
    ]);
  });
});

describe("parsePlatforms", () => {
  const index = {
    platforms: {
      "6200024___MO": { ptype: "MO", inst: "__0" },
      "6200091___MO": { ptype: "MO", inst: "__1" },
      Unknown___MO: { ptype: "MO", inst: "__9" },
    },
    dicts: { inst: { __0: "Puertos del Estado", __1: " Marine Institute " } },
  };

  it("gives the institution of each platform that has one", () => {
    const institutions = parsePlatforms(gzipSync(JSON.stringify(index)));

    expect(institutions).toEqual(
      new Map([
        ["6200024___MO", "Puertos del Estado"],
        ["6200091___MO", "Marine Institute"],
      ]),
    );
  });

  it("reads an index that was decompressed on the way", () => {
    const institutions = parsePlatforms(new TextEncoder().encode(JSON.stringify(index)));

    expect(institutions).toBeInstanceOf(Map);
    expect(institutions).toHaveProperty("size", 2);
  });

  it("reports an index it cannot read", () => {
    expect(parsePlatforms(new TextEncoder().encode("<Error/>"))).toBeInstanceOf(FormatError);
    expect(parsePlatforms(gzipSync("{}"))).toBeInstanceOf(FormatError);
  });
});

describe("readFile", () => {
  const since = new Date(AT_1000 * 1000);

  it("reads the rows from a moment on", () => {
    const bytes = file([
      ["6200024___MO", "MO", AT_1000 - 3600, -3.04, 43.64, 0, 0, null, 3.52, 1],
      ["6200024___MO", "MO", AT_1100, -3.04, 43.64, 0, 0, null, 3.16, 1],
      ["Donostia-buoy___MO", "MO", AT_1100, -2.02, 43.56, null, 0, null, null, 9],
    ]);

    expect(readFile(bytes, "VHM0", since)).toEqual({
      rejected: 0,
      rows: [
        row(),
        {
          platformId: "Donostia-buoy___MO",
          platformType: "MO",
          timeS: AT_1100,
          longitude: -2.02,
          latitude: 43.56,
          elevation: 0,
          value: null,
          flag: 9,
        },
      ],
    });
  });

  it("rejects a row whose columns do not hold what they should", () => {
    const bytes = file([
      ["6200024___MO", "MO", AT_1100, -3.04, 43.64, 0, 0, null, "3,16", 1],
      ["6200024___MO", "MO", AT_1100, null, 43.64, 0, 0, null, 3.16, 1],
      ["6200024___MO", "MO", AT_1100, -3.04, 43.64, 0, 0, null, 3.16, 1],
    ]);
    const result = readFile(bytes, "VHM0", since);
    if (result instanceof FormatError) throw result;

    expect(result.rejected).toBe(2);
    expect(result.rows).toEqual([row()]);
  });

  it("reports a file that is not a database, or not the table it reads", () => {
    const otherColumns = file([], "create table data (platform_id text, time integer, value real)");
    const view = file([], "create table rows (value real); create view data as select * from rows");

    expect(readFile(new TextEncoder().encode("<Error/>"), "VHM0", since)).toBeInstanceOf(
      FormatError,
    );
    expect(readFile(otherColumns, "VHM0", since)).toBeInstanceOf(FormatError);
    expect(readFile(view, "VHM0", since)).toBeInstanceOf(FormatError);
  });
});

describe("buildSnapshot", () => {
  it("gathers the variables of one mooring and moment into a reading", () => {
    const { stations, readings, rejected } = snapshot({
      VHM0: [row()],
      VZMX: [row({ value: 5.28 })],
      VTPK: [row({ value: 10.16 })],
      VTZA: [row({ value: 6.88 })],
      VPED: [row({ value: 321 })],
      VPSP: [row({ value: 24 })],
      TEMP: [row({ value: 20.59 })],
    });

    expect(rejected).toBe(0);
    expect(stations).toEqual([
      {
        providerStationId: "6200024",
        name: "6200024",
        latitude: 43.64,
        longitude: -3.04,
        licenseType: "copernicus-marine",
        licenseUrl: "https://marine.copernicus.eu/user-corner/service-commitments-and-licence",
        attribution:
          "Puertos del Estado. Generated using E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00043",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "6200024",
        observedAt: new Date("2026-10-08T11:00:00Z"),
        significantHeightM: 3.16,
        maxHeightM: 5.28,
        peakPeriodS: 10.16,
        meanPeriodS: 6.88,
        peakDirectionDeg: 321,
        directionalSpreadDeg: 24,
        waterTemperatureC: 20.59,
      },
    ]);
  });

  it("takes the spectral mean period when the zero-crossing one is missing", () => {
    const both = snapshot({
      VHM0: [row()],
      VTZA: [row({ value: 6.88 })],
      VTM02: [row({ value: 7.2 })],
    });
    const spectralOnly = snapshot({
      VHM0: [row()],
      VTZA: [row({ value: null, flag: 9 })],
      VTM02: [row({ value: 7.2 })],
    });

    expect(both.readings[0]?.meanPeriodS).toBe(6.88);
    expect(spectralOnly.readings[0]?.meanPeriodS).toBe(7.2);
  });

  it("keeps one reading per moment, and none without a wave height", () => {
    const { stations, readings } = snapshot({
      VHM0: [row({ timeS: AT_1000, value: 3.28 }), row()],
      VTPK: [row({ value: 10.16 }), row({ timeS: AT_1100 - 1800, value: 9.9 })],
    });

    expect(
      readings.map((reading) => [reading.observedAt.toISOString(), reading.peakPeriodS]),
    ).toEqual([
      ["2026-10-08T10:00:00.000Z", undefined],
      ["2026-10-08T11:00:00.000Z", 10.16],
    ]);
    expect(stations).toHaveLength(1);
  });

  it("leaves out a value whose flag says not to use it, and keeps one nobody flagged", () => {
    const { readings } = snapshot({
      VHM0: [row({ flag: 0 })],
      VTPK: [row({ value: 10.16, flag: 4 })],
      VTZA: [row({ value: 6.88, flag: null })],
      VPED: [row({ value: 321, flag: 8 })],
    });

    expect(readings).toEqual([
      {
        providerStationId: "6200024",
        observedAt: new Date("2026-10-08T11:00:00Z"),
        significantHeightM: 3.16,
        meanPeriodS: 6.88,
      },
    ]);
  });

  it("leaves out a mooring whose wave height is flagged bad or cannot be", () => {
    const flagged = snapshot({ VHM0: [row({ flag: 4 })], VTPK: [row({ value: 10 })] });
    const impossible = snapshot({ VHM0: [row({ value: 99 })] });

    expect(flagged).toEqual({ stations: [], readings: [], rejected: 0 });
    expect(impossible.readings).toEqual([]);
  });

  it("reads moorings only", () => {
    const { stations } = snapshot({
      VHM0: [
        row(),
        row({ platformId: "PasaiaTG___TG", platformType: "TG" }),
        row({ platformId: "6204567___DB", platformType: "DB" }),
        row({ platformId: "6200024", platformType: "MO" }),
      ],
    });

    expect(stations.map((station) => station.providerStationId)).toEqual(["6200024"]);
  });

  it("leaves out the buoys that another provider already gives", () => {
    const { stations } = snapshot({
      VHM0: [
        row(),
        row({ platformId: "6200091___MO" }),
        row({ platformId: "Leixoes-coast-buoy___MO" }),
      ],
    });

    expect(stations.map((station) => station.providerStationId)).toEqual(["6200024"]);
  });

  it("takes the sea temperature nearest the surface, and none from above it", () => {
    const { readings } = snapshot({
      VHM0: [row()],
      TEMP: [
        row({ value: 18.2, elevation: -3 }),
        row({ value: 20.59, elevation: -0.5 }),
        row({ value: 19.1, elevation: -1 }),
        row({ value: 15.3, elevation: 2 }),
      ],
    });

    expect(readings[0]?.waterTemperatureC).toBe(20.59);
  });

  it("rejects a row with a time or a position that cannot be, or a flag it does not know", () => {
    const result = snapshot({
      VHM0: [
        row({ timeS: 4_102_444_800_000 }),
        row({ timeS: AT_1100 + 0.5 }),
        row({ latitude: 143.64 }),
        row({ flag: 42 }),
        row({ platformId: "___MO" }),
        row({ platformId: "Donostia-buoy___MO", longitude: -2.02, latitude: 43.56, value: 3.75 }),
      ],
    });

    expect(result.rejected).toBe(5);
    expect(result.stations.map((station) => station.providerStationId)).toEqual(["Donostia-buoy"]);
  });

  it("leaves out a row older than the window, without counting it", () => {
    const old = AT_1100 - 13 * 3600;

    expect(snapshot({ VHM0: [row({ timeS: old })] })).toEqual({
      stations: [],
      readings: [],
      rejected: 0,
    });
  });

  it("places a mooring where its latest row puts it, and credits Copernicus alone when the owner is unknown", () => {
    const { stations } = snapshot({
      VHM0: [
        row({ platformId: "Drifting___MO", timeS: AT_1100, latitude: 44.2, longitude: -4.1 }),
        row({ platformId: "Drifting___MO", timeS: AT_1000, latitude: 44, longitude: -4 }),
      ],
    });

    expect(stations).toEqual([
      expect.objectContaining({
        providerStationId: "Drifting",
        latitude: 44.2,
        longitude: -4.1,
        attribution:
          "Generated using E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00043",
      }),
    ]);
  });
});
