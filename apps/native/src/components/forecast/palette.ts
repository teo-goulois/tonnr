import { PALETTE_KEY, type Palette, STARTING_PALETTE, paletteFrom } from "@repo/client/palette";
import { useSyncExternalStore } from "react";

// The colors the week's table is read in, Windguru's or the app's own, which the phone keeps as
// the web's browser keeps them: the app's `apps/web/src/lib/palette.ts`. The line of the
// account's settings writes it here.
export { PALETTES, type Palette } from "@repo/client/palette";

const listeners = new Set<() => void>();
let palette: Palette | undefined;

function stored(): Palette {
  try {
    return paletteFrom(localStorage.getItem(PALETTE_KEY));
  } catch {
    return STARTING_PALETTE;
  }
}

export function getPalette(): Palette {
  palette ??= stored();
  return palette;
}

/** Puts a palette in force, for every table, and keeps it on the phone. */
export function setPalette(next: Palette) {
  if (next === getPalette()) return;
  palette = next;
  try {
    localStorage.setItem(PALETTE_KEY, next);
  } catch {
    // A phone that keeps nothing still shows the palette chosen, until the app is closed.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The palette in force. */
export function usePalette() {
  return useSyncExternalStore(subscribe, getPalette, getPalette);
}
