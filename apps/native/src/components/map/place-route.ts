import { type PhoneTab, tabOf } from "@repo/client/phone-nav";

import type { Route } from "@/lib/links";

import type { PlaceKind } from "./features";

// Where a place's sheet lives, `/place/<break|station|spot>/<id>` (decision 069), as the map opens
// it and reads which one is open. A module that imports nothing of React Native, so that a test
// reads it.

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

/** The route of each tab of decision 040 in the tabs' navigator, `app/(tabs)/`. */
export const TAB_ROUTES: Record<PhoneTab, string> = {
  map: "index",
  saved: "saved",
  alerts: "alerts",
  account: "account",
};

/**
 * The tab a screen shows under it, by its address, as the web's address says it (`tabOf`): the
 * map under a place's sheet, wherever the place was opened from. None for any other screen, which
 * leaves the tab that is in view.
 */
export function tabUnder(pathname: string): PhoneTab | undefined {
  const place = placeOf(pathname);
  return place ? tabOf({ [place.kind]: place.id }) : undefined;
}
