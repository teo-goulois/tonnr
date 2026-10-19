import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_UNITS,
  formatHeight,
  formatWind,
  getUnits,
  rainUnit,
  setUnits,
  storedUnits,
  windFigure,
  windUnit,
} from "./units";

// How each measurement is turned and written is tested in packages/client: here, what the
// browser holds in force and keeps.
afterEach(() => {
  setUnits(DEFAULT_UNITS);
  localStorage.clear();
});

describe("the units in force", () => {
  it("are those the app starts with until the reader chooses", () => {
    expect(getUnits()).toEqual(DEFAULT_UNITS);
    expect(formatWind(12.4)).toBe("12 kn");
    expect(formatHeight(1.84)).toBe("1.8 m");
  });

  it("are followed everywhere a measurement is written", () => {
    setUnits({ ...DEFAULT_UNITS, windSpeed: "kmh" });

    expect(windFigure(10)).toBe("19");
    expect(windUnit()).toBe("km/h");
    expect(formatWind(10)).toBe("19 km/h");

    setUnits({ ...DEFAULT_UNITS, height: "ft", precipitation: "in" });

    expect(formatWind(10)).toBe("10 kn");
    expect(formatHeight(1.8)).toBe("5.9 ft");
    expect(rainUnit()).toBe("in");
  });
});

describe("the units a browser keeps", () => {
  it("keeps the choice for the next visit", () => {
    expect(storedUnits()).toBeUndefined();

    setUnits({ ...DEFAULT_UNITS, windSpeed: "mph", height: "ft" });

    expect(storedUnits()).toEqual({ ...DEFAULT_UNITS, windSpeed: "mph", height: "ft" });
  });

  it("starts a unit it does not know, or did not keep, as the app does", () => {
    localStorage.setItem("tonnr:units", '{"windSpeed":"furlongs","temperature":"f"}');

    expect(storedUnits()).toEqual({ ...DEFAULT_UNITS, temperature: "f" });
  });

  it("gives nothing for what is not a set of units", () => {
    localStorage.setItem("tonnr:units", "not json");
    expect(storedUnits()).toBeUndefined();

    localStorage.setItem("tonnr:units", '"kn"');
    expect(storedUnits()).toBeUndefined();
  });
});
