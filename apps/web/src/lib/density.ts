import type { AppRouterClient } from "@repo/api/routers/index";
import { useSyncExternalStore } from "react";

import { m } from "@/paraglide/messages.js";

/**
 * How much of the forecast a panel shows: the essentials, in words; the details, which is the
 * panel as it was without the expert's figures; or everything, the energy, the swell apart, the
 * gusts and the model beside the buoy, which is what the app starts with, as Téo chose on
 * 2026-10-16. It is kept in the account, so that it is the same on
 * every device, and in the browser, so that a page opens in it. Decision 061.
 */
export type Density = NonNullable<
  Awaited<ReturnType<AppRouterClient["v1"]["preferences"]["getDisplay"]>>
>["density"];

// From the least to the most: "less" and "more" go one step along it.
export const DENSITIES = [
  "essentials",
  "details",
  "everything",
] as const satisfies readonly Density[];
export const DEFAULT_DENSITY: Density = "everything";

const STORED_KEY = "tonnr:density";

let density: Density = DEFAULT_DENSITY;
const listeners = new Set<() => void>();

function isDensity(value: unknown): value is Density {
  return (DENSITIES as readonly unknown[]).includes(value);
}

/** The density in force. A panel reads it through `useDensity`. */
export function getDensity() {
  return density;
}

/** Puts a density in force, for every panel, and keeps it in the browser. */
export function setDensity(next: Density) {
  if (next === density) return;
  density = next;
  try {
    localStorage.setItem(STORED_KEY, next);
  } catch {
    // A browser that keeps nothing still shows the density chosen, until the page is left.
  }
  for (const listener of listeners) listener();
}

/** The density this browser kept from a visit before. Undefined when it kept nothing it knows. */
export function storedDensity(): Density | undefined {
  try {
    const kept = localStorage.getItem(STORED_KEY);
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

/** One step less than a density. Undefined at the least. */
export function lessDense(of: Density): Density | undefined {
  return DENSITIES[DENSITIES.indexOf(of) - 1];
}

/** One step more than a density. Undefined at the most. */
export function moreDense(of: Density): Density | undefined {
  return DENSITIES[DENSITIES.indexOf(of) + 1];
}

/** The name of a density, as the account's panel writes it. */
export function densityName(of: Density) {
  switch (of) {
    case "essentials":
      return m.density_essentials();
    case "details":
      return m.density_details();
    default:
      return m.density_everything();
  }
}
