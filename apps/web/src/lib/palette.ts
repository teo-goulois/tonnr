import { PALETTE_KEY, type Palette, STARTING_PALETTE, paletteFrom } from "@repo/client/palette";
import { useSyncExternalStore } from "react";

// The palettes of the week's table live in packages/client, which the app for phones reads too.
// The browser keeps the one in force here, as it keeps the theme.
export { PALETTES, type Palette } from "@repo/client/palette";

const listeners = new Set<() => void>();

function stored(): Palette {
  try {
    return paletteFrom(localStorage.getItem(PALETTE_KEY));
  } catch {
    return STARTING_PALETTE;
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
    localStorage.setItem(PALETTE_KEY, next);
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
  return useSyncExternalStore(subscribe, getPalette, () => STARTING_PALETTE);
}
