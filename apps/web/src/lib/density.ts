import {
  DEFAULT_DENSITY,
  DENSITY_KEY,
  type Density,
  densityName as nameOf,
  isDensity,
} from "@repo/client/density";
import { useSyncExternalStore } from "react";

import { m } from "@/paraglide/messages.js";

// The densities, their order and their names live in packages/client, which the app for phones
// reads too. The browser keeps the one in force here. Decision 061.
export {
  DEFAULT_DENSITY,
  DENSITIES,
  type Density,
  lessDense,
  moreDense,
} from "@repo/client/density";

let density: Density = DEFAULT_DENSITY;
const listeners = new Set<() => void>();

/** The density in force. A panel reads it through `useDensity`. */
export function getDensity() {
  return density;
}

/** Puts a density in force, for every panel, and keeps it in the browser. */
export function setDensity(next: Density) {
  if (next === density) return;
  density = next;
  try {
    localStorage.setItem(DENSITY_KEY, next);
  } catch {
    // A browser that keeps nothing still shows the density chosen, until the page is left.
  }
  for (const listener of listeners) listener();
}

/** The density this browser kept from a visit before. Undefined when it kept nothing it knows. */
export function storedDensity(): Density | undefined {
  try {
    const kept = localStorage.getItem(DENSITY_KEY);
    return isDensity(kept) ? kept : undefined;
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

/** The density in force, for a panel: it is drawn again when it changes. The server draws everything. */
export function useDensity() {
  return useSyncExternalStore(subscribe, getDensity, () => DEFAULT_DENSITY);
}

/** The name of a density, as the account's panel writes it. */
export function densityName(of: Density) {
  return nameOf(of, {
    density_essentials: m.density_essentials,
    density_details: m.density_details,
    density_everything: m.density_everything,
  });
}
