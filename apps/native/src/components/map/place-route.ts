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

/**
 * The address of a place's sheet as a press on its marker opens it: low, with the map in view to
 * press another. What is chosen anywhere else, in a list, a search, a notification or a link, is
 * there to be read, and its sheet opens raised, as the web's drawer opens it.
 */
export function pressedHref(kind: PlaceKind, id: string) {
  return `${placeHref(kind, id)}?from=map` as Route;
}

/**
 * The address of the sheet of a spot just added, which offers its owner to describe it and an
 * alert there, as the web's panel of a new spot does.
 */
export function newSpotHref(id: string) {
  return `${placeHref("spot", id)}?new=1` as Route;
}

/** Whether the sheet of a place opens raised, by the parameters of its address. */
export function opensRaised(params: object | undefined) {
  return (params as { from?: unknown } | undefined)?.from !== "map";
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

/**
 * Whether an address is given to the sheet of a place that is open, in place of a new sheet over
 * it: the address of a place, while one is open, as the web has one panel, which shows what was
 * chosen last.
 */
export function givesToSheet(route: string, sheetOpen: boolean) {
  return sheetOpen && placeOf(route.split("?")[0] ?? "") !== undefined;
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
