import { describe, expect, it } from "vitest";

import {
  cellOf,
  chunkAt,
  chunkStart,
  covers,
  fileUrl,
  gridOf,
  isGlobal,
  metaOf,
  OpenDataError,
  pointAt,
} from "./open-data";

// The layout of Open-Meteo's bucket, as its files are found and their grids read: decision 058.

const META = {
  chunk_time_length: 193,
  temporal_resolution_seconds: 3600,
  last_run_initialisation_time: 1792076400,
  data_end_time: 1792188000,
  update_interval_seconds: 10800,
  crs_wkt:
    'GEOGCRS["WGS 84",\n    USAGE[\n        SCOPE["grid"],\n        BBOX[29.5,-23.5,70.5,62.5]]]',
};

describe("a model's description", () => {
  it("gives its chunks, its step, its last run and the box of its grid", () => {
    expect(metaOf(META)).toEqual({
      chunkSteps: 193,
      stepSeconds: 3600,
      lastRunAt: 1792076400,
      dataEndAt: 1792188000,
      box: { south: 29.5, west: -23.5, north: 70.5, east: 62.5 },
    });
  });

  it("is refused when it changed shape, or names no grid", () => {
    expect(metaOf({ chunk_time_length: "many" })).toBeInstanceOf(OpenDataError);
    expect(metaOf({ ...META, crs_wkt: "PROJCRS[]" })).toBeInstanceOf(OpenDataError);
  });
});

describe("a chunk", () => {
  const meta = { chunkSteps: 193, stepSeconds: 3600 };

  it("is numbered by the second it starts at, divided by its length", () => {
    // 2026-10-15T20:00Z fell in chunk 2579 of a model of 193 hourly steps.
    expect(chunkAt(meta, Date.UTC(2026, 9, 15, 20) / 1000)).toBe(2579);
    expect(chunkStart(meta, 2579)).toBe(2579 * 193 * 3600);
    // A three-hourly model counts its steps three hours apart.
    expect(chunkAt({ chunkSteps: 104, stepSeconds: 10800 }, Date.UTC(2026, 9, 15, 20) / 1000)).toBe(
      1595,
    );
  });

  it("is named in the bucket by its model and its variable", () => {
    expect(fileUrl.chunk("dwd_icon_eu", "wind_u_component_10m", 2579)).toBe(
      "https://openmeteo.s3.amazonaws.com/data/dwd_icon_eu/wind_u_component_10m/chunk_2579.om",
    );
    expect(fileUrl.landMask("meteofrance_wave")).toBe(
      "https://openmeteo.s3.amazonaws.com/data/meteofrance_wave/static/HSURF.om",
    );
  });
});

describe("a grid", () => {
  const europe = gridOf({ south: 29.5, west: -23.5, north: 70.5, east: 62.5 }, 657, 1377);
  const world = gridOf({ south: -90, west: -180, north: 90, east: 179.75 }, 721, 1440);

  it("has the width of a cell from its box and its size", () => {
    expect(europe.dy).toBeCloseTo(0.0625, 6);
    expect(europe.dx).toBeCloseTo(0.0625, 6);
    expect(isGlobal(europe)).toBe(false);
    expect(isGlobal(world)).toBe(true);
  });

  it("finds the nearest cell of a point, and null off the grid", () => {
    expect(cellOf(europe, { latitude: 43.40861, longitude: -2.69472 })).toEqual({
      row: 223,
      column: 333,
    });
    expect(pointAt(europe, { row: 223, column: 333 })).toEqual({
      latitude: 43.4375,
      longitude: -2.6875,
    });
    expect(cellOf(europe, { latitude: 10, longitude: 10 })).toBeNull();
    expect(cellOf(europe, { latitude: 50, longitude: 70 })).toBeNull();
  });

  it("wraps the columns of a global grid", () => {
    expect(cellOf(world, { latitude: 0, longitude: 179.9 })).toEqual({ row: 360, column: 0 });
    expect(cellOf(world, { latitude: 0, longitude: -179.9 })).toEqual({ row: 360, column: 0 });
    expect(cellOf(world, { latitude: -38.37, longitude: 144.28 })).toEqual({
      row: 207,
      column: 1297,
    });
  });

  it("says whether a box covers a point", () => {
    expect(covers(europe, { latitude: 43.4, longitude: -2.7 })).toBe(true);
    expect(covers(europe, { latitude: 20, longitude: -2.7 })).toBe(false);
  });
});
