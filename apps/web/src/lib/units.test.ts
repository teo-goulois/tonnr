import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_UNITS,
  distanceIn,
  formatDistance,
  formatHeight,
  formatTemperature,
  formatWind,
  getUnits,
  heightFigure,
  heightIn,
  knotsFrom,
  metersFrom,
  rainDigits,
  rainIn,
  rainUnit,
  setUnits,
  storedUnits,
  temperatureIn,
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
    expect(getUnits()).toEqual(DEFAULT_UNITS);
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
    setUnits({ ...DEFAULT_UNITS, windSpeed: "kmh" });

    expect(windFigure(10)).toBe("19");
    expect(windUnit()).toBe("km/h");
    expect(formatWind(10)).toBe("19 km/h");

    setUnits({ ...DEFAULT_UNITS, windSpeed: "ms" });

    expect(formatWind(10)).toBe("5 m/s");
  });
});

describe("the other measurements in the reader's units", () => {
  it("writes them in the metric units until the reader chooses", () => {
    expect(formatHeight(1.84)).toBe("1.8 m");
    expect(formatTemperature(15.5)).toBe("15.5 °C");
    expect(formatDistance(12.4)).toBe("12 km");
    expect(rainUnit()).toBe("mm");
    expect(rainDigits()).toBe(1);
  });

  it("writes a height in feet, and comes back to metres", () => {
    setUnits({ ...DEFAULT_UNITS, height: "ft" });

    expect(heightIn(1)).toBeCloseTo(3.28084, 4);
    expect(metersFrom(heightIn(2.4))).toBeCloseTo(2.4, 9);
    expect(formatHeight(1.8)).toBe("5.9 ft");
    expect(heightFigure(2, 0)).toBe("7");
  });

  it("writes a temperature in degrees Fahrenheit", () => {
    setUnits({ ...DEFAULT_UNITS, temperature: "f" });

    expect(temperatureIn(0)).toBe(32);
    expect(temperatureIn(100)).toBe(212);
    expect(formatTemperature(15.5)).toBe("59.9 °F");
  });

  it("writes a distance in miles and a rain in hundredths of an inch", () => {
    setUnits({ ...DEFAULT_UNITS, distance: "mi", precipitation: "in" });

    expect(distanceIn(10)).toBeCloseTo(6.2137, 3);
    expect(formatDistance(12.4)).toBe("8 mi");
    expect(rainIn(25.4)).toBeCloseTo(1, 9);
    expect(rainUnit()).toBe("in");
    expect(rainDigits()).toBe(2);
  });

  it("changes one measurement without touching the others", () => {
    setUnits({ ...DEFAULT_UNITS, height: "ft" });

    expect(formatWind(10)).toBe("10 kn");
    expect(formatTemperature(15.5)).toBe("15.5 °C");
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
