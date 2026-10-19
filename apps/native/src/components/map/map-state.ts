import { type Bounds, DEFAULT_VIEW, type MapPoint, type MapView, readView, VIEW_KEY } from "./view";

// What the screens over the map read of it and ask of it: where it stands, which a search ranks
// what is near by and a new spot starts from, and where to go, which the search asks for a place
// that has no sheet of its own (decision 040). The map tab is alive under every sheet, so it
// hears a request as it is made. A module that imports nothing of React Native, so that a test
// reads it.

/** Where the map stands now, and the part of the world it shows. */
export type MapState = MapView & { bounds: Bounds | null };

/** Somewhere the map is asked to go, and how close. */
export type MapRequest = { point: MapPoint; zoom: number };

let state: MapState | null = null;
const listeners = new Set<(request: MapRequest) => void>();

function stored() {
  try {
    return localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}

/** Says where the map stands, once it has moved. */
export function rememberMapState(next: MapState) {
  state = next;
}

/** Where the map stands, or where it will open when it has not drawn yet. */
export function currentMapState(): MapState {
  if (state) return state;
  const view = typeof localStorage === "undefined" ? DEFAULT_VIEW : readView(stored());
  return { ...view, bounds: null };
}

/** Asks the map to go somewhere. */
export function moveMap(request: MapRequest) {
  for (const listener of listeners) listener(request);
}

/** Hears what the map is asked: the map itself. */
export function onMapRequest(listener: (request: MapRequest) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
