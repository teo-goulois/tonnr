import { describe, expect, it } from "vitest";

import { predictTideExtremes, predictTideTimeline } from "./tide-prediction";

// 8 October 2026, midnight to midnight in Paris.
const day = { start: new Date("2026-10-07T22:00:00Z"), end: new Date("2026-10-08T22:00:00Z") };
const brest = { latitude: 48.383, longitude: -4.495 };

function minutesApart(a: Date, b: string) {
  return Math.abs(a.getTime() - new Date(b).getTime()) / 60_000;
}

describe("predictTideExtremes", () => {
  it("returns the four tides of the day at Brest", () => {
    const prediction = predictTideExtremes({ ...brest, ...day });

    expect(prediction?.station.name).toBe("Brest");
    expect(prediction?.datum).toBe("LAT");
    expect(prediction?.extremes.map((extreme) => extreme.type)).toEqual([
      "high",
      "low",
      "high",
      "low",
    ]);

    // These values pin the output of the pinned tide database. On 2026-10-08 they were
    // within 5 minutes of the official predictions, and 0.33 to 0.44 m lower.
    const expected = [
      ["2026-10-08T02:07:00Z", 6.03],
      ["2026-10-08T08:18:00Z", 1.36],
      ["2026-10-08T14:23:00Z", 6.47],
      ["2026-10-08T20:43:00Z", 1.04],
    ] as const;
    for (const [index, [time, heightMeters]] of expected.entries()) {
      const extreme = prediction?.extremes[index];
      expect(extreme && minutesApart(extreme.time, time)).toBeLessThan(2);
      expect(extreme?.heightMeters).toBeCloseTo(heightMeters, 2);
    }
  });

  it("carries the station's source and license", () => {
    const prediction = predictTideExtremes({ ...brest, ...day });

    expect(prediction?.station.source.name).toBe("TICON-4");
    expect(prediction?.station.license).toEqual({
      type: "cc-by-4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
      commercialUse: true,
    });
  });

  it("returns null when no station is close enough", () => {
    expect(predictTideExtremes({ latitude: 40, longitude: -35, ...day })).toBeNull();
  });

  it("leaves out a tide that falls just before the period", () => {
    // Brest's high tide is at 02:07:40 UTC.
    const prediction = predictTideExtremes({
      ...brest,
      start: new Date("2026-10-08T02:08:00Z"),
      end: new Date("2026-10-08T02:09:00Z"),
    });

    expect(prediction?.extremes).toEqual([]);
  });

  it("keeps every tide inside the period at a station that follows a reference station", () => {
    // Makena, Hawaii, takes its tides from another station, shifted in time.
    const period = {
      start: new Date("2026-10-08T00:00:00Z"),
      end: new Date("2026-10-09T00:00:00Z"),
    };
    const prediction = predictTideExtremes({ latitude: 20.6567, longitude: -156.445, ...period });

    expect(prediction?.station.name).toBe("Makena");
    expect(prediction?.extremes.length).toBeGreaterThanOrEqual(3);
    for (const extreme of prediction?.extremes ?? []) {
      expect(extreme.time >= period.start && extreme.time <= period.end).toBe(true);
    }
  });
});

describe("predictTideTimeline", () => {
  it("returns one height per step, both ends included", () => {
    const prediction = predictTideTimeline({
      ...brest,
      start: new Date("2026-10-08T06:00:00Z"),
      end: new Date("2026-10-08T09:00:00Z"),
      stepMinutes: 60,
    });

    expect(prediction?.timeline.map((point) => point.time.toISOString())).toEqual([
      "2026-10-08T06:00:00.000Z",
      "2026-10-08T07:00:00.000Z",
      "2026-10-08T08:00:00.000Z",
      "2026-10-08T09:00:00.000Z",
    ]);
  });

  it("stops at the end of the period when it falls between two steps", () => {
    const end = new Date("2026-10-08T02:13:00Z");
    const prediction = predictTideTimeline({
      ...brest,
      start: new Date("2026-10-08T02:00:00Z"),
      end,
      stepMinutes: 10,
    });

    expect(prediction?.timeline.length).toBeGreaterThan(0);
    expect(prediction?.timeline.every((point) => point.time <= end)).toBe(true);
  });
});
