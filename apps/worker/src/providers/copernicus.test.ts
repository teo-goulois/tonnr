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
          elevation: {
            chunkLen: perVariable<number | null>(5),
            chunkRefCoord: 0,
            chunkType: "symmetricGeometric",
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
  ["6200107___MO", "Met Office- Exeter"],
  ["6200029___MO", "Met Office- Exeter"],
]);

function snapshot(rows: Record<string, Row[]>, institutions = INSTITUTIONS) {
  return buildSnapshot(new Map(Object.entries(rows)), institutions, now);
}

// A file as the store serves it: a SQLite database with the table of one variable, and the
// notes of the file when it has some.
function file(rows: unknown[][], create = TABLE, notes?: string | null) {
  const database = new DatabaseSync(":memory:");
  database.exec(create);
  if (notes !== undefined) {
    database.exec("create table meta (metadata text)");
    database.prepare("insert into meta values (?)").run(notes);
  }
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

  it("reports files that are cut in another way than the parser takes them for", () => {
    const byLongitude = dataset((record) => {
      record.assets.timeChunked.viewDims.longitude.chunkLen.VHM0 = 10;
    });
    const otherType = dataset((record) => {
      record.assets.timeChunked.viewDims.time.chunkType = "geometric";
    });
    const noLength = dataset((record) => {
      record.assets.timeChunked.viewDims.time.chunkLen.VTPK = null;
    });
    const thinnerBand = dataset((record) => {
      record.assets.timeChunked.viewDims.elevation.chunkLen.TEMP = 2;
    });
    const otherDepths = dataset((record) => {
      record.assets.timeChunked.viewDims.elevation.chunkType = "default";
    });

    for (const record of [byLongitude, otherType, noLength, thinnerBand, otherDepths]) {
      expect(parseDataset(record)).toBeInstanceOf(FormatError);
    }
  });

  it("reports numbers that are not finite, which no file could be counted from", () => {
    const noOrigin = dataset((record) => {
      record.assets.timeChunked.viewDims.time.chunkRefCoord = Number.POSITIVE_INFINITY;
    });
    const noStretch = dataset((record) => {
      record.assets.timeChunked.viewDims.time.chunkLen.VHM0 = Number.POSITIVE_INFINITY;
    });

    expect(parseDataset(noOrigin)).toBeInstanceOf(FormatError);
    expect(parseDataset(noStretch)).toBeInstanceOf(FormatError);
  });

  it("reports an answer that is not the dataset's record", () => {
    expect(parseDataset({ message: "Not Found" })).toBeInstanceOf(FormatError);
  });
});

