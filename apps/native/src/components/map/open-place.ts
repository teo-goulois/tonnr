import { router } from "expo-router";

import type { Route } from "@/lib/links";

import { givesToSheet } from "./place-route";
import { isSheetOpen } from "./sheet-state";

// A place's sheet is one, as the web's panel is one (decision 040): a place opened while a sheet is
// open, by a link, a notification, a search or the station a sheet names, is given to that sheet,
// at the height it stands, and whatever stood over it, the search for one, is closed. Another
// address opens as it would.

/**
 * Whether the address was given to the sheet of a place that is open: the sheet takes it, and
 * what stands over it is closed.
 */
export function giveToSheet(route: Route) {
  if (!givesToSheet(route, isSheetOpen())) return false;
  router.dismissTo(route);
  return true;
}

/** Opens an address of the app over what is in view, or gives a place's to its sheet. */
export function openRoute(route: Route) {
  if (!giveToSheet(route)) router.push(route);
}
