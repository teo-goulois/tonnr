import { describe, expect, it } from "vitest";

import { WINDGURU_SCALES } from "../sea-scales";
import { testReader } from "../testing";
import { inPalette, nightsBetween, tintOf } from "./metrics";

describe("how the panel writes a figure", () => {
  it("writes a value in its unit, or bare where the unit is said beside it", () => {
    const { metrics, formatMetric } = testReader().metrics;
    const height = metrics().height;
    expect(formatMetric(height, 1.26)).toBe("1.3 m");
    expect(formatMetric(height, 1.26, false)).toBe("1.3");
  });

  it("writes a difference from the two figures as they are written, with its sign", () => {
    const { metrics, formatGap } = testReader().metrics;
    const height = metrics().height;
    expect(formatGap(height, 1.26, 0.64)).toBe("+0.7 m");
    expect(formatGap(height, 0.64, 1.26, false)).toBe("−0.7");
    expect(formatGap(height, 1.01, 0.98, false)).toBe("±0");
  });

  it("writes a figure in the unit chosen when it is asked for", () => {
    const reader = testReader();
    reader.setUnits({ ...reader.units(), height: "ft", windSpeed: "kmh" });
    const { metrics, formatMetric } = reader.metrics;
    expect(formatMetric(metrics().height, 1)).toBe("3.3 ft");
    expect(formatMetric(metrics().wind, 10)).toBe("19 km/h");
  });
});

describe("the colors of a cell", () => {
  it("tints a cell of a scale of one hue, stronger with the value", () => {
    const period = testReader().metrics.metrics().period;
    expect(tintOf(period, 16)).toBeGreaterThan(tintOf(period, 6));
    expect(tintOf(period, -100)).toBe(14);
    expect(tintOf(period, 1000)).toBe(86);
  });

  it("takes Windguru's scales, fills every cell and writes a big sea in bold", () => {
    const { metrics, swellMetric, weatherMetrics } = testReader().metrics;
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
