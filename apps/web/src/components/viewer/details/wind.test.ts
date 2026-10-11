import { describe, expect, it } from "vitest";

import type { Sample } from "./metrics";
import { bearingsAlong, meanBearing, rowNear, windRows, windSummary } from "./wind";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const START = Date.UTC(2026, 9, 11, 12);

// A reading of a wind station, so many minutes after noon.
function sample(
  minutes: number,
  wind: number | null,
  gust: number | null = null,
  from: number | null = null,
) {
  return {
    time: START + minutes * MINUTE,
    height: null,
    period: null,
    energy: null,
    wind,
    gust,
    windDirection: from,
    waveDirection: null,
    cloud: null,
    rain: null,
    air: null,
  } satisfies Sample;
}

describe("meanBearing", () => {
  it("reads north between 350° and 10°, not south", () => {
    expect(meanBearing([350, 10])).toBeCloseTo(0, 5);
    expect(meanBearing([80, 100])).toBeCloseTo(90, 5);
  });

  it("has no answer for no bearing, or for bearings that cancel out", () => {
    expect(meanBearing([])).toBeNull();
    expect(meanBearing([0, 180])).toBeNull();
  });
});

describe("windRows", () => {
  it("keeps each reading when the step is the station's own", () => {
    const rows = windRows(
      [sample(0, 10, 14, 270), sample(6, 12, 15, 280), sample(12, 11, 16, 290)],
      START,
      START + HOUR,
      6 * MINUTE,
    );

    expect(rows).toEqual([
      { time: START, wind: 10, gust: 14, direction: expect.closeTo(270, 5) },
      { time: START + 6 * MINUTE, wind: 12, gust: 15, direction: expect.closeTo(280, 5) },
      { time: START + 12 * MINUTE, wind: 11, gust: 16, direction: expect.closeTo(290, 5) },
    ]);
  });

  it("takes the mean wind of a step, its strongest gust and its mean bearing", () => {
    const rows = windRows(
      [sample(0, 10, 14, 350), sample(6, 14, 22, 10), sample(12, 12, 17, 0)],
      START,
      START + HOUR,
      30 * MINUTE,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ time: START, wind: 12, gust: 22 });
    expect(Math.min(rows[0]!.direction!, 360 - rows[0]!.direction!)).toBeCloseTo(0, 5);
  });

  it("stands a row at the start of its step, and never before the span", () => {
    const readings = [sample(40, 10), sample(50, 12)];

    expect(windRows(readings, START, START + HOUR, 30 * MINUTE)[0]!.time).toBe(START + 30 * MINUTE);
    expect(windRows(readings, START + 35 * MINUTE, START + HOUR, 30 * MINUTE)[0]!.time).toBe(
      START + 35 * MINUTE,
    );
  });

  it("leaves out what is outside the span and what has no wind speed", () => {
    const rows = windRows(
      [sample(-6, 9), sample(0, 10), sample(6, null, 20), sample(66, 11)],
      START,
      START + HOUR,
      6 * MINUTE,
    );

    expect(rows.map((row) => row.wind)).toEqual([10]);
  });

  it("gives a step without a gust or a bearing none", () => {
    const [row] = windRows([sample(0, 10)], START, START + HOUR, 6 * MINUTE);

    expect(row).toEqual({ time: START, wind: 10, gust: null, direction: null });
  });

  it("stops the curve where the station said nothing for more than an hour and a half", () => {
    const rows = windRows(
      [sample(0, 10), sample(6, 11), sample(120, 12), sample(126, 13)],
      START,
      START + 3 * HOUR,
      6 * MINUTE,
    );

    expect(rows.map((row) => row.wind)).toEqual([10, 11, null, 12, 13]);
    expect(rows[2]!.time).toBe(START + 63 * MINUTE);
  });

  it("keeps the curve of a station that reports every hour", () => {
    const rows = windRows(
      [sample(0, 10), sample(60, 11), sample(120, 12)],
      START,
      START + 3 * HOUR,
      6 * MINUTE,
    );

    expect(rows.map((row) => row.wind)).toEqual([10, 11, 12]);
  });

  it("orders the rows by time, whatever the order of the readings", () => {
    const rows = windRows(
      [sample(12, 12), sample(0, 10), sample(6, 11)],
      START,
      START + HOUR,
      6 * MINUTE,
    );

    expect(rows.map((row) => row.wind)).toEqual([10, 11, 12]);
  });
});

describe("windSummary", () => {
  it("gives the mean wind and the strongest gust with its moment", () => {
    const rows = windRows(
      [sample(0, 10, 14), sample(6, 14, 25), sample(12, 12, 17)],
      START,
      START + HOUR,
      6 * MINUTE,
    );

    expect(windSummary(rows)).toEqual({
      mean: 12,
      strongest: { value: 25, time: START + 6 * MINUTE },
    });
  });

  it("gives nothing for a span without a reading, and no gust for a station that has none", () => {
    expect(windSummary([])).toEqual({ mean: undefined, strongest: undefined });
    expect(windSummary(windRows([sample(0, 10)], START, START + HOUR, 6 * MINUTE))).toEqual({
      mean: 10,
      strongest: undefined,
    });
  });
});

describe("bearingsAlong", () => {
  it("gives one bearing for each part of the span, and none where nothing was read", () => {
    const rows = windRows(
      [sample(0, 10, null, 270), sample(6, 10, null, 290), sample(54, 10, null, 90)],
      START,
      START + HOUR,
      6 * MINUTE,
    );

    const bearings = bearingsAlong(rows, START, START + HOUR, 4);

    expect(bearings[0]).toBeCloseTo(280, 5);
    expect(bearings.slice(1, 3)).toEqual([null, null]);
    expect(bearings[3]).toBeCloseTo(90, 5);
  });
});

describe("rowNear", () => {
  it("finds the nearest row that holds a wind speed", () => {
    const rows = windRows(
      [sample(0, 10), sample(6, 11), sample(120, 12)],
      START,
      START + 3 * HOUR,
      6 * MINUTE,
    );

    expect(rowNear(rows, START + 62 * MINUTE)?.wind).toBe(11);
    expect(rowNear(rows, START + 100 * MINUTE)?.wind).toBe(12);
    expect(rowNear([], START)).toBeUndefined();
  });
});
