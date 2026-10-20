import { describe, expect, it } from "vitest";

import { cellColors, metrics } from "./metrics";

// How a figure is named, written, set in a palette and how the nights fall are packages/client's,
// with their tests there. Here is the color of a cell as React Native and Skia read it.

describe("the colors of a cell", () => {
  it("fills a cell of the waves with its color and the ink that reads on it", () => {
    const colors = cellColors(metrics().height, 2);
    expect(colors.background).toMatch(/^rgba\(\d+, \d+, \d+, 1\)$/);
    expect(colors.color).toBeDefined();
  });

  it("tints a cell of a scale of one hue, stronger with the value", () => {
    const period = metrics().period;
    const alpha = (value: number) =>
      Number.parseFloat(cellColors(period, value).background.split(",")[3] ?? "");
    expect(alpha(16)).toBeGreaterThan(alpha(6));
  });

  it("names a figure in the app's language", () => {
    expect(metrics().height.label).toBe("Waves");
  });
});
