import { describe, expect, it } from "vitest";

import { meetsTide, tideAhead, tideSteps } from "./tide-band";

const HOUR_MS = 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 10, 6);
const at = (hours: number) => START + hours * HOUR_MS;
// A tide that rises from 1 m to 4 m in six hours, then falls back in six.
const tide = [1, 2, 3, 4, 3, 2, 1].map((value, index) => ({
  time: new Date(at(index * 2)),
  value,
}));

describe("what the editor draws of the tide", () => {
  it("draws from now, over two days", () => {
    const week = Array.from({ length: 24 * 7 }, (_, hour) => ({
      time: new Date(at(hour)),
      value: hour % 12,
    }));
    const drawn = tideAhead(week, at(24));

    expect(drawn[0]?.time.getTime()).toBe(at(24));
    expect(drawn.at(-1)?.time.getTime()).toBe(at(24 + 48));
  });

  it("meets a height between the two points around a moment", () => {
    const asked = { range: { min: 2.4, max: 3.6 }, trend: undefined };

    // 2.5 m on the way up, 3.5 m on the way down.
    expect(meetsTide(tide, at(3), asked)).toBe(true);
    expect(meetsTide(tide, at(7), asked)).toBe(true);
    // 1.5 m, and the top of the tide.
    expect(meetsTide(tide, at(1), asked)).toBe(false);
    expect(meetsTide(tide, at(6), asked)).toBe(false);
  });

  it("takes a range with one end as open at the other", () => {
    expect(meetsTide(tide, at(6), { range: { min: 3 }, trend: undefined })).toBe(true);
    expect(meetsTide(tide, at(0), { range: { max: 1.2 }, trend: undefined })).toBe(true);
    expect(meetsTide(tide, at(6), { range: { max: 1.2 }, trend: undefined })).toBe(false);
  });

  it("meets the way the tide goes, at any height when none is asked", () => {
    const rising = { range: undefined, trend: "rising" as const };
    const falling = { range: undefined, trend: "falling" as const };

    expect([meetsTide(tide, at(3), rising), meetsTide(tide, at(3), falling)]).toEqual([
      true,
      false,
    ]);
    expect([meetsTide(tide, at(9), rising), meetsTide(tide, at(9), falling)]).toEqual([
      false,
      true,
    ]);
    // The first point is read with the one after it.
    expect(meetsTide(tide, at(0), rising)).toBe(true);
    // At its height the tide is already falling, and at its lowest already rising: a point is
    // read with the one after it, as the API reads an hour.
    expect([meetsTide(tide, at(6), rising), meetsTide(tide, at(6), falling)]).toEqual([
      false,
      true,
    ]);
    // The last point has only the one before it.
    expect(meetsTide(tide, at(12), falling)).toBe(true);
  });

  it("asks both when both are asked", () => {
    const asked = { range: { min: 2.4, max: 3.6 }, trend: "falling" as const };

    expect(meetsTide(tide, at(3), asked)).toBe(false);
    expect(meetsTide(tide, at(7), asked)).toBe(true);
  });

  it("meets everything when nothing is asked, and nothing outside the curve", () => {
    const nothing = { range: undefined, trend: undefined };

    expect(meetsTide(tide, at(5), nothing)).toBe(true);
    expect(meetsTide(tide, at(-1), nothing)).toBe(false);
    expect(meetsTide(tide, at(13), nothing)).toBe(false);
  });

  it("says where the conditions are met from the curve's start to its end", () => {
    // Seven moments, two hours apart: the points themselves.
    expect(tideSteps(tide, { range: { min: 3 }, trend: undefined }, 7)).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(tideSteps([], { range: undefined, trend: undefined }, 7)).toEqual([]);
  });
});
