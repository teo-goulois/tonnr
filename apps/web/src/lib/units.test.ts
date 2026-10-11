import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_UNITS,
  formatWind,
  getUnits,
  knotsFrom,
  setUnits,
  storedUnits,
  windFigure,
  windIn,
  windUnit,
} from "./units";

afterEach(() => {
  setUnits(DEFAULT_UNITS);
  localStorage.clear();
});

describe("a wind speed in the reader's unit", () => {
  it("is written in knots until the reader chooses", () => {
    expect(getUnits()).toEqual({ windSpeed: "kn" });
    expect(formatWind(12.4)).toBe("12 kn");
  });

  it("is turned from knots into the unit chosen", () => {
    expect(windIn(10, "kn")).toBe(10);
    expect(windIn(10, "kmh")).toBeCloseTo(18.52, 5);
    expect(windIn(10, "ms")).toBeCloseTo(5.1444, 3);
    expect(windIn(10, "mph")).toBeCloseTo(11.5078, 3);
  });

  it("comes back to knots from the unit chosen", () => {
    for (const unit of ["kn", "kmh", "ms", "mph"] as const) {
      expect(knotsFrom(windIn(17.3, unit), unit)).toBeCloseTo(17.3, 9);
    }
  });

  it("follows the choice everywhere it is written", () => {
    setUnits({ windSpeed: "kmh" });

    expect(windFigure(10)).toBe("19");
    expect(windUnit()).toBe("km/h");
    expect(formatWind(10)).toBe("19 km/h");

    setUnits({ windSpeed: "ms" });

    expect(formatWind(10)).toBe("5 m/s");
  });
});

describe("the units a browser keeps", () => {
  it("keeps the choice for the next visit", () => {
    expect(storedUnits()).toBeUndefined();

    setUnits({ windSpeed: "mph" });

    expect(storedUnits()).toEqual({ windSpeed: "mph" });
  });

  it("gives nothing for what it does not know", () => {
    localStorage.setItem("tonnr:units", '{"windSpeed":"furlongs"}');
    expect(storedUnits()).toBeUndefined();

    localStorage.setItem("tonnr:units", "not json");
    expect(storedUnits()).toBeUndefined();
  });
});
