import { seaColorTable } from "@repo/client/sea-scales";
import { describe, expect, it } from "vitest";

import { arrowFeatures } from "./sea-arrows";
import { levelElevation, seaReliefColor, seaTileUrl } from "./sea";

// A ramp that is even, as no real one is: 0 to 10.2 m over 256 levels.
const metersByLevel = Array.from({ length: 256 }, (_, level) => level * 0.04);

describe("the address of the sea's tiles", () => {
  it("is filled with the moment", () => {
    expect(seaTileUrl("https://t/{z}/{x}/{y}?time={time}", new Date("2026-10-19T00:00:00Z"))).toBe(
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

  it("leaves where the model has no sea transparent, which is level 0 under the land", () => {
    // The model's legend of 2026-10-08 gives its first levels a calm of a few centimetres, which
    // the sea's table colors: a transparent pixel, read as level 0, would draw that blue over the
    // land.
    const legend = [0.078, 0.117, 0.156, ...metersByLevel.slice(3)];
    const table = seaColorTable(legend);
    expect(table[3]).toBeGreaterThan(0);
    const stops = (seaReliefColor(legend) as unknown as unknown[]).slice(3);
    expect(stops[0]).toBe(levelElevation(0));
    expect(stops[1]).toBe("rgba(0, 0, 0, 0)");
    // The next level is the calm's color again.
    expect(stops[2]).toBe(levelElevation(1));
    expect(stops[3]).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("keeps the heights in order, and a run of one color by its two ends", () => {
    const flat = Array.from({ length: 256 }, (_, level) => (level < 100 ? 0 : 3));
    const stops = (seaReliefColor(flat) as unknown as unknown[]).slice(3);
    const heights = stops.filter((_, index) => index % 2 === 0) as number[];
    expect(heights).toEqual([...heights].toSorted((a, b) => a - b));
    // Level 0, no sea, stands apart from the calm that runs after it.
    expect(heights).toEqual([
      levelElevation(0),
      levelElevation(1),
      levelElevation(99),
      levelElevation(100),
      levelElevation(255),
    ]);
  });
});

describe("the arrows on the sea", () => {
  it("are turned the way the waves go", () => {
    const features = arrowFeatures([{ longitude: -4, latitude: 47, fromDegrees: 270 }]);
    expect(features.features[0]?.properties).toEqual({ rotate: 90 });
  });
});
