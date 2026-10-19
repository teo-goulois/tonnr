/**
 * The colors the reader reads the week's table of a panel in: those of Windguru's tables, which
 * a surfer coming from it knows by heart and the app starts with, or the app's own. Only that
 * table follows the choice: the map, its legend and the curves keep the app's, which
 * `sea-scales.ts` holds with Windguru's. The device keeps it, as it keeps the theme.
 */
export const PALETTES = ["windguru", "tonnr"] as const;
export type Palette = (typeof PALETTES)[number];
export const STARTING_PALETTE: Palette = "windguru";

/** What a device keeps the palette under. */
export const PALETTE_KEY = "tonnr:palette";

/** The palette a device kept, or the one the app starts with when it kept none it knows. */
export function paletteFrom(kept: string | null): Palette {
  return (PALETTES as readonly (string | null)[]).includes(kept)
    ? (kept as Palette)
    : STARTING_PALETTE;
}
