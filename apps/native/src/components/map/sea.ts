import { seaColorTable } from "@repo/client/sea-scales";

import type { Expression } from "./features";

// The sea colored by its wave height, decision 018, on a phone. The web colors each gray tile of
// Copernicus in the browser, through a protocol of maplibre-gl that MapLibre Native does not have.
// MapLibre Native reads a tile as heights itself, though: a raster DEM, which a `color-relief`
// layer colors by the height it reads. A gray tile read as a DEM in Mapbox's encoding gives each
// gray level a height of its own, the higher the lighter, so that the color ramp of the relief,
// written at the height of each level, colors each level as the web colors it. What the model
// leaves blank is transparent, which the encoding reads as the level of no sea. Between two
// pixels, the relief mixes the levels before it colors them, where the web mixes the colors.
// A module that imports nothing of React Native, so that a test reads it.

export { SEA_MAX_ZOOM } from "@repo/client/map/sea";

/** How the map is told to read the gray of a tile as a height. */
export const SEA_ENCODING = "mapbox" as const;

/** The address of the sea's tiles at a moment, with `{z}`, `{x}` and `{y}` for the map to fill. */
export function seaTileUrl(template: string, time: Date) {
  return template.replace("{time}", encodeURIComponent(time.toISOString()));
}

/** The height MapLibre reads in a gray pixel of `level`, in Mapbox's encoding of a DEM. */
export function levelElevation(level: number) {
  return -10_000 + (level * 256 * 256 + level * 256 + level) * 0.1;
}

const NO_SEA = "rgba(0, 0, 0, 0)";

/** A color of the sea's table as MapLibre reads one. */
function rgba(table: Uint8ClampedArray, level: number) {
  const at = level * 4;
  const alpha = Math.round((table[at + 3]! / 255) * 1000) / 1000;
  return `rgba(${table[at]}, ${table[at + 1]}, ${table[at + 2]}, ${alpha})`;
}

/**
 * The color of each gray level of a sea tile, at the height the map reads in it: the ramp of the
 * relief that colors the sea. A run of levels of one color keeps its two ends, so that the ramp
 * stays as flat as the table between them.
 */
export function seaReliefColor(metersByLevel: readonly number[]): Expression {
  const table = seaColorTable(metersByLevel);
  // A transparent pixel reads as level 0, which the model's legend gives a calm sea of a few
  // centimetres: where the model has no sea, under the land, it would draw a veil of the calm's
  // blue. The level of no sea stays transparent.
  const colors = Array.from({ length: 256 }, (_, level) =>
    level === 0 ? NO_SEA : rgba(table, level),
  );
  const stops: (number | string)[] = [];
  colors.forEach((color, level) => {
    const before = colors[level - 1];
    const after = colors[level + 1];
    // A level inside a run says nothing that its two ends do not.
    if (before === color && after === color) return;
    stops.push(levelElevation(level), color);
  });
  return ["interpolate", ["linear"], ["elevation"], ...stops] as unknown as Expression;
}
