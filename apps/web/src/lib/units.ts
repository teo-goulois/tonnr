import {
  DEFAULT_UNITS,
  UNITS_KEY,
  type Units,
  sameUnits,
  unitWriting,
  unitsFrom,
} from "@repo/client/units";
import { useSyncExternalStore } from "react";

import { m } from "@/paraglide/messages.js";

import { formatNumber } from "./format";

// The units, their conversions and how a measurement is written in them live in packages/client,
// which the app for phones reads too. The browser keeps the units in force here. Decision 033.
export {
  DEFAULT_UNITS,
  type DistanceUnit,
  type HeightUnit,
  type RainUnit,
  type TemperatureUnit,
  UNIT_CHOICES,
  type Units,
  type WindUnit,
} from "@repo/client/units";

let units = DEFAULT_UNITS;
const listeners = new Set<() => void>();

/** The units in force. A component that writes a measurement reads them through `useUnits`. */
export function getUnits() {
  return units;
}

/** Puts units in force, for every screen, and keeps them in the browser. */
export function setUnits(next: Units) {
  if (sameUnits(next, units)) return;
  units = next;
  try {
    localStorage.setItem(UNITS_KEY, JSON.stringify(next));
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
    return unitsFrom(localStorage.getItem(UNITS_KEY));
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

export const {
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
} = unitWriting({
  units: getUnits,
  formatNumber,
  m: {
    unit_kn: m.unit_kn,
    unit_m: m.unit_m,
    unit_ft: m.unit_ft,
    unit_mi: m.unit_mi,
    unit_in: m.unit_in,
  },
});
