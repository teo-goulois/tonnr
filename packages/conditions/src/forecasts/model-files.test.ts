import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";

import {
  cellsAround,
  fetchFromFiles,
  handOver,
  HANDOVER_STEPS,
  hourly,
  hoursOf,
  seaCellOf,
  spanAt,
  turnedDirection,
  windOf,
} from "./model-files";
import { type Grid, gridOf, type Meta, type OpenData, OpenDataError } from "./open-data";
import { cellOf as storeCellOf, KEPT_DAYS, KEPT_PAST_DAYS } from "./open-meteo";

// A forecast built from the models' files, with a bucket that stands in memory: decision 058.

const HOUR = 3600;
const DAY = 24 * HOUR;

describe("the hand-over from a finer model to the next", () => {
  it("keeps the finer where it has a value, and blends its last three steps into the coarser", () => {
    const finer = [10, 10, 10, 10, 10, null, null, null];
    const coarser = [20, 20, 20, 20, 20, 20, 20, 20];
    const out = handOver(finer, coarser);
    expect(out.slice(0, 2)).toEqual([10, 10]);
    // A quarter, a half, three quarters of the coarser model over the last three steps.
    expect(out.slice(2, 5)).toEqual([12.5, 15, 17.5]);
    expect(out.slice(5)).toEqual([20, 20, 20]);
    expect(HANDOVER_STEPS).toBe(3);
  });

  it("blends nothing when the finer model reaches the end, and fills its gaps", () => {
    expect(handOver([1, null, 1], [5, 5, 5])).toEqual([1, 5, 1]);
    expect(handOver([null, null], [5, null])).toEqual([5, null]);
  });
});

describe("a series read every few hours, given at every hour", () => {
  const series = { time: [0, 3 * HOUR, 6 * HOUR], values: [1, 4, null] };
  const hours = [0, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 7 * HOUR];

  it("is on the line between two values, and null around a missing one", () => {
    expect(hourly(series, hours, "value")).toEqual([1, 2, 3, 4, null, null]);
  });

  it("takes the nearer value for a direction", () => {
    expect(hourly({ ...series, values: [350, 20, 40] }, hours, "direction")).toEqual([
      350,
      350,
      20,
      20,
      20,
      null,
    ]);
  });
});

describe("the wind and the directions", () => {
  it("reads two components as a speed and where the wind comes from", () => {
    expect(windOf(0, -5)).toEqual({ speed: 5, direction: 0 });
    expect(windOf(-5, 0)).toEqual({ speed: 5, direction: 90 });
    expect(windOf(3, 4)).toEqual({
      speed: 5,
      direction: Math.round((Math.atan2(-3, -4) * 180) / Math.PI + 360) % 360,
    });
    expect(windOf(null, 4)).toEqual({ speed: null, direction: null });
  });

  it("turns MFWAM's directions by a half turn", () => {
    expect(turnedDirection(120)).toBe(300);
    expect(turnedDirection(-39)).toBe(141);
    expect(turnedDirection(null)).toBeNull();
  });
});

describe("the sea cell of a wave model", () => {
  const grid: Grid = gridOf({ south: 40, west: -5, north: 41, east: -4 }, 11, 11);

  it("is the sea cell nearest in squared degrees among those around", () => {
    const point = { latitude: 40.52, longitude: -4.48 };
    const cells = cellsAround(grid, { row: 5, column: 5 }, 1).map((cell) => ({
      ...cell,
      // The nearest cell is land, and so is the one north of it.
      isSea: !(cell.row === 5 && cell.column === 5) && !(cell.row === 6 && cell.column === 5),
    }));
    expect(seaCellOf(grid, point, cells)).toEqual({ row: 5, column: 6 });
    expect(
      seaCellOf(
        grid,
        point,
        cells.map((cell) => ({ ...cell, isSea: false })),
      ),
    ).toBeNull();
  });

  it("stays within the grid, and wraps a global one", () => {
    expect(cellsAround(grid, { row: 0, column: 0 }, 1)).toHaveLength(4);
    const world = gridOf({ south: -90, west: -180, north: 90, east: 179 }, 181, 360);
    const around = cellsAround(world, { row: 90, column: 0 }, 1);
    expect(around).toHaveLength(9);
    expect(around.map((cell) => cell.column)).toContain(359);
  });
});

