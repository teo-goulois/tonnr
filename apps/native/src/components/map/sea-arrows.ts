import { goingTo, type SeaArrow } from "@repo/client/map/sea";

// Arrows on the sea, which point the way the waves go (decision 018): the grid both apps read them
// on is packages/client's, which the map is given a reader of a tile's pixels for, since a phone
// decodes a picture with other tools than a browser: `readSeaTile`, in `map-images.ts`, does, with
// Skia. A module that imports nothing of React Native, so that a test reads it.

export {
  type DirectionTiles,
  levelsOf,
  type SeaArrow,
  seaArrowsReader,
  type SeaView,
  type TileReader,
} from "@repo/client/map/sea";

/** The arrows as the map draws them, turned the way the waves go. */
export function arrowFeatures(arrows: readonly SeaArrow[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: arrows.map((arrow) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [arrow.longitude, arrow.latitude] },
      properties: { rotate: goingTo(arrow.fromDegrees) },
    })),
  };
}
