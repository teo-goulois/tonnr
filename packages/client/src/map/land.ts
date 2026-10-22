import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

// The land drawn over the sea's colors, as the web and the app draw it alike (decision 018): the
// basemap describes the water and not the land, so the land is what its sea leaves of a tile. Its
// lakes keep the basemap's color, and the sea's colors pass under them as under the land. Each app
// paints the tile with its own tools, a canvas on the web and Skia on a phone, from the outlines
// read here, which both take as SVG paths.

// The basemap draws a tile over this many points of the screen.
export const LAND_TILE_SIZE = 512;

/**
 * The version of what `waterOf` reads. An app that keeps a tile it drew by its address puts it
 * there, and asks the tile again once it changes: whatever makes it read a tile otherwise changes
 * it, which its tests hold.
 */
export const LAND_DRAWING = 1;

// A polygon, among the kinds of geometry a vector tile holds.
const POLYGON = 3;

/** The water of a basemap tile, as paths over a square of `size` pixels. */
export type TileWater = {
  // The sea, which is cut out of the land.
  ocean: string;
  // The lakes and the rivers, which are painted in the basemap's water.
  lakes: string;
};

/**
 * Reads the water of a basemap tile into two paths over a square of `size` pixels, filled by the
 * nonzero rule: the ocean, and the other water. Water that runs in a tunnel is not seen. Null for
 * a tile with no water.
 */
export function waterOf(tile: ArrayBuffer | Uint8Array, size: number): TileWater | null {
  const layer = new VectorTile(new PbfReader(tile)).layers.water;
  if (!layer) return null;
  const scale = size / layer.extent;
  const ocean: string[] = [];
  const lakes: string[] = [];
  for (let index = 0; index < layer.length; index++) {
    const feature = layer.feature(index);
    if (feature.type !== POLYGON || feature.properties.brunnel === "tunnel") continue;
    const path = feature.properties.class === "ocean" ? ocean : lakes;
    for (const ring of feature.loadGeometry()) {
      ring.forEach((point, corner) => {
        path.push(`${corner === 0 ? "M" : "L"}${point.x * scale} ${point.y * scale}`);
      });
      path.push("Z");
    }
  }
  return { ocean: ocean.join(""), lakes: lakes.join("") };
}
