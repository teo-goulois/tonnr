import { type Bounds, type MapPoint, nearestWithin, wrapLongitude } from "./view";

// A spot of the account's own as it is being added (decision 006): where its marker stands, the
// break of the catalogue it stands on, and its name, which follows what the marker is put on until
// the person writes one, as the web's route does it. A module that imports nothing at run time,
// so that a test reads it.

/** A spot or a break this close to the marker is the same place, as far as a warning goes. */
export const SAME_PLACE_METERS = 150;
/** A name as the API takes it. */
export const NAME_MOST = 80;

export type SpotDraft = {
  name: string;
  // The name the search or the map gave the draft. A name the person wrote is not replaced.
  suggested: string;
  // Where the marker stands: where it was put, or the middle of the map until then.
  point: MapPoint;
  // The break of the catalogue the marker was put on, until it is moved off it.
  breakId?: string | undefined;
  // Whether the person put the marker somewhere: a press held on the map that opened the sheet,
  // the map moved or pressed, a place found. Until then it stands where the map was, and the
  // spot is not saved there.
  placed: boolean;
};

/** A draft whose marker stands at `point`, put there by the person or not. */
export function draftAt(point: MapPoint, placed: boolean): SpotDraft {
  return { name: "", suggested: "", point: worldPoint(point), placed };
}

/** A point brought back into the world, as the map can be dragged past its edge. */
function worldPoint(point: MapPoint): MapPoint {
  return {
    latitude: Math.max(-90, Math.min(90, point.latitude)),
    longitude: wrapLongitude(point.longitude),
  };
}

/** The point an address names, as a press held on the map writes it, or none. */
export function pointOf(latitude: unknown, longitude: unknown): MapPoint | undefined {
  const read = (value: unknown) => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string" || text.trim() === "") return undefined;
    const figure = Number(text);
    return Number.isFinite(figure) ? figure : undefined;
  };
  const north = read(latitude);
  const east = read(longitude);
  if (north === undefined || east === undefined || Math.abs(north) > 90) return undefined;
  return { latitude: north, longitude: wrapLongitude(east) };
}

/**
 * The draft once its marker is put at `point`: on a break, which it is then made from, or on what
 * else has a name, which the draft takes until the person writes one of their own. Put anywhere
 * else, it keeps its name and leaves the break.
 */
export function placedAt(
  draft: SpotDraft,
  point: MapPoint,
  on: { breakId?: string | undefined; name?: string | undefined } = {},
): SpotDraft {
  const named = on.name?.trim().slice(0, NAME_MOST);
  const follows = !draft.name.trim() || draft.name === draft.suggested;
  return {
    ...(named && follows
      ? { name: named, suggested: named }
      : { name: draft.name, suggested: draft.suggested }),
    point: worldPoint(point),
    breakId: on.breakId,
    placed: true,
  };
}

// A millionth of a degree is a tenth of a metre: what a finger puts says no more.
const toMillionth = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

/**
 * What `spots.create` is given, or nothing while the spot cannot be saved: a marker left on the
 * break it was put on makes the spot from that break, which the API then places itself; moved,
 * it is a point of the person's own.
 */
export function createInput(draft: SpotDraft) {
  const name = draft.name.trim().slice(0, NAME_MOST);
  if (!draft.placed || !name) return undefined;
  if (draft.breakId) return { breakId: draft.breakId, name };
  return {
    name,
    latitude: toMillionth(draft.point.latitude),
    longitude: toMillionth(draft.point.longitude),
  };
}

type Named = MapPoint & { id: string; name: string };

/**
 * What stands within 150 metres of the marker, the nearest of each: a spot the account has
 * already, and a break of the catalogue the draft is not made from. Nothing before the marker
 * was put.
 */
export function nearOf<Spot extends Named, Break extends Named>(
  draft: SpotDraft,
  spots: readonly Spot[] | undefined,
  breaks: readonly Break[] | undefined,
): { spot: Spot | undefined; break: Break | undefined } {
  if (!draft.placed) return { spot: undefined, break: undefined };
  return {
    spot: nearestWithin(spots, draft.point, SAME_PLACE_METERS),
    break: draft.breakId ? undefined : nearestWithin(breaks, draft.point, SAME_PLACE_METERS),
  };
}

export type Heading = "north" | "south" | "east" | "west";

/** How much of the view one step moves the marker, as an arrow key moves the web's. */
const STEP = 1 / 8;

/**
 * Where the marker goes a step towards `heading`: an eighth of what the map shows, so that the
 * closer the map, the finer the step.
 */
export function nudged(point: MapPoint, bounds: Bounds, heading: Heading): MapPoint {
  const [west, south, east, north] = bounds;
  const wide = west > east ? east - west + 360 : east - west;
  const tall = north - south;
  const across = heading === "east" ? 1 : heading === "west" ? -1 : 0;
  const up = heading === "north" ? 1 : heading === "south" ? -1 : 0;
  return {
    // The map shows no further than about 85 degrees from the equator.
    latitude: Math.max(-85, Math.min(85, point.latitude + up * tall * STEP)),
    longitude: wrapLongitude(point.longitude + across * wide * STEP),
  };
}

/** The marker's point as the web writes it under its map. */
export function writePoint(point: MapPoint) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}
