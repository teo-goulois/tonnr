import {
  describeStation as describeMapStation,
  describeWind as describeMapWind,
  type MapStation,
  type MapWind,
  type MarkerWords,
} from "@repo/client/map/markers";
import type { Station } from "@repo/client/viewer/types";

import { compassPoint, formatAgo, formatSeconds } from "@/lib/format";
import { formatHeight, formatWind } from "@/lib/units";
import { m } from "@/paraglide/messages";

// What the map draws of a station, as the web's route describes it, in the reader's units and
// language: the rules are packages/client's, given the app's words.

const WORDS: MarkerWords = {
  formatHeight,
  formatSeconds,
  formatWind,
  compassPoint,
  formatAgo,
  map_from: m.map_from,
  map_wind_speed: m.map_wind_speed,
};

/** A buoy, with its last reading when it is recent enough to say the sea now. */
export function describeStation(
  station: Station,
  now: number,
  savedIds: ReadonlySet<string>,
): MapStation {
  return describeMapStation(station, now, savedIds, WORDS);
}

/** A station's wind, or none when it measured none lately. */
export function describeWind(station: Station, now: number): MapWind | null {
  return describeMapWind(station, now, WORDS);
}
