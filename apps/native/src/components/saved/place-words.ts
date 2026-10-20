import type { ShoreWind } from "@repo/conditions/shore-wind";

import { m } from "@/paraglide/messages";

import type { PlaceKind, SeaNow } from "./sea-now";

// The words a place is said in, wherever the app writes it: on a screen, and in what the widgets
// are given to show (decision 074). A module that reads no React and no phone, so that a test
// reads it.

const SHORE_WORDS: Record<ShoreWind, () => string> = {
  offshore: m.wind_offshore,
  cross_offshore: m.wind_cross_offshore,
  cross_shore: m.wind_cross_shore,
  cross_onshore: m.wind_cross_onshore,
  onshore: m.wind_onshore,
};

/** How the wind meets the shore, in words: "Offshore". */
export const shoreWord = (shore: ShoreWind) => SHORE_WORDS[shore]();

/** What a place is, in words: a surf break, a buoy, a wind station, a spot. */
export function kindWord(place: PlaceKind, sea?: SeaNow) {
  if (place === "break") return m.break_title();
  if (place === "spot") return m.spot_title();
  return sea?.place.kind === "station" && !sea.place.measures.includes("waves")
    ? m.native_kind_wind_station()
    : m.native_kind_buoy();
}
