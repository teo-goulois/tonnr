import { SHORE_WINDS, type ShoreWind } from "@repo/conditions/shore-wind";

import { shoreWord } from "@/components/saved/place-words";
import { compassName, compassPoint, formatClock, formatNumber, toKnots } from "@/lib/format";
import { formatHeight, formatWind, heightIn, heightUnit, windIn, windUnit } from "@/lib/units";
import { m } from "@/paraglide/messages";

import type { SessionWriting } from "./session-shown";
import type { keptForWindow } from "./window-reading";

// How the activities are written, in the account's units and the app's language as they are in
// force when the app writes them: a Live Activity reads no message and no setting of the app.

const isShoreWind = (word: string): word is ShoreWind =>
  (SHORE_WINDS as readonly string[]).includes(word);

/** How a session in progress is written. */
export function sessionWriting(): SessionWriting {
  return {
    clock: (moment) => formatClock(moment),
    height: (meters) => formatHeight(meters),
    wind: (knots) => formatWind(knots),
    compass: (degrees) => compassPoint(degrees),
    compassName: (degrees) => compassName(degrees),
    shore: (atShore) => (isShoreWind(atShore) ? shoreWord(atShore) : null),
    m: {
      title: m.native_live_title,
      since: m.native_live_since,
      high: m.native_live_high,
      low: m.native_live_low,
      wind: m.native_live_wind,
      from: m.alert_from,
      end: m.native_live_end,
    },
  };
}

/** How the activity of a window is written, beside the names the app keeps. */
export function windowWriting(): Parameters<typeof keptForWindow>[1] {
  return {
    windPerMs: windIn(toKnots(1)),
    wind: windUnit(),
    heightPerM: heightIn(1),
    height: heightUnit(),
    period: m.unit_s(),
    // What the language writes between a figure's units and its tenths: "1.5" or "1,5".
    decimal: formatNumber(1.5, 1).replace(/\d/g, "") || ".",
    words: {
      high: m.page_tide_high(),
      low: m.page_tide_low(),
      buoy: m.native_window_buoy(),
      gusts: m.session_gusts({ speed: "{speed}" }),
      until: m.native_window_until(),
      moreOne: m.native_window_more_one(),
      more: m.native_window_more({ count: "{count}" }),
      notToday: m.native_push_not_today(),
      logSession: m.native_push_log_session(),
      compass: m.compass_points(),
      names: m.compass_names(),
      from: m.alert_from(),
      shore: Object.fromEntries(SHORE_WINDS.map((word) => [word, shoreWord(word)])),
      progress: m.native_window_progress(),
      label: m.native_channel_begins(),
    },
  };
}
