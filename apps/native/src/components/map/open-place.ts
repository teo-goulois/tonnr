import { router } from "expo-router";

import type { Route } from "@/lib/links";

import { givesToSheet } from "./place-route";
import { isSheetOpen } from "./sheet-state";

// A place's sheet is one, as the web's panel is one (decision 040): a place opened while a sheet is
// open, by a link, a notification, a search or the log, is given to that sheet, at the height it
// stands, and whatever stood over it, the search for one, is closed. Another address opens as it
// would. The station nearest a place opens over the place's sheet instead (`overHref`).

/**
 * Whether the address was given to the sheet of a place that is open: the sheet takes it, and
 * what stands over it is closed.
 */
export function giveToSheet(route: Route) {
  if (!givesToSheet(route, isSheetOpen())) return false;
  // What stands over the place's sheet is closed first, the sheet of the station nearest it and
  // whatever stands over that, as the web closes its second drawer: the router gives the address
  // to the screen nearest the front that bears a place's name, which a station's sheet bears too,
  // and would change the heights of a sheet that is shown.
  const above = placeSheet?.above() ?? 0;
  if (above > 0) router.dismiss(above);
  router.dismissTo(route);
  return true;
}

// The place's sheet an address is given to, with how many screens stand over it, read from its
// navigator's state: the one shown last that stands over no other place's sheet.
let placeSheet: { route: string; above: () => number } | undefined;

/** Names the sheet that takes a place given to it. Answers what forgets it. */
export function holdPlaceSheet(route: string, above: () => number) {
  placeSheet = { route, above };
  return () => {
    if (placeSheet?.route === route) placeSheet = undefined;
  };
}

/** Opens an address of the app over what is in view, or gives a place's to its sheet. */
export function openRoute(route: Route) {
  if (!giveToSheet(route)) router.push(route);
}
