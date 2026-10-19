import { alertWords } from "@repo/client/alerts/alert-words";

import { compassPoint, formatNumber } from "@/lib/format";
import {
  getUnits,
  heightIn,
  heightUnit,
  knotsFrom,
  metersFrom,
  windIn,
  windUnit,
} from "@/lib/units";
import { m } from "@/paraglide/messages";

// What an alert's editor says of the conditions and does with them lives in packages/client,
// which the web app reads too: here it is written in the app's messages, units and figures, as
// `apps/web/src/components/alerts/alert-words.ts` writes it on the web. Decision 069.
export * from "@repo/client/alerts/alert-words";
export * from "@repo/client/alerts/trial";

export const {
  RANGES,
  CRITERION_LABELS,
  SEGMENT_WORDS,
  orWords,
  cycleWords,
  coefficientWords,
  tideWords,
  rangeWords,
  arcWords,
  sliderEnds,
  thumbsOf,
  rangeAfter,
  loosened,
} = alertWords({
  units: getUnits,
  writing: { heightIn, metersFrom, heightUnit, windIn, knotsFrom, windUnit },
  format: { formatNumber, compassPoint },
  m: {
    alert_label_wave_height: m.alert_label_wave_height,
    alert_label_wave_period: m.alert_label_wave_period,
    alert_label_wave_from: m.alert_label_wave_from,
    alert_label_swell_height: m.alert_label_swell_height,
    alert_label_swell_from: m.alert_label_swell_from,
    alert_label_wind_speed: m.alert_label_wind_speed,
    alert_label_wind_from: m.alert_label_wind_from,
    alert_label_tide_height: m.alert_label_tide_height,
    alert_label_tide_trend: m.alert_label_tide_trend,
    alert_label_tide: m.alert_label_tide,
    alert_label_coefficient: m.alert_label_coefficient,
    alert_range_min: m.alert_range_min,
    alert_range_max: m.alert_range_max,
    alert_tide_low: m.alert_tide_low,
    alert_tide_mid_low_rising: m.alert_tide_mid_low_rising,
    alert_tide_mid_rising: m.alert_tide_mid_rising,
    alert_tide_mid_high_rising: m.alert_tide_mid_high_rising,
    alert_tide_high: m.alert_tide_high,
    alert_tide_mid_high_falling: m.alert_tide_mid_high_falling,
    alert_tide_mid_falling: m.alert_tide_mid_falling,
    alert_tide_mid_low_falling: m.alert_tide_mid_low_falling,
    alert_tide_run: m.alert_tide_run,
    alert_tide_coefficient: m.alert_tide_coefficient,
    alert_tide_at: m.alert_tide_at,
    alert_trend_rising: m.alert_trend_rising,
    alert_trend_falling: m.alert_trend_falling,
    alert_or: m.alert_or,
    alert_or_list: m.alert_or_list,
    unit_seconds: m.unit_seconds,
  },
});

// The arrows of the eight points, each pointing the way it goes: north first.
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"] as const;

/**
 * A direction in a line of text, as `Bearing` draws it on the web: an arrow that points the way
 * the wind or the swell goes, then the point it comes from. Never a name alone.
 */
export function bearingWords(fromDegrees: number) {
  const goes = (((fromDegrees + 180) % 360) + 360) % 360;
  return `${ARROWS[Math.round(goes / 45) % 8]} ${compassPoint(fromDegrees)}`;
}

/** A length in minutes, by the quarter hour: "2 h 30". */
export function durationWords(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? m.alert_hours({ count: hours })
    : m.alert_hours_minutes({ hours, minutes: String(rest).padStart(2, "0") });
}