describe("fileUrls", () => {
  const files = "https://store.example/latest/timeChunked/VHM0";

  it("names the files of the stretches of time that hold the last three days", () => {
    // The stretches are a day long here, and 8 October 2026 is the 984th since the origin.
    expect(fileUrls(layout(), "VHM0", new Date("2026-10-08T12:15:00Z"))).toEqual([
      `${files}/981.0.0.0`,
      `${files}/982.0.0.0`,
      `${files}/983.0.0.0`,
      `${files}/984.0.0.0`,
    ]);
  });

  it("names one file when its stretch holds the whole window", () => {
    const weeks = { ...layout(), stretchS: { VHM0: 28 * 86_400 } };

    expect(fileUrls(weeks, "VHM0", new Date("2026-10-08T12:15:00Z"))).toEqual([
      `${files}/35.0.0.0`,
    ]);
  });

  it("reports a window that would take too many files", () => {
    const hours = { ...layout(), stretchS: { VHM0: 3600 } };

    expect(fileUrls(hours, "VHM0", now)).toBeInstanceOf(FormatError);
    expect(fileUrls(layout(), "UNKNOWN", now)).toBeInstanceOf(FormatError);
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
      overflowFiles: 0,
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

  it("says how many files continue the one it read", () => {
    const row_ = ["6200024___MO", "MO", AT_1100, -3.04, 43.64, 0, 0, null, 3.16, 1];
    const read = (notes: string | null) => readFile(file([row_], TABLE, notes), "VHM0", since);

    expect(read('{"overflow_chunks": 2}')).toMatchObject({ overflowFiles: 2, rows: [row()] });
    expect(read('{"overflow_chunks": 0}')).toMatchObject({ overflowFiles: 0 });
    expect(read("{}")).toMatchObject({ overflowFiles: 0 });
    expect(read("")).toMatchObject({ overflowFiles: 0 });
    expect(read(null)).toMatchObject({ overflowFiles: 0 });
  });

  it("reports notes it cannot read instead of taking the file for whole", () => {
    const read = (notes: string) => readFile(file([], TABLE, notes), "VHM0", since);

    for (const notes of [
      '{"overflow_chunks": "many"}',
      '{"overflow_chunks": null}',
      '{"overflow_chunks": 1.5}',
      '{"overflow_chunks": 1000}',
      "null",
      "[]",
      '"oops"',
      "not json",
    ]) {
      expect(read(notes)).toBeInstanceOf(FormatError);
    }
  });

  // Two files of some 200,000 rows each: half a second on a laptop, over five on a busy runner.
  it("reads many rows without failing, and stops at its limit", { timeout: 30_000 }, () => {
    const many = (count: number) => {
      const database = new DatabaseSync(":memory:");
      database.exec(TABLE);
      database.exec(
        `with recursive n(i) as (select 1 union all select i + 1 from n where i < ${count})
         insert into data select 'P' || i || '___MO', 'MO', ${AT_1100}, -3, 43, 0, 0, null, 1, 1 from n`,
      );
      const bytes = database.serialize();
      database.close();
      return readFile(bytes, "VHM0", since);
    };

    expect(many(150_000)).toMatchObject({ rejected: 0, overflowFiles: 0 });
    expect(many(200_001)).toBeInstanceOf(FormatError);
  });

  it("stops at what the run may still take", () => {
    const three = Array.from({ length: 3 }, (_, index) => [
      `P${index}___MO`,
      "MO",
      AT_1100,
      -3,
      43,
      0,
      0,
      null,
      1,
      1,
    ]);

    expect(readFile(file(three), "VHM0", since, 3)).toMatchObject({ rejected: 0 });
    expect(readFile(file(three), "VHM0", since, 2)).toBeInstanceOf(FormatError);
    expect(readFile(file(three), "VHM0", since, 0)).toBeInstanceOf(FormatError);
    // A file with nothing in the window takes nothing from the run.
    expect(readFile(file([]), "VHM0", since, 0)).toMatchObject({ rows: [] });
  });

  it("reports a file that holds anything but the two plain tables", () => {
    const refused = [
      // Other columns, one more column, and a column with an expression.
      "create table data (platform_id text, time integer, value real)",
      TABLE.replace("value_qc integer", "value_qc integer, instrument text"),
      TABLE.replace("value real", "value real check (length(hex(randomblob(1000))) > 0)"),
      TABLE.replace("value real", "value real default (random())"),
      // An index, a view, a trigger, another table.
      `${TABLE}; create index data_time on data (time)`,
      "create table rows (value real); create view data as select * from rows",
      `${TABLE}; create trigger t after insert on data begin select 1; end`,
      `${TABLE}; create table other (x check (length(hex(randomblob(1000))) > 0))`,
    ];

    expect(readFile(new TextEncoder().encode("<Error/>"), "VHM0", since)).toBeInstanceOf(
      FormatError,
    );
    for (const create of refused) {
      expect(readFile(file([], create), "VHM0", since)).toBeInstanceOf(FormatError);
    }
  });

  it("reads the table as the store declares it, with its comment", () => {
    const declared = `CREATE TABLE data (
      platform_id TEXT,
      platform_type TEXT,
      time INTEGER,               -- Unix time (s)
      longitude REAL,
      latitude REAL,
      elevation REAL,
      is_approx_elevation INTEGER,
      pressure REAL,
      value REAL,
      value_qc INTEGER
    )`;
    const bytes = file(
      [["6200024___MO", "MO", AT_1100, -3.04, 43.64, 0, 0, null, 3.16, 1]],
      declared,
    );

    expect(readFile(bytes, "VHM0", since)).toMatchObject({ rows: [row()] });
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

  it("leaves out the buoys whose waves another provider already gives", () => {
    const { stations } = snapshot({
      VHM0: [
        row(),
        row({ platformId: "6200091___MO" }),
        row({ platformId: "Leixoes-coast-buoy___MO" }),
        // NDBC relays the waves of this Met Office lightship, and only the wind of the next buoy.
        row({ platformId: "6200107___MO" }),
        row({ platformId: "6200029___MO" }),
      ],
    });

    expect(stations.map((station) => station.providerStationId)).toEqual(["6200024", "6200029"]);
  });

  it("takes the sea temperature nearest the surface, within five metres of it", () => {
    const depths = (...rows: Row[]) =>
      snapshot({ VHM0: [row()], TEMP: rows }).readings[0]?.waterTemperatureC;
    const three = [
      row({ value: 18.2, elevation: -3 }),
      row({ value: 20.59, elevation: -0.5 }),
      row({ value: 19.1, elevation: -1 }),
    ];

    expect(depths(...three)).toBe(20.59);
    // The air above, and the water ten metres down, are not the sea surface.
    expect(depths(row({ value: 15.3, elevation: 2 }), row({ value: 21, elevation: -10 }))).toBe(
      undefined,
    );
  });

  it("takes the nearest depth that has a usable value, in whatever order the rows come", () => {
    const rows = [
      row({ value: null, elevation: 0, flag: 9 }),
      row({ value: 18, elevation: -3 }),
      row({ value: 20, elevation: -1 }),
      row({ value: 99, elevation: -0.5, flag: 4 }),
    ];
    const orders = [rows, rows.toReversed(), [rows[2], rows[0], rows[3], rows[1]]] as Row[][];

    for (const order of orders) {
      const { readings } = snapshot({ VHM0: [row()], TEMP: order });
      expect(readings[0]?.waterTemperatureC).toBe(20);
    }
  });

  it("keeps the zero-crossing period whatever the spectral one says at any depth", () => {
    const { readings } = snapshot({
      VHM0: [row()],
      VTZA: [row({ value: 6 })],
      VTM02: [row({ value: 7, elevation: -3 }), row({ value: 8, elevation: -1 })],
    });

    expect(readings[0]?.meanPeriodS).toBe(6);
  });

  it("ignores a row given twice, and rejects a moment for which two rows disagree", () => {
    const twice = snapshot({
      VHM0: [row(), row()],
      VTPK: [row({ value: 10 }), row({ value: 10 })],
    });
    expect(twice.rejected).toBe(0);
    expect(twice.readings).toMatchObject([{ significantHeightM: 3.16, peakPeriodS: 10 }]);

    const conflict = snapshot({
      VHM0: [row({ value: 2 }), row({ value: 8 }), row({ timeS: AT_1000 })],
      VTPK: [row({ value: 15 })],
    });
    expect(conflict.rejected).toBe(1);
    expect(conflict.readings.map((reading) => reading.observedAt.toISOString())).toEqual([
      "2026-10-08T10:00:00.000Z",
    ]);
  });

  it("finds two rows that disagree at one depth, in whatever order the rows come", () => {
    const rows = [
      row({ value: 18, elevation: -3 }),
      row({ value: 20, elevation: -1 }),
      row({ value: 21, elevation: -3 }),
    ];

    for (const order of [rows, rows.toReversed(), [rows[0], rows[2], rows[1]]] as Row[][]) {
      const result = snapshot({ VHM0: [row()], TEMP: order });
      expect(result.rejected).toBe(1);
      expect(result.readings).toEqual([]);
    }
  });

  it("takes two positions a rounding apart for the same spot", () => {
    const { readings, rejected } = snapshot({
      VHM0: [row()],
      VTPK: [row({ value: 15, longitude: -3.0400001 })],
    });

    expect(rejected).toBe(0);
    expect(readings).toMatchObject([{ significantHeightM: 3.16, peakPeriodS: 15 }]);
  });

  it("rejects a moment that two variables place at two spots", () => {
    const result = snapshot({
      VHM0: [row(), row({ timeS: AT_1000 })],
      VTPK: [row({ value: 15, longitude: -4 })],
    });

    expect(result.rejected).toBe(1);
    expect(result.readings.map((reading) => reading.observedAt.toISOString())).toEqual([
      "2026-10-08T10:00:00.000Z",
    ]);
  });

  it("places a mooring from a reading it keeps, not from one it rejects", () => {
    const { stations } = snapshot({
      VHM0: [
        row({ timeS: AT_1000, longitude: -2 }),
        row({ longitude: -3, value: 2 }),
        row({ longitude: -4, value: 8 }),
      ],
    });

    expect(stations).toMatchObject([{ providerStationId: "6200024", longitude: -2 }]);
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

  it("keeps a measurement that shows up two days late, with an hour to spare for the next run", () => {
    const { readings } = snapshot({ VHM0: [row({ timeS: AT_1100 - 48 * 3600 })] });

    expect(readings).toHaveLength(1);
  });

  it("leaves out a row older than the window, without counting it", () => {
    const old = AT_1100 - 73 * 3600;

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
