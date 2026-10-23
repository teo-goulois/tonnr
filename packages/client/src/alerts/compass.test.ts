import { describe, expect, it } from "vitest";

import { bearingOf, onDial, onStep, startingArc } from "./compass";

describe("the compass of a sector", () => {
  it("reads where a finger points, clockwise from north", () => {
    expect(bearingOf(0, -10)).toBe(0);
    expect(bearingOf(10, 0)).toBe(90);
    expect(bearingOf(0, 10)).toBe(180);
    expect(bearingOf(-10, 0)).toBe(270);
  });

  it("stands a bearing on the dial, north at the top", () => {
    const east = onDial(90, 66);

    expect(east.x).toBeCloseTo(66);
    expect(east.y).toBeCloseTo(0);
    expect(onDial(0, 66).y).toBeCloseTo(-66);
  });

  it("brings a handle to a step", () => {
    expect(onStep(247)).toBe(245);
    expect(onStep(358)).toBe(0);
    expect(onStep(-3)).toBe(355);
  });

  it("opens around where it comes from now, or on the usual sector", () => {
    expect(startingArc("waveDirectionDegrees", 283)).toEqual({ from: 255, to: 315 });
    expect(startingArc("windDirectionDegrees", 10)).toEqual({ from: 340, to: 40 });
    expect(startingArc("windDirectionDegrees", null)).toEqual({ from: 45, to: 135 });
    expect(startingArc("primarySwellDirectionDegrees", undefined)).toEqual({ from: 250, to: 310 });
  });
});
