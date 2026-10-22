// Where the map stands and how it is drawn, as the web's `StationMap` and the app's say it alike:
// the basemap, the view a device keeps and the one the map opens on, how close it comes to what
// it is sent to, how far a finger reaches, and how a list shown alone is fitted. Decisions 018,
// 040 and 069.

/** A point as MapLibre takes it: longitude first. */
export type LngLat = [longitude: number, latitude: number];

/** West, south, east, north. West is greater than east when the area crosses the antimeridian. */
export type Bounds = [west: number, south: number, east: number, north: number];

export type MapPoint = { latitude: number; longitude: number };

export type MapView = { center: LngLat; zoom: number };

/** OpenFreeMap's styles, light and dark with the theme. */
export const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

/** The source of the basemap, whose tiles say where the water is and whose names it writes. */
export const BASEMAP_SOURCE = "openmaptiles";

/**
 * How wide a name of the basemap may run before it takes a second line, in letters' heights. The
 * basemap's own width of 8 cut a town such as "Le Mont-Saint-Michel" after a hyphen, onto two
 * lines.
 */
export const BASEMAP_NAME_WIDTH = 14;

/** A layer of a style, as much of it as says whether it writes a name. */
type StyleLayer = { id: string; type: string; source?: unknown; layout?: unknown };

/** Whether a layer of the basemap's style writes a name, which takes `BASEMAP_NAME_WIDTH`. */
export function isBasemapName(layer: StyleLayer) {
  const { layout } = layer;
  return (
    layer.type === "symbol" &&
    layer.source === BASEMAP_SOURCE &&
    typeof layout === "object" &&
    layout !== null &&
    Boolean((layout as Record<string, unknown>)["text-field"])
  );
}

/**
 * The first layer of a style that writes words or draws a symbol, which the arrows of the sea go
 * under: a name reads over them.
 */
export function firstLabelOf(layers: readonly StyleLayer[]) {
  return layers.find((layer) => layer.type === "symbol")?.id;
}

/** France and its Atlantic coast, which a phone held upright shows whole at this zoom too. */
export const DEFAULT_VIEW: MapView = { center: [-2.5, 46.3], zoom: 4.8 };

/** What a browser or a phone keeps the view under: `[longitude, latitude, zoom]`. */
export const VIEW_KEY = "tonnr:map-view";

/** How close a place found by its name is shown: near enough to see where the wave breaks. */
export const PLACE_ZOOM = 13;
/** How close the map comes to where the reader is, once found. */
export const LOCATE_ZOOM = 8;

/**
 * How far from a dot a press of a finger still finds it, in points: a dot is small, and a finger
 * is not.
 */
export const FINGER_REACH = 12;

/**
 * The room a list shown alone is fitted in, inside what the screen's own bars and a drawer leave:
 * room for the markers and their names at its edges, more at the top for a buoy's pill.
 */
export const FIT_PADDING = { top: 72, right: 56, bottom: 56, left: 56 } as const;
/** One point, or a few on one beach, are not shown closer than a bay. */
export const FIT_MAX_ZOOM = 11;

/** MapLibre's zooms, from the whole world a little smaller than the screen. */
const MIN_ZOOM = -2;
const MAX_ZOOM = 22;
/** How wide the world is at zoom 0, in points, for MapLibre on a page and on a phone. */
const WORLD_SIZE = 512;

/** The view a device kept, or the one the map opens on. */
export function readView(stored: string | null | undefined): MapView {
  try {
    const saved: unknown = JSON.parse(stored ?? "null");
    if (
      Array.isArray(saved) &&
      saved.length === 3 &&
      saved.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      const [longitude, latitude, zoom] = saved as [number, number, number];
      if (Math.abs(latitude) <= 90 && zoom >= MIN_ZOOM && zoom <= MAX_ZOOM) {
        return { center: [wrapLongitude(longitude), latitude], zoom };
      }
    }
  } catch {
    // A value this app did not write: the default view applies.
  }
  return DEFAULT_VIEW;
}

/** The view as a device keeps it. */
export function writeView(view: MapView): string {
  return JSON.stringify([view.center[0], view.center[1], view.zoom]);
}

/** A longitude brought back between -180 and 180, since the map can be dragged past either edge. */
export function wrapLongitude(degrees: number) {
  // One in the world is kept as it is, which no sum turns into another figure.
  if (degrees >= -180 && degrees <= 180) return degrees;
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** Mercator, from 0 at the north to 1 at the south. */
export const mercatorY = (latitude: number) =>
  (1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2;
/** The latitude of a point of Mercator, from 0 at the north to 1 at the south. */
export const latitudeOf = (y: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export type Padding = { top: number; right: number; bottom: number; left: number };

/** The room of `FIT_PADDING`, inside what the bars or a drawer cover at each edge. */
export function fitPadding(covered: Partial<Padding> = {}): Padding {
  return {
    top: (covered.top ?? 0) + FIT_PADDING.top,
    right: (covered.right ?? 0) + FIT_PADDING.right,
    bottom: (covered.bottom ?? 0) + FIT_PADDING.bottom,
    left: (covered.left ?? 0) + FIT_PADDING.left,
  };
}

/**
 * The zoom at which a box fills a view of `size` points less its padding, as MapLibre fits one,
 * no closer than `FIT_MAX_ZOOM`, and the middle of the box on Mercator. `capped` says that the
 * fit would come closer: a phone's map, whose fit takes no zoom to stop at, is eased to the middle
 * at that zoom instead.
 */
export function fitted(
  [west, south, east, north]: Bounds,
  size: { width: number; height: number },
  padding: Padding,
): { zoom: number; center: LngLat; capped: boolean } {
  // A box across the antimeridian runs east past 180.
  const across = (east >= west ? east - west : east + 360 - west) / 360;
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  const width = Math.max(1, size.width - padding.left - padding.right);
  const height = Math.max(1, size.height - padding.top - padding.bottom);
  // One point, or a row of them along a meridian or a parallel, is fitted at any zoom.
  const fits = Math.min(
    Math.log2(width / (across * WORLD_SIZE)),
    Math.log2(height / (Math.abs(bottom - top) * WORLD_SIZE)),
  );
  return {
    zoom: Math.min(FIT_MAX_ZOOM, fits),
    capped: fits > FIT_MAX_ZOOM,
    center: [wrapLongitude(west + (across * 360) / 2), latitudeOf((top + bottom) / 2)],
  };
}
