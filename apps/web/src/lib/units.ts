import type { AppRouterClient } from "@repo/api/routers/index";
import { useSyncExternalStore } from "react";

import { m } from "@/paraglide/messages.js";

import { formatNumber } from "./format";

/**
 * The units the reader chose to read measurements in. The API speaks in SI units and the screens
 * compute in knots, as the wind's scale of colors does: only what is written follows the choice.
 * It is kept in the account, and in the browser so that a page opens in it. Decision 033.
 */
export type Units = NonNullable<Awaited<ReturnType<AppRouterClient["preferences"]["getUnits"]>>>;
export type WindUnit = Units["windSpeed"];

export const WIND_UNITS = ["kn", "kmh", "ms", "mph"] as const satisfies readonly WindUnit[];
export const DEFAULT_UNITS: Units = { windSpeed: "kn" };

const STORED_KEY = "tonnr:units";

let units = DEFAULT_UNITS;
const listeners = new Set<() => void>();

function isWindUnit(value: unknown): value is WindUnit {
  return WIND_UNITS.includes(value as WindUnit);
}

/** The units in force. A component that writes a measurement reads them through `useUnits`. */
export function getUnits() {
  return units;
}

/** Puts units in force, for every screen, and keeps them in the browser. */
export function setUnits(next: Units) {
  if (next.windSpeed === units.windSpeed) return;
  units = next;
  try {
    localStorage.setItem(STORED_KEY, JSON.stringify(next));
  } catch {
    // A browser that keeps nothing still reads in the units chosen, until the page is left.
  }
  for (const listener of listeners) listener();
}

/** The units this browser kept from a visit before. Undefined when it kept none it knows. */
export function storedUnits(): Units | undefined {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(STORED_KEY) ?? "null");
    const windSpeed = (kept as { windSpeed?: unknown } | null)?.windSpeed;
    return isWindUnit(windSpeed) ? { windSpeed } : undefined;
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

/** A wind speed in knots, in the reader's unit. */
export function windIn(knots: number, unit: WindUnit = units.windSpeed) {
  return knots * PER_KNOT[unit];
}

/** A wind speed in the reader's unit, in knots. */
export function knotsFrom(value: number, unit: WindUnit = units.windSpeed) {
  return value / PER_KNOT[unit];
}

/** The name of the reader's unit of wind speed, as it is written after a figure. */
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
