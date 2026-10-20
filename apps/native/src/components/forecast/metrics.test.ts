import { WINDGURU_SCALES } from "@repo/client/sea-scales";
import { describe, expect, it } from "vitest";

import {
  cellColors,
  channelsOf,
  colorAt,
  formatGap,
  formatMetric,
  inPalette,
  metrics,
  nightsBetween,
  swellMetric,
  weatherMetrics,
} from "./metrics";

describe("how the panel writes a figure", () => {
  it("writes a value in its unit, or bare where the unit is said beside it", () => {
    const height = metrics().height;
    expect(formatMetric(height, 1.26)).toBe("1.3 m");
    expect(formatMetric(height, 1.26, false)).toBe("1.3");
  });

  it("writes a difference from the two figures as they are written, with its sign", () => {
    const height = metrics().height;
    expect(formatGap(height, 1.26, 0.64)).toBe("+0.7 m");
    expect(formatGap(height, 0.64, 1.26, false)).toBe("−0.7");
    expect(formatGap(height, 1.01, 0.98, false)).toBe("±0");
  });
});

describe("the colors of a cell", () => {
  it("writes a scale's color as Skia and React Native both read it", () => {
    expect(channelsOf("rgb(10 20 30)")).toEqual([10, 20, 30]);
    expect(colorAt(metrics().height.scale, 1, 0.5)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  });

  it("fills a cell of the waves with its color and the ink that reads on it", () => {
    const colors = cellColors(metrics().height, 2);
    expect(colors.background).toMatch(/^rgba\(/);
    expect(colors.color).toBeDefined();
  });

  it("tints a cell of a scale of one hue, stronger with the value", () => {
    const period = metrics().period;
    const alpha = (value: number) =>
      Number.parseFloat(cellColors(period, value).background.split(",")[3] ?? "");
    expect(alpha(16)).toBeGreaterThan(alpha(6));
  });

  it("takes Windguru's scales, fills every cell and writes a big sea in bold", () => {
    const wind = inPalette(metrics().wind, "windguru");
    expect(wind.scale).toBe(WINDGURU_SCALES.wind);
    expect(wind.tinted).toBe(false);
    expect(wind.strong?.(20)).toBe(true);
    expect(wind.strong?.(5)).toBe(false);
    expect(inPalette(swellMetric(), "windguru").scale).toBe(WINDGURU_SCALES.height);
    expect(inPalette(weatherMetrics().air, "windguru").plain).toBe(false);
    expect(inPalette(weatherMetrics().air, "tonnr").plain).toBe(true);
  });
});

describe("the nights of a span", () => {
  it("runs from dusk to dawn at the place", () => {
    const start = Date.UTC(2026, 5, 20, 12);
    const nights = nightsBetween(start, start + 24 * 60 * 60 * 1000, 43.5, -1.5);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.to).toBeGreaterThan(nights[0]!.from);
  });
});
