import type { AppRouterClient } from "@repo/api/routers/index";
import { useSyncExternalStore } from "react";

import { m } from "@/paraglide/messages.js";

import { formatNumber } from "./format";

/**
 * The units the reader chose to read measurements in. The API speaks in SI units and the screens
 * compute in the units their scales of colors are in, knots and metres: only what is written
 * follows the choice. It is kept in the account, and in the browser so that a page opens in it.
 * Decision 033.
 */
export type Units = NonNullable<Awaited<ReturnType<AppRouterClient["preferences"]["getUnits"]>>>;
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
const STORED_KEY = "tonnr:units";

let units = DEFAULT_UNITS;
const listeners = new Set<() => void>();

/** The units in force. A component that writes a measurement reads them through `useUnits`. */
export function getUnits() {
  return units;
}

/** Puts units in force, for every screen, and keeps them in the browser. */
export function setUnits(next: Units) {
  if (MEASURES.every((measure) => next[measure] === units[measure])) return;
  units = next;
  try {
    localStorage.setItem(STORED_KEY, JSON.stringify(next));
  } catch {
    // A browser that keeps nothing still reads in the units chosen, until the page is left.
  }
  for (const listener of listeners) listener();
}

/**
 * The units this browser kept from a visit before, each one it does not know replaced by the
 * one the app starts with. Undefined when it kept nothing.
 */
export function storedUnits(): Units | undefined {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(STORED_KEY) ?? "null");
    if (typeof kept !== "object" || kept === null) return undefined;
    const known = (measure: keyof Units) => {
      const unit = (kept as Record<string, unknown>)[measure];
      return (UNIT_CHOICES[measure] as readonly unknown[]).includes(unit)
        ? unit
        : DEFAULT_UNITS[measure];
    };
    return Object.fromEntries(MEASURES.map((measure) => [measure, known(measure)])) as Units;
  } catch {
    return undefined;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The units in force, for a component that writes a measurement: it is drawn again when they
 * change. The server draws in the units the app starts with.
 */
export function useUnits() {
  return useSyncExternalStore(subscribe, getUnits, () => DEFAULT_UNITS);
}

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

/** A wind speed in knots, in the reader's unit. */
export function windIn(knots: number, unit: WindUnit = units.windSpeed) {
  return knots * PER_KNOT[unit];
}

/** A wind speed in the reader's unit, in knots. */
export function knotsFrom(value: number, unit: WindUnit = units.windSpeed) {
  return value / PER_KNOT[unit];
}

/** The name of a unit of wind speed, as it is written after a figure. The reader's by default. */
export function windUnit(unit: WindUnit = units.windSpeed) {
  if (unit === "kn") return m.unit_kn();
  return { kmh: "km/h", ms: "m/s", mph: "mph" }[unit];
}

/** A wind speed in knots, as a figure in the reader's unit: "22". */
export function windFigure(knots: number) {
  return formatNumber(windIn(knots), 0);
}

/** A wind speed in knots, written in the reader's unit: "22 km/h". */
export function formatWind(knots: number) {
  return `${windFigure(knots)} ${windUnit()}`;
}

/** A height in metres, of a wave or of the tide, in the reader's unit. */
export function heightIn(meters: number, unit: HeightUnit = units.height) {
  return unit === "ft" ? meters * FEET_PER_METER : meters;
}

/** A height in the reader's unit, in metres. */
export function metersFrom(value: number, unit: HeightUnit = units.height) {
  return unit === "ft" ? value / FEET_PER_METER : value;
}

export function heightUnit(unit: HeightUnit = units.height) {
  return unit === "ft" ? m.unit_ft() : m.unit_m();
}

/** A height in metres, as a figure in the reader's unit: "1.8". */
export function heightFigure(meters: number, digits = 1) {
  return formatNumber(heightIn(meters), digits);
}

/** A height in metres, written in the reader's unit: "1.8 m", or "5.9 ft". */
export function formatHeight(meters: number, digits = 1) {
  return `${heightFigure(meters, digits)} ${heightUnit()}`;
}

/** A temperature in degrees Celsius, in the reader's unit. */
export function temperatureIn(celsius: number, unit: TemperatureUnit = units.temperature) {
  return unit === "f" ? (celsius * 9) / 5 + 32 : celsius;
}

export function temperatureUnit(unit: TemperatureUnit = units.temperature) {
  return unit === "f" ? "°F" : "°C";
}

/** A temperature in degrees Celsius, written in the reader's unit: "15.5 °C", or "60 °F". */
export function formatTemperature(celsius: number, digits = 1) {
  return `${formatNumber(temperatureIn(celsius), digits)} ${temperatureUnit()}`;
}

/** A distance in kilometres, in the reader's unit. */
export function distanceIn(km: number, unit: DistanceUnit = units.distance) {
  return unit === "mi" ? km * MILES_PER_KM : km;
}

export function distanceUnit(unit: DistanceUnit = units.distance) {
  return unit === "mi" ? m.unit_mi() : "km";
}

/** A distance in kilometres, written in the reader's unit: "12 km", or "7 mi". */
export function formatDistance(km: number, digits = 0) {
  return `${formatNumber(distanceIn(km), digits)} ${distanceUnit()}`;
}

/** A rain in millimetres, in the reader's unit. */
export function rainIn(millimeters: number, unit: RainUnit = units.precipitation) {
  return unit === "in" ? millimeters * INCHES_PER_MM : millimeters;
}

export function rainUnit(unit: RainUnit = units.precipitation) {
  return unit === "in" ? m.unit_in() : "mm";
}

/** How many digits a rain is written with: a tenth of a millimetre, a hundredth of an inch. */
export function rainDigits(unit: RainUnit = units.precipitation) {
  return unit === "in" ? 2 : 1;
}
