import { afterEach, describe, expect, it } from "vitest";

import { baseLocale, setLocale } from "@/paraglide/runtime.js";

import { hourNear, saidOf, sizeStepsOf } from "./size-against";

afterEach(() => {
  void setLocale(baseLocale, { reload: false });
});

describe("what the guide's line says of a break's size against the forecast", () => {
  it("keeps the steps of the catalogue, in their order", () => {
    expect(sizeStepsOf(["double", "unknown", "half"])).toEqual(["half", "double"]);
  });

  it("says nothing where the line holds nothing", () => {
    expect(saidOf(null)).toBeNull();
    expect(saidOf([])).toBeNull();
  });

  it("says one step, or the range from the first to the last", () => {
    expect(saidOf(["same"])).not.toBe(saidOf(["half", "double"]));
    expect(saidOf(["half", "same", "double"])).toBe(saidOf(["double", "half"]));
  });
});

describe("the hour of the forecast a factor is read for", () => {
  it("is the one nearest now", () => {
    const now = Date.UTC(2026, 9, 20, 12, 20);
    const hours = [10, 11, 12, 13].map((hour) => ({ time: new Date(Date.UTC(2026, 9, 20, hour)) }));
    expect(hourNear(hours as never, now)?.time.getUTCHours()).toBe(12);
    expect(hourNear(undefined, now)).toBeUndefined();
  });
});
