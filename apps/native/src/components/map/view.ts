import { type Bounds, type MapPoint, wrapLongitude } from "@repo/client/map/view";
import { distanceKm } from "@repo/client/viewer/samples";

// Where the map stands and what part of the world it reads, as the web's `StationMap` and its
// route say it: the area the API is asked about, and the middle a search ranks what is near by.
// What the phone keeps of the view and the view it opens on are both apps', in packages/client.
// A module that imports nothing of React Native, so that a test reads it.

export {
  type Bounds,
  DEFAULT_VIEW,
  LOCATE_ZOOM,
  type LngLat,
  type MapPoint,
  type MapView,
  PLACE_ZOOM,
  readView,
  STYLE_URLS,
  VIEW_KEY,
  wrapLongitude,
  writeView,
} from "@repo/client/map/view";

/**
 * How close the map comes to a break or a spot it is sent to, from a search or once a spot is
 * added, so that it is seen among its neighbours.
 */
export const BREAK_ZOOM = 11;
/** How close the map comes to a spot being put, so that a beach is told from the next. */
export const SPOT_ZOOM = 14;

const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

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

/**
 * The first of `places` within `meters` of `point`, the nearest first, measured as the web's
 * panels measure a distance (packages/client), the short way round the antimeridian.
 */
export function nearestWithin<Place extends MapPoint>(
  places: readonly Place[] | undefined,
  point: MapPoint,
  meters: number,
): Place | undefined {
  let nearest: Place | undefined;
  let shortest = meters;
  for (const place of places ?? []) {
    const distance = distanceKm(place, point) * 1000;
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
