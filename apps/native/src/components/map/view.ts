// Where the map stands and what part of the world it reads, as the web's `StationMap` and its
// route say it: what the phone keeps of the view, the area the API is asked about, and the middle
// a search ranks what is near by. A module that imports nothing at run time, so that a test reads it.

/** A point as MapLibre takes it: longitude first. */
export type LngLat = [longitude: number, latitude: number];

/** West, south, east, north. West is greater than east when the area crosses the antimeridian. */
export type Bounds = [west: number, south: number, east: number, north: number];

export type MapPoint = { latitude: number; longitude: number };

export type MapView = { center: LngLat; zoom: number };

/** OpenFreeMap's styles, as the web draws them, light and dark with the theme. */
export const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

// France and its Atlantic coast, as the web opens on it, a little further out: a phone held
// upright is narrower than a browser, and would cut the coast at the web's zoom.
export const DEFAULT_VIEW: MapView = { center: [-2.5, 46.3], zoom: 4.3 };

/** What the phone keeps the view under, as the browser does. */
export const VIEW_KEY = "tonnr:map-view";

/** How close a place by its name is shown, as the web's search shows one. */
export const PLACE_ZOOM = 13;
/** How close the map comes to where the reader is, as the web's button brings it. */
export const LOCATE_ZOOM = 8;
/** How close the map comes to a spot being put, so that a beach is told from the next. */
export const SPOT_ZOOM = 14;

const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

/** The view a phone kept, or the one the map opens on. */
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

/** The view as the phone keeps it, in the browser's own form. */
export function writeView(view: MapView): string {
  return JSON.stringify([view.center[0], view.center[1], view.zoom]);
}

/** A longitude brought back between -180 and 180, since the map can be dragged past either edge. */
export function wrapLongitude(degrees: number) {
  // One in the world is kept as it is, which no sum turns into another figure.
  if (degrees >= -180 && degrees <= 180) return degrees;
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

// A tenth of a degree, written as one.
const toTenth = (degrees: number) => Math.round(degrees * 10) / 10;

/**
 * The visible area, widened to a tenth of a degree so that small moves ask for the same area, as
 * the web asks it. A view wider than the world asks for the whole of it.
 */
export function visibleBounds([west, south, east, north]: Bounds): Bounds {
  const wideWest = Math.floor(west * 10) / 10;
  const wideEast = Math.ceil(east * 10) / 10;
  const wide = wideEast - wideWest >= 360;
  const clamp = (value: number) => Math.max(-90, Math.min(90, value));
  return [
    wide ? -180 : toTenth(wrapLongitude(wideWest)),
    clamp(Math.floor(south * 10) / 10),
    wide ? 180 : toTenth(wrapLongitude(wideEast)),
    clamp(Math.ceil(north * 10) / 10),
  ];
}

/** The area as the API reads it in `bbox`. */
export function bboxOf(bounds: Bounds) {
  return bounds.join(",");
}

/**
 * The middle of what the map shows, and how close it is: the zoom at which the world is as many
 * times wider than the view. None for a view that crosses the antimeridian.
 */
export function middleOf(bounds: Bounds | null | undefined) {
  if (!bounds) return undefined;
  const [west, south, east, north] = bounds;
  if (west >= east) return undefined;
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    zoom: Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.log2(360 / (east - west))))),
  };
}

/** The distance between two points near one another, in meters, on a flat earth. */
export function metersBetween(one: MapPoint, other: MapPoint) {
  const perDegree = 111_320;
  const north = (one.latitude - other.latitude) * perDegree;
  // The short way round: 179.999 and -179.999 are neighbours.
  const turned = wrapLongitude(one.longitude - other.longitude);
  const east = turned * perDegree * Math.cos((one.latitude * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** The first of `places` within `meters` of `point`, the nearest first. */
export function nearestWithin<Place extends MapPoint>(
  places: readonly Place[] | undefined,
  point: MapPoint,
  meters: number,
): Place | undefined {
  let nearest: Place | undefined;
  let shortest = meters;
  for (const place of places ?? []) {
    const distance = metersBetween(place, point);
    if (distance < shortest) {
      shortest = distance;
      nearest = place;
    }
  }
  return nearest;
}

/** The smallest box that holds every point, or none for no point. */
export function boundsAround(points: readonly MapPoint[]): Bounds | undefined {
  const [first] = points;
  if (!first) return undefined;
  let [west, south, east, north] = [
    first.longitude,
    first.latitude,
    first.longitude,
    first.latitude,
  ];
  for (const point of points) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }
  return [west, south, east, north];
}
