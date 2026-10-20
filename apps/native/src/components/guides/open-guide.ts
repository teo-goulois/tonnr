import type { Route } from "@/lib/links";

import { placeHref } from "@/components/map/place-route";
import { openPlaceOnMap } from "@/components/sessions/session-place";

/**
 * Opens the guide of a surf break on the map, from a tab, as the web's `onOpenBreak` opens it
 * beside the map: the map comes back, and the break's sheet opens on its Guide tab over it. A
 * phone shows one thing at a time (decision 040).
 */
export function openBreakGuide(breakId: string) {
  openPlaceOnMap(`${placeHref("break", breakId)}?tab=guide` as Route);
}
