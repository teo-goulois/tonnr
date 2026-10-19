import { describe, expect, it } from "vitest";

import { testReader } from "./testing";
import { DEFAULT_UNITS, sameUnits, unitsFrom } from "./units";

describe("a wind speed in the reader's unit", () => {
  it("is written in knots until the reader chooses", () => {
    const { units, writing } = testReader();

    expect(units()).toEqual(DEFAULT_UNITS);
    expect(writing.formatWind(12.4)).toBe("12 kn");
  });

  it("is turned from knots into the unit chosen", () => {
    const { windIn } = testReader().writing;

    expect(windIn(10, "kn")).toBe(10);
    expect(windIn(10, "kmh")).toBeCloseTo(18.52, 5);
    expect(windIn(10, "ms")).toBeCloseTo(5.1444, 3);
    expect(windIn(10, "mph")).toBeCloseTo(11.5078, 3);
  });

  it("comes back to knots from the unit chosen", () => {
    const { knotsFrom, windIn } = testReader().writing;

    for (const unit of ["kn", "kmh", "ms", "mph"] as const) {
      expect(knotsFrom(windIn(17.3, unit), unit)).toBeCloseTo(17.3, 9);
    }
  });

  it("follows the choice everywhere it is written", () => {
    const { setUnits, writing } = testReader();
    setUnits({ ...DEFAULT_UNITS, windSpeed: "kmh" });

    expect(writing.windFigure(10)).toBe("19");
    expect(writing.windUnit()).toBe("km/h");
    expect(writing.formatWind(10)).toBe("19 km/h");

    setUnits({ ...DEFAULT_UNITS, windSpeed: "ms" });

    expect(writing.formatWind(10)).toBe("5 m/s");
  });
});

describe("the other measurements in the reader's units", () => {
  it("writes them in the metric units until the reader chooses", () => {
    const { writing } = testReader();

    expect(writing.formatHeight(1.84)).toBe("1.8 m");
    expect(writing.formatTemperature(15.5)).toBe("15.5 °C");
    expect(writing.formatDistance(12.4)).toBe("12 km");
    expect(writing.rainUnit()).toBe("mm");
    expect(writing.rainDigits()).toBe(1);
  });

  it("writes a height in feet, and comes back to metres", () => {
    const { writing } = testReader({ ...DEFAULT_UNITS, height: "ft" });

    expect(writing.heightIn(1)).toBeCloseTo(3.28084, 4);
    expect(writing.metersFrom(writing.heightIn(2.4))).toBeCloseTo(2.4, 9);
    expect(writing.formatHeight(1.8)).toBe("5.9 ft");
    expect(writing.heightFigure(2, 0)).toBe("7");
  });

  it("writes a temperature in degrees Fahrenheit", () => {
    const { writing } = testReader({ ...DEFAULT_UNITS, temperature: "f" });

    expect(writing.temperatureIn(0)).toBe(32);
    expect(writing.temperatureIn(100)).toBe(212);
    expect(writing.formatTemperature(15.5)).toBe("59.9 °F");
  });

  it("writes a distance in miles and a rain in hundredths of an inch", () => {
    const { writing } = testReader({ ...DEFAULT_UNITS, distance: "mi", precipitation: "in" });

    expect(writing.distanceIn(10)).toBeCloseTo(6.2137, 3);
    expect(writing.formatDistance(12.4)).toBe("8 mi");
    expect(writing.rainIn(25.4)).toBeCloseTo(1, 9);
    expect(writing.rainUnit()).toBe("in");
    expect(writing.rainDigits()).toBe(2);
  });

  it("changes one measurement without touching the others", () => {
    const { writing } = testReader({ ...DEFAULT_UNITS, height: "ft" });

    expect(writing.formatWind(10)).toBe("10 kn");
    expect(writing.formatTemperature(15.5)).toBe("15.5 °C");
  });

  it("writes in the unit it is given rather than the reader's", () => {
    const { writing } = testReader({ ...DEFAULT_UNITS, height: "ft" });

    expect(writing.heightIn(1, "m")).toBe(1);
    expect(writing.heightUnit("m")).toBe("m");
  });
});

describe("the units a device keeps", () => {
  it("are read as they were kept", () => {
    const kept = { ...DEFAULT_UNITS, windSpeed: "mph", height: "ft" } as const;

    expect(unitsFrom(JSON.stringify(kept))).toEqual(kept);
  });

  it("start a unit this app does not know, or that was not kept, as the app does", () => {
    expect(unitsFrom('{"windSpeed":"furlongs","temperature":"f"}')).toEqual({
      ...DEFAULT_UNITS,
      temperature: "f",
    });
  });

  it("are nothing when nothing, or no set of units, was kept", () => {
    expect(unitsFrom(null)).toBeUndefined();
    expect(unitsFrom("not json")).toBeUndefined();
    expect(unitsFrom('"kn"')).toBeUndefined();
  });

  it("are the same when every measurement is", () => {
    expect(sameUnits(DEFAULT_UNITS, { ...DEFAULT_UNITS })).toBe(true);
    expect(sameUnits(DEFAULT_UNITS, { ...DEFAULT_UNITS, distance: "mi" })).toBe(false);
  });
});
