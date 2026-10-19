import {
  DEFAULT_DENSITY,
  DENSITY_KEY,
  type Density,
  densityName as nameOfDensity,
  isDensity,
} from "@repo/client/density";
import { PALETTE_KEY, type Palette, paletteFrom } from "@repo/client/palette";
import { useSyncExternalStore } from "react";

import { m } from "@/paraglide/messages";

// How much of the forecast a panel shows (decision 061) and the colors its week's table is read
// in, as the phone keeps them: in the localStorage that expo-sqlite gives the app, under the keys
// the web's browser keeps them under, and in force for every screen at once. The density is also
// the account's, which `useKeptSettings` reads and `useSaveDensity` writes; the palette is the
// phone's alone, as it is the browser's. A panel of the forecast reads both through `useDensity`
// and `usePalette`.

export { DENSITIES, type Density } from "@repo/client/density";
export { PALETTES, type Palette } from "@repo/client/palette";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A phone that keeps nothing reads in the choice until the app is closed.
  }
}

/** A value every screen reads, kept on the phone, and drawn again where it is read when it changes. */
function kept<Value>(key: string, of: (stored: string | null) => Value) {
  let value = of(read(key));
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  return {
    get: () => value,
    set: (next: Value) => {
      if (next === value) return;
      value = next;
      keep(key, String(next));
      for (const listener of listeners) listener();
    },
    subscribe,
  };
}

const density = kept<Density>(DENSITY_KEY, (stored) =>
  isDensity(stored) ? stored : DEFAULT_DENSITY,
);
const palette = kept<Palette>(PALETTE_KEY, paletteFrom);

/** The density in force. */
export const getDensity = density.get;
/** Puts a density in force on every screen, and keeps it on the phone. */
export const setDensity = density.set;
/** The density in force, for what draws a panel: it is drawn again when the density changes. */
export function useDensity() {
  return useSyncExternalStore(density.subscribe, density.get, density.get);
}

/** The palette of the week's table. */
export const getPalette = palette.get;
/** Puts a palette in force, and keeps it on the phone. */
export const setPalette = palette.set;
/** The palette in force, for the week's table: it is drawn again when it changes. */
export function usePalette() {
  return useSyncExternalStore(palette.subscribe, palette.get, palette.get);
}

/** The name of a density, as the account's tab writes it. */
export const densityName = (of: Density) => nameOfDensity(of, m);
