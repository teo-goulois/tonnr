import type { AppRouterClient } from "@repo/api/routers/index";

/**
 * The units the reader chose to read measurements in. The API speaks in SI units and the screens
 * compute in the units their scales of colors are in, knots and metres: only what is written
 * follows the choice. It is kept in the account, and on the device so that a screen opens in it.
 * Decision 033.
 */
export type Units = NonNullable<
  Awaited<ReturnType<AppRouterClient["v1"]["preferences"]["getUnits"]>>
>;
export type WindUnit = Units["windSpeed"];
export type HeightUnit = Units["height"];
export type TemperatureUnit = Units["temperature"];
export type DistanceUnit = Units["distance"];
export type RainUnit = Units["precipitation"];

// Every unit a measurement may be written in, the one the app starts with first.
export const UNIT_CHOICES = {
  windSpeed: ["kn", "kmh", "ms", "mph"],
  height: ["m", "ft"],
  temperature: ["c", "f"],
  distance: ["km", "mi"],
  precipitation: ["mm", "in"],
} as const satisfies { [Measure in keyof Units]: readonly Units[Measure][] };

export const DEFAULT_UNITS: Units = {
  windSpeed: "kn",
  height: "m",
  temperature: "c",
  distance: "km",
  precipitation: "mm",
};

const MEASURES = Object.keys(UNIT_CHOICES) as (keyof Units)[];

/** What a device keeps the units under. */
export const UNITS_KEY = "tonnr:units";

/** Whether two sets of units are the same. */
export function sameUnits(one: Units, other: Units) {
  return MEASURES.every((measure) => one[measure] === other[measure]);
}

/**
 * The units a device kept from a visit before, as it kept them, each one this app does not know
 * replaced by the one it starts with. Undefined when it kept nothing.
 */
export function unitsFrom(kept: string | null): Units | undefined {
  try {
    const read: unknown = JSON.parse(kept ?? "null");
    if (typeof read !== "object" || read === null) return undefined;
    const known = (measure: keyof Units) => {
      const unit = (read as Record<string, unknown>)[measure];
      return (UNIT_CHOICES[measure] as readonly unknown[]).includes(unit)
        ? unit
        : DEFAULT_UNITS[measure];
    };
    return Object.fromEntries(MEASURES.map((measure) => [measure, known(measure)])) as Units;
  } catch {
    return undefined;
  }
}

/** The names of units that each language writes its own way, from an app's messages. */
export type UnitMessages = {
  unit_kn: () => string;
  unit_m: () => string;
  unit_ft: () => string;
  unit_mi: () => string;
  unit_in: () => string;
};

// How much of each unit one knot is.
const PER_KNOT: Record<WindUnit, number> = {
  kn: 1,
  kmh: 1.852,
  ms: 1852 / 3600,
  mph: 1.852 / 1.609344,
};
const FEET_PER_METER = 1 / 0.3048;
const MILES_PER_KM = 1 / 1.609344;
const INCHES_PER_MM = 1 / 25.4;

/**
 * What writes a measurement in the units the reader chose: those `units` answers when it is
 * written, unless a unit is given. `formatNumber` writes a figure in the reader's language.
 */
export function unitWriting({
  units,
  formatNumber,
  m,
}: {
  units: () => Units;
  formatNumber: (value: number, digits?: number) => string;
  m: UnitMessages;
}) {
  /** A wind speed in knots, in the reader's unit. */
  function windIn(knots: number, unit: WindUnit = units().windSpeed) {
    return knots * PER_KNOT[unit];
  }

  /** A wind speed in the reader's unit, in knots. */
  function knotsFrom(value: number, unit: WindUnit = units().windSpeed) {
    return value / PER_KNOT[unit];
  }

  /** The name of a unit of wind speed, as it is written after a figure. The reader's by default. */
  function windUnit(unit: WindUnit = units().windSpeed) {
    if (unit === "kn") return m.unit_kn();
    return { kmh: "km/h", ms: "m/s", mph: "mph" }[unit];
  }

  /** A wind speed in knots, as a figure in the reader's unit: "22". */
  function windFigure(knots: number) {
    return formatNumber(windIn(knots), 0);
  }

  /** A wind speed in knots, written in the reader's unit: "22 km/h". */
  function formatWind(knots: number) {
    return `${windFigure(knots)} ${windUnit()}`;
  }

  /** A height in metres, of a wave or of the tide, in the reader's unit. */
  function heightIn(meters: number, unit: HeightUnit = units().height) {
    return unit === "ft" ? meters * FEET_PER_METER : meters;
  }

  /** A height in the reader's unit, in metres. */
  function metersFrom(value: number, unit: HeightUnit = units().height) {
    return unit === "ft" ? value / FEET_PER_METER : value;
  }

  function heightUnit(unit: HeightUnit = units().height) {
    return unit === "ft" ? m.unit_ft() : m.unit_m();
  }

  /** A height in metres, as a figure in the reader's unit: "1.8". */
  function heightFigure(meters: number, digits = 1) {
    return formatNumber(heightIn(meters), digits);
  }

  /** A height in metres, written in the reader's unit: "1.8 m", or "5.9 ft". */
  function formatHeight(meters: number, digits = 1) {
    return `${heightFigure(meters, digits)} ${heightUnit()}`;
  }

  /** A temperature in degrees Celsius, in the reader's unit. */
  function temperatureIn(celsius: number, unit: TemperatureUnit = units().temperature) {
    return unit === "f" ? (celsius * 9) / 5 + 32 : celsius;
  }

  function temperatureUnit(unit: TemperatureUnit = units().temperature) {
    return unit === "f" ? "°F" : "°C";
  }

  /** A temperature in degrees Celsius, written in the reader's unit: "15.5 °C", or "60 °F". */
  function formatTemperature(celsius: number, digits = 1) {
    return `${formatNumber(temperatureIn(celsius), digits)} ${temperatureUnit()}`;
  }

  /** A distance in kilometres, in the reader's unit. */
  function distanceIn(km: number, unit: DistanceUnit = units().distance) {
    return unit === "mi" ? km * MILES_PER_KM : km;
  }

  function distanceUnit(unit: DistanceUnit = units().distance) {
    return unit === "mi" ? m.unit_mi() : "km";
  }

  /** A distance in kilometres, written in the reader's unit: "12 km", or "7 mi". */
  function formatDistance(km: number, digits = 0) {
    return `${formatNumber(distanceIn(km), digits)} ${distanceUnit()}`;
  }

  /** A rain in millimetres, in the reader's unit. */
  function rainIn(millimeters: number, unit: RainUnit = units().precipitation) {
    return unit === "in" ? millimeters * INCHES_PER_MM : millimeters;
  }

  function rainUnit(unit: RainUnit = units().precipitation) {
    return unit === "in" ? m.unit_in() : "mm";
  }

  /** How many digits a rain is written with: a tenth of a millimetre, a hundredth of an inch. */
  function rainDigits(unit: RainUnit = units().precipitation) {
    return unit === "in" ? 2 : 1;
  }

  return {
    windIn,
    knotsFrom,
    windUnit,
    windFigure,
    formatWind,
    heightIn,
    metersFrom,
    heightUnit,
    heightFigure,
    formatHeight,
    temperatureIn,
    temperatureUnit,
    formatTemperature,
    distanceIn,
    distanceUnit,
    formatDistance,
    rainIn,
    rainUnit,
    rainDigits,
  };
}

export type UnitWriting = ReturnType<typeof unitWriting>;