describe("a forecast from the files", () => {
  const now = Date.UTC(2026, 9, 16, 9, 30);
  const span = spanAt(now);
  const hours = hoursOf(span);

  it("spans two days before today and eight from it", () => {
    expect(span.from).toBe(Date.UTC(2026, 9, 14) / 1000);
    expect(span.until).toBe(Date.UTC(2026, 9, 24) / 1000);
    expect(hours).toHaveLength((KEPT_PAST_DAYS + KEPT_DAYS) * 24);
  });

  // A bucket in memory: a fine model over Europe for two days, a global one for the whole span,
  // and a wave model whose nearest cell is land.
  const metaOf = (box: Meta["box"], stepSeconds: number): Meta => ({
    chunkSteps: 100,
    stepSeconds,
    lastRunAt: now / 1000,
    dataEndAt: span.until,
    box,
  });
  const europe = { south: 40, west: -10, north: 60, east: 20 };
  const world = { south: -90, west: -180, north: 90, east: 179 };
  const fineUntil = span.from + 4 * DAY;
  const files: OpenData = {
    meta: (model) =>
      Effect.succeed(
        metaOf(
          model === "dwd_icon_eu" ? europe : world,
          model === "meteofrance_wave" || model === "ecmwf_wam025" ? 3 * HOUR : HOUR,
        ),
      ),
    grid: (model) =>
      model === "dwd_icon_d2" || model === "meteofrance_arome_france0025"
        ? Effect.fail(new OpenDataError({ message: "no such file" }))
        : Effect.succeed(
            model === "dwd_icon_eu" ? gridOf(europe, 201, 301) : gridOf(world, 181, 360),
          ),
    series: (model, variable, cell, asked) =>
      Effect.succeed({
        time: Array.from(
          { length: (asked.until - asked.from) / (model.includes("wa") ? 3 * HOUR : HOUR) },
          (_, index) => asked.from + index * (model.includes("wa") ? 3 * HOUR : HOUR),
        ),
      }).pipe(
        Effect.map(({ time }) => ({
          time,
          values: time.map((seconds) => {
            if (model === "dwd_icon_eu") return seconds < fineUntil ? 1 : null;
            if (model === "dwd_icon") return variable === "wind_gusts_10m" ? 9 : 3;
            if (model === "ncep_gfs013") return 7;
            // The wave model: a sea at the cell east of the nearest one, and nowhere else.
            if (cell.column !== 182) return null;
            return variable === "wave_direction" ? 120 : variable === "wave_peak_period" ? 11 : 2;
          }),
        })),
      ),
    seaAround: (model, cell) =>
      model === "meteofrance_wave"
        ? Effect.succeed([
            { row: cell.row, column: cell.column, isSea: false },
            { row: cell.row, column: cell.column + 1, isSea: true },
          ])
        : Effect.fail(new OpenDataError({ message: "HSURF.om: 404" })),
  };

  it("lays the finest model over the next with a ramp, reads the waves at the sea cell, and names the models", async () => {
    const cell = storeCellOf({ latitude: 50.02, longitude: 0.98 });
    const result = await Effect.runPromise(Effect.result(fetchFromFiles(files, cell, now)));
    if (Result.isFailure(result)) throw new Error(String(result.failure));
    const { data, producers } = result.success;

    expect(producers).toEqual(["DWD", "DWD"]);
    expect(data.point).toEqual({ latitude: 50, longitude: 1 });
    expect(data.hours.time).toEqual(hours);
    const speed = data.hours.windSpeedMetersPerSecond;
    // u = v = 1 for the fine model: a speed of root two, then the global model's three.
    expect(speed[0]).toBeCloseTo(Math.SQRT2, 2);
    // The fine model's last hour is three quarters the global one's, the next all of it.
    const last = (fineUntil - span.from) / HOUR - 1;
    expect(speed[last]).toBeCloseTo(2.5 * Math.SQRT2, 2);
    expect(speed[last - 2]).toBeCloseTo(1.5 * Math.SQRT2, 2);
    expect(speed[last + 1]).toBeCloseTo(3 * Math.SQRT2, 2);
    expect(data.hours.windGustMetersPerSecond.at(-1)).toBe(9);
    // The waves came from the sea cell, turned, with ECMWF's peak period laid in.
    expect(data.hours.waveHeightMeters[0]).toBe(2);
    expect(data.hours.waveDirectionDegrees[0]).toBe(300);
    expect(data.hours.wavePeakPeriodSeconds[0]).toBe(11);
    expect(data.models).toEqual([{ id: "meteofrance_wave", from: span.from }]);
    expect(data.swellModels).toEqual([{ id: "meteofrance_wave", from: span.from }]);
    expect(data.peakModels).toEqual([{ id: "ecmwf_wam025", from: span.from }]);
  });

  it("fails when no weather model can be read", async () => {
    const silent: OpenData = {
      ...files,
      grid: () => Effect.fail(new OpenDataError({ message: "down" })),
    };
    const result = await Effect.runPromise(
      Effect.result(fetchFromFiles(silent, storeCellOf({ latitude: 50, longitude: 1 }), now)),
    );
    expect(Result.isFailure(result)).toBe(true);
  });
});
