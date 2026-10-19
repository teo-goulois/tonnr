import type { AppRouterClient } from "@repo/api/routers/index";

/**
 * How much of the forecast a panel shows: the essentials, in words; the details, which is the
 * panel as it was without the expert's figures; or everything, the energy, the swell apart, the
 * gusts and the model beside the buoy, which is what the app starts with, as Téo chose on
 * 2026-10-16. It is kept in the account, so that it is the same on every device, and on the
 * device, so that a screen opens in it. Decision 061.
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

/** What a device keeps the density under. */
export const DENSITY_KEY = "tonnr:density";

export function isDensity(value: unknown): value is Density {
  return (DENSITIES as readonly unknown[]).includes(value);
}

/** One step less than a density. Undefined at the least. */
export function lessDense(of: Density): Density | undefined {
  return DENSITIES[DENSITIES.indexOf(of) - 1];
}

/** One step more than a density. Undefined at the most. */
export function moreDense(of: Density): Density | undefined {
  return DENSITIES[DENSITIES.indexOf(of) + 1];
}

/** The names of the densities, from an app's messages. */
export type DensityMessages = {
  density_essentials: () => string;
  density_details: () => string;
  density_everything: () => string;
};

/** The name of a density, as the account's panel writes it. */
export function densityName(of: Density, m: DensityMessages) {
  switch (of) {
    case "essentials":
      return m.density_essentials();
    case "details":
      return m.density_details();
    default:
      return m.density_everything();
  }
}
