import { useSyncExternalStore } from "react";

/**
 * The colors the reader reads the week's table of a panel in: the app's own, or those of
 * Windguru's tables, which a surfer may know by heart. Only that table follows the choice: the
 * map, its legend and the curves keep the app's, which `sea-scales.ts` holds with Windguru's.
 * The browser keeps it, as it keeps the theme.
 */
export const PALETTES = ["tonnr", "windguru"] as const;
export type Palette = (typeof PALETTES)[number];

const STORED_KEY = "tonnr:palette";
const listeners = new Set<() => void>();

function stored(): Palette {
  try {
    const kept = localStorage.getItem(STORED_KEY);
    return (PALETTES as readonly (string | null)[]).includes(kept) ? (kept as Palette) : "tonnr";
  } catch {
    return "tonnr";
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

/** The palette in force. The server draws in the app's own. */
export function usePalette() {
  return useSyncExternalStore(subscribe, getPalette, () => "tonnr" as const);
}
