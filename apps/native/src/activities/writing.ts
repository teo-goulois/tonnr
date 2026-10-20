import { SHORE_WINDS, type ShoreWind } from "@repo/conditions/shore-wind";

import { compassPoint, formatClock } from "@/lib/format";
import { formatHeight, formatWind } from "@/lib/units";
import { m } from "@/paraglide/messages";

import type { SessionWriting } from "./session-shown";

// How the activities are written, in the account's units and the app's language as they are in
// force when the app writes them: a Live Activity reads no message and no setting of the app.

const SHORE_WORDS: Record<ShoreWind, () => string> = {
  offshore: m.wind_offshore,
  cross_offshore: m.wind_cross_offshore,
  cross_shore: m.wind_cross_shore,
  cross_onshore: m.wind_cross_onshore,
  onshore: m.wind_onshore,
};

const isShoreWind = (word: string): word is ShoreWind =>
  (SHORE_WINDS as readonly string[]).includes(word);

/** How a session in progress is written. */
export function sessionWriting(): SessionWriting {
  return {
    clock: (moment) => formatClock(moment),
    height: (meters) => formatHeight(meters),
    wind: (knots) => formatWind(knots),
    compass: (degrees) => compassPoint(degrees),
    shore: (atShore) => (isShoreWind(atShore) ? SHORE_WORDS[atShore]() : null),
    m: {
      since: m.native_live_since,
      high: m.native_live_high,
      low: m.native_live_low,
      wind: m.native_live_wind,
      end: m.native_live_end,
    },
  };
}
