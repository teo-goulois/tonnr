import type { ShoreWind } from "@repo/conditions/shore-wind";

import { compassName, formatSeconds } from "@/lib/format";
import { formatHeight, formatWind } from "@/lib/units";
import { m } from "@/paraglide/messages";

import type { PlaceKind, SeaFigures, SeaNow } from "./sea-now";

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

/**
 * The sea now in words, for a screen reader: the height, the period, where the waves come from,
 * then the wind and how it meets the shore. Empty when nothing says the sea.
 */
export function seaWords(figures: SeaFigures | null) {
  if (!figures) return "";
  const words: string[] = [];
  if (figures.heightMeters !== null) words.push(formatHeight(figures.heightMeters));
  if (figures.periodSeconds !== null) words.push(formatSeconds(figures.periodSeconds));
  if (figures.wavesFromDegrees !== null) {
    words.push(m.map_from({ direction: compassName(figures.wavesFromDegrees) }));
  }
  if (figures.windKnots !== null)
    words.push(m.map_wind_speed({ speed: formatWind(figures.windKnots) }));
  if (figures.atShore !== null) words.push(shoreWord(figures.atShore));
  return words.length > 0 ? words.join(", ") : m.station_no_recent_reading();
}
