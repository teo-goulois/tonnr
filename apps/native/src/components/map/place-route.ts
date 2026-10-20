import type { Route } from "@/lib/links";

import type { PlaceKind } from "./features";

// Where a place's sheet lives, `/place/<break|station|spot>/<id>` (decision 069), as the map opens
// it and reads which one is open. A module that imports nothing of React Native, so that a test
// reads it.

/**
 * How high the sheet of a place opens over the map, as a share of the screen: the low height of
 * its form sheet in src/app/_layout.tsx, decision 040's, under which a marker pressed would hide.
 */
export const LOW_SHEET = 0.45;

const KINDS: readonly string[] = ["station", "break", "spot"] satisfies PlaceKind[];

/** The address of a place's sheet. */
export function placeHref(kind: PlaceKind, id: string) {
  return `/place/${kind}/${encodeURIComponent(id)}` as Route;
}

/** The place whose sheet an address opens, or none. */
export function placeOf(pathname: string): { kind: PlaceKind; id: string } | undefined {
  const [, root, kind, id, ...rest] = pathname.split("/");
  if (root !== "place" || !kind || !KINDS.includes(kind) || !id || rest.length > 0) {
    return undefined;
  }
  try {
    return { kind: kind as PlaceKind, id: decodeURIComponent(id) };
  } catch {
    return undefined;
  }
}
