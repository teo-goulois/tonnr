import { useSyncExternalStore } from "react";

/**
 * The colors the reader reads the week's table of a panel in: those of Windguru's tables, which
 * a surfer coming from it knows by heart and the app starts with, or the app's own. Only that table follows the choice: the
 * map, its legend and the curves keep the app's, which `sea-scales.ts` holds with Windguru's.
 * The browser keeps it, as it keeps the theme.
 */
export const PALETTES = ["windguru", "tonnr"] as const;
const STARTING: Palette = "windguru";
export type Palette = (typeof PALETTES)[number];

const STORED_KEY = "tonnr:palette";
const listeners = new Set<() => void>();

function stored(): Palette {
  try {
    const kept = localStorage.getItem(STORED_KEY);
    return (PALETTES as readonly (string | null)[]).includes(kept) ? (kept as Palette) : STARTING;
  } catch {
    return STARTING;
  }
}

let palette: Palette | undefined;

export function getPalette(): Palette {
  palette ??= stored();
  return palette;
}

/** Puts a palette in force, for every table, and keeps it in the browser. */
export function setPalette(next: Palette) {
  if (next === getPalette()) return;
  palette = next;
  try {
    localStorage.setItem(STORED_KEY, next);
  } catch {
    // A browser that keeps nothing still shows the palette chosen, until the page is left.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The palette in force. The server draws in the one the app starts with. */
export function usePalette() {
  return useSyncExternalStore(subscribe, getPalette, () => STARTING);
}
