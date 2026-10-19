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
import { m } from "@/paraglide/messages.js";

// What an alert's editor says of the conditions and does with them lives in packages/client,
// which the app for phones reads too. Here it is written in this app's messages, units and
// figures.
export * from "@repo/client/alerts/alert-words";

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
