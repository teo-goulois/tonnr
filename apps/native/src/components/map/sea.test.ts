import { seaColorTable } from "@repo/client/sea-scales";
import { describe, expect, it } from "vitest";

import { arrowFeatures, levelsOf, seaArrowsReader } from "./sea-arrows";
import { levelElevation, seaReliefColor, seaTileUrl, seaTimeOf } from "./sea";

const HOUR = 60 * 60 * 1000;
// A ramp that is even, as no real one is: 0 to 10.2 m over 256 levels.
const metersByLevel = Array.from({ length: 256 }, (_, level) => level * 0.04);

describe("the moment the sea is shown at", () => {
  const times = {
    start: new Date("2026-10-19T00:00:00Z"),
    end: new Date("2026-10-29T00:00:00Z"),
    stepSeconds: 3 * 3600,
  };

  it("is the model's latest field that is not in the future", () => {
    const now = new Date("2026-10-19T10:30:00Z").getTime();
    expect(seaTimeOf(times, now)?.toISOString()).toBe("2026-10-19T09:00:00.000Z");
  });

  it("is the model's last field when it has none after", () => {
    const now = times.end.getTime() + 30 * HOUR;
    expect(seaTimeOf(times, now)).toEqual(times.end);
  });

  it("is none for a model that says no step", () => {
    expect(seaTimeOf({ ...times, stepSeconds: 0 }, Date.now())).toBeUndefined();
    expect(seaTimeOf(undefined, Date.now())).toBeUndefined();
  });

  it("fills the address of a tile with it", () => {
    expect(seaTileUrl("https://t/{z}/{x}/{y}?time={time}", new Date(times.start))).toBe(
      "https://t/{z}/{x}/{y}?time=2026-10-19T00%3A00%3A00.000Z",
    );
  });
});

describe("the color of the sea, read as a relief", () => {
  it("gives each gray level a height of its own, the higher the lighter", () => {
    for (let level = 1; level < 256; level++) {
      expect(levelElevation(level)).toBeGreaterThan(levelElevation(level - 1));
    }
    expect(levelElevation(0)).toBe(-10_000);
  });

  it("colors each level as the web colors it", () => {
    const expression = seaReliefColor(metersByLevel) as unknown as (number | string | unknown[])[];
    expect(expression.slice(0, 3)).toEqual(["interpolate", ["linear"], ["elevation"]]);
    const stops = expression.slice(3);
    const table = seaColorTable(metersByLevel);
    // The level of 2 m, which the web colors from its table.
    const level = 50;
    const at = stops.indexOf(levelElevation(level));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(stops[at + 1]).toBe(
      `rgba(${table[level * 4]}, ${table[level * 4 + 1]}, ${table[level * 4 + 2]}, ${
        Math.round((table[level * 4 + 3]! / 255) * 1000) / 1000
      })`,
    );
  });

  it("leaves a flat sea and where the model has none transparent", () => {
    const stops = (seaReliefColor(metersByLevel) as unknown as unknown[]).slice(3);
    expect(stops[0]).toBe(levelElevation(0));
    expect(stops[1]).toBe("rgba(59, 111, 212, 0)");
  });

  it("keeps the heights in order, and a run of one color by its two ends", () => {
    const flat = Array.from({ length: 256 }, (_, level) => (level < 100 ? 0 : 3));
    const stops = (seaReliefColor(flat) as unknown as unknown[]).slice(3);
    const heights = stops.filter((_, index) => index % 2 === 0) as number[];
    expect(heights).toEqual([...heights].toSorted((a, b) => a - b));
    expect(heights).toEqual([
      levelElevation(0),
      levelElevation(99),
      levelElevation(100),
      levelElevation(255),
    ]);
  });
});

describe("the arrows on the sea", () => {
  const tiles = {
    tileUrlTemplate: "https://d/{z}/{x}/{y}?time={time}",
    encoding: { degreesByLevel: Array.from({ length: 256 }, (_, level) => (level * 360) / 256) },
  };
  const view = { west: -10, south: 40, east: 0, north: 48, zoom: 5 };
  const time = new Date("2026-10-19T09:00:00Z");

  it("asks for the tiles it needs once, and draws from them as they come", async () => {
    const asked: string[] = [];
    // A tile of 4 by 4 pixels from the west, 270°, but for one pixel that has no sea.
    const levels = new Int16Array(16).fill(192);
    levels[0] = -1;
    const arrows = seaArrowsReader(async (address) => {
      asked.push(address);
      return levels;
    });
    let loaded = 0;
    expect(arrows(view, time, tiles, () => loaded++)).toEqual([]);
    expect(arrows(view, time, tiles, () => loaded++)).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked[0]).toContain("time=2026-10-19T09%3A00%3A00.000Z");
    expect(loaded).toBe(asked.length);

    const drawn = arrows(view, time, tiles, () => loaded++);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((arrow) => arrow.fromDegrees === 270)).toBe(true);
    expect(arrowFeatures(drawn).features[0]?.properties).toEqual({ rotate: 90 });
  });

  it("draws nothing from a tile that could not be read", async () => {
    const arrows = seaArrowsReader(async () => {
      throw new Error("no answer");
    });
    arrows(view, time, tiles, () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(arrows(view, time, tiles, () => {})).toEqual([]);
  });

  it("reads a transparent pixel as no sea", () => {
    expect([...levelsOf([10, 10, 10, 255, 0, 0, 0, 0])]).toEqual([10, -1]);
  });
});
