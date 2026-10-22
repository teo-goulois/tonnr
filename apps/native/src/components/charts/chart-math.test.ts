import { WAVE_HEIGHT_SCALE } from "@repo/client/sea-scales";
import { describe, expect, it } from "vitest";

import {
  colorAt,
  crossingsAt,
  curveGradient,
  floorTicks,
  heightAt,
  marksRoom,
  midnightsBetween,
  timeTicks,
  valueTicks,
} from "./chart-math";

const HOUR = 60 * 60 * 1000;

describe("the figures of a chart's axes", () => {
  it("rounds a value axis from zero to just above the curve", () => {
    expect(valueTicks(0, 1.7)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(valueTicks(0, 23)).toEqual([0, 10, 20, 30]);
  });

  it("goes under zero when the curve does, as a tide under its datum", () => {
    const ticks = valueTicks(-0.4, 3.2);
    expect(ticks[0]).toBeLessThan(0);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(3.2);
  });

  it("writes no figure with the digits of a float's error", () => {
    for (const tick of valueTicks(0, 0.3)) expect(String(tick).length).toBeLessThan(6);
  });

  it("starts a period's axis a little under its lowest value", () => {
    const ticks = floorTicks([8, 9.5, 12]);
    expect(ticks[0]).toBe(7);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(13);
    expect(floorTicks([])).toEqual([0, 1]);
  });
});

describe("the colors along a curve", () => {
  it("gives Skia a color and a place for each step, from the first moment to the last", () => {
    const gradient = curveGradient(
      [
        { time: 0, value: 0.5 },
        { time: 10 * HOUR, value: 3 },
      ],
      WAVE_HEIGHT_SCALE,
      5,
    );
    expect(gradient?.colors).toHaveLength(5);
    expect(gradient?.positions).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(gradient?.from).toBe(0);
    expect(gradient?.to).toBe(10 * HOUR);
    for (const color of gradient?.colors ?? []) {
      expect(color).toMatch(/^rgba\(\d+, \d+, \d+, 1\)$/);
    }
  });

  it("draws no gradient for a curve of one point", () => {
    expect(curveGradient([{ time: 0, value: 1 }], WAVE_HEIGHT_SCALE)).toBeUndefined();
  });

  it("writes a scale's color as Skia and React Native both read it", () => {
    expect(colorAt(WAVE_HEIGHT_SCALE, 1, 0.5)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  });
});

describe("what a finger reads", () => {
  it("finds every moment the water stands at a height, and whether it rises there", () => {
    const tide = [
      { time: 0, value: 0 },
      { time: 6 * HOUR, value: 4 },
      { time: 12 * HOUR, value: 0 },
    ];
    const crossings = crossingsAt(tide, 2);
    expect(crossings.map((crossing) => crossing.time)).toEqual([3 * HOUR, 9 * HOUR]);
    expect(crossings.map((crossing) => crossing.rising)).toEqual([true, false]);
  });

  it("reads the height between two predictions, and nothing outside them", () => {
    const tide = [
      { time: 0, value: 1 },
      { time: 2 * HOUR, value: 3 },
    ];
    expect(heightAt(tide, HOUR)).toBe(2);
    expect(heightAt(tide, -HOUR)).toBeUndefined();
    expect(heightAt(tide, 3 * HOUR)).toBeUndefined();
  });
});

describe("the moments a time axis names", () => {
  it("names every few hours from a round hour", () => {
    const start = new Date(2026, 9, 20, 4, 30).getTime();
    const ticks = timeTicks(start, start + 12 * HOUR, 6);
    expect(ticks.map((tick) => new Date(tick).getHours())).toEqual([6, 12]);
  });

  it("names the noons when its step is a day", () => {
    const start = new Date(2026, 9, 20, 0, 0).getTime();
    const ticks = timeTicks(start, start + 3 * 24 * HOUR, 24);
    expect(ticks).toHaveLength(3);
    for (const tick of ticks) expect(new Date(tick).getHours()).toBe(12);
  });

  it("rules the midnights between two moments", () => {
    const start = new Date(2026, 9, 20, 9).getTime();
    const midnights = midnightsBetween(start, start + 2 * 24 * HOUR);
    expect(midnights).toHaveLength(2);
    for (const midnight of midnights) expect(new Date(midnight).getHours()).toBe(0);
  });
});

describe("the room of the tide's marks", () => {
  // The web's chart: 192 pixels, 30 of them for the hours, 34 over a high water, 31 under a low.
  const room = (values: number[]) => marksRoom(values, 192 - 30, 34, 31);

  it("leaves above the curve only what the name of a high water lacks", () => {
    expect(room([1.1, 3.9])).toEqual({ head: 31, foot: 0 });
  });

  it("leaves under the lowest figure what the name of a low water lacks", () => {
    expect(room([0.4, 4.6])).toEqual({ head: 8, foot: 23 });
    expect(room([0.2, 5])).toEqual({ head: 14, foot: 27 });
  });

  it("reads a tide under its datum as the web does", () => {
    expect(room([-0.3, 2.1])).toEqual({ head: 8, foot: 5 });
  });

  it("keeps the least room of a chart without a curve", () => {
    expect(room([])).toEqual({ head: 8, foot: 0 });
  });
});
