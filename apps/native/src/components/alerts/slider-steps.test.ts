import { describe, expect, it } from "vitest";

import { nearestThumb, snapped, stepped } from "./slider-steps";

describe("the steps of a slider", () => {
  it("brings a value to its nearest step, within the ends", () => {
    expect(snapped(1.26, 0, 5, 0.1)).toBe(1.3);
    expect(snapped(0.1 + 0.2, 0, 5, 0.1)).toBe(0.3);
    expect(snapped(-2, 0, 5, 0.1)).toBe(0);
    expect(snapped(9, 4, 22, 1)).toBe(9);
    expect(snapped(30, 4, 22, 1)).toBe(22);
    expect(snapped(2.74, 0, 16, 0.5)).toBe(2.5);
  });

  it("moves a value by a step, and stops at an end", () => {
    expect(stepped(1.2, 1, 0, 5, 0.1)).toBe(1.3);
    expect(stepped(0, -1, 0, 5, 0.1)).toBe(0);
    expect(stepped(22, 1, 4, 22, 1)).toBe(22);
  });

  it("gives a press the nearer thumb, or the one on its side when they met", () => {
    expect(nearestThumb([1, 3], 1.4)).toBe(0);
    expect(nearestThumb([1, 3], 2.6)).toBe(1);
    expect(nearestThumb([2, 2], 1.5)).toBe(0);
    expect(nearestThumb([2, 2], 2.5)).toBe(1);
    expect(nearestThumb([0, 5], -1)).toBe(0);
  });
});
