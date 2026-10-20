import type { AlertMessages } from "./alerts/alert-words";
import type { DensityMessages } from "./density";
import { type FormatMessages, formatting } from "./format";
import { DEFAULT_UNITS, type UnitMessages, type Units, unitWriting } from "./units";
import { type MetricMessages, metricWriting } from "./viewer/metrics";

/**
 * The messages the tests write with, in English as `apps/web/messages/en.json` says them: each
 * app gives its own, which Paraglide compiles from that file.
 */
export const ENGLISH = {
  unit_kn: () => "kn",
  unit_m: () => "m",
  unit_ft: () => "ft",
  unit_mi: () => "mi",
  unit_in: () => "in",
  unit_seconds: ({ value }) => `${value} s`,
  unit_minutes: ({ value }) => `${value} min`,
  unit_hours: ({ value }) => `${value} h`,
  unit_hours_minutes: ({ hours, minutes }) => `${hours} h ${minutes}`,
  compass_points: () => "N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSW,SW,WSW,W,WNW,NW,NNW",
  compass_names: () =>
    "north,north-northeast,northeast,east-northeast,east,east-southeast,southeast,south-southeast,south,south-southwest,southwest,west-southwest,west,west-northwest,northwest,north-northwest",
  density_essentials: () => "Simple",
  density_details: () => "Classic",
  density_everything: () => "Complete",
  alert_label_wave_height: () => "The height of the waves",
  alert_label_wave_period: () => "The period of the waves",
  alert_label_wave_from: () => "Where the waves come from",
  alert_label_swell_height: () => "The height of the swell alone",
  alert_label_swell_from: () => "Where the swell alone comes from",
  alert_label_wind_speed: () => "The wind's speed",
  alert_label_wind_from: () => "Where the wind blows from",
  alert_label_tide_height: () => "The tide's height",
  alert_label_tide_trend: () => "The way the tide goes",
  alert_label_tide: () => "The tide",
  alert_label_coefficient: () => "Coefficient",
  alert_range_min: ({ value }) => `${value} or more`,
  alert_range_max: ({ value }) => `${value} or less`,
  alert_tide_low: () => "low",
  alert_tide_mid_low_rising: () => "early rising",
  alert_tide_mid_rising: () => "mid tide rising",
  alert_tide_mid_high_rising: () => "late rising",
  alert_tide_high: () => "high",
  alert_tide_mid_high_falling: () => "early falling",
  alert_tide_mid_falling: () => "mid tide falling",
  alert_tide_mid_low_falling: () => "late falling",
  alert_tide_run: ({ from, to }) => `from ${from} to ${to}`,
  alert_tide_coefficient: ({ bands }) => `coef ${bands}`,
  alert_tide_at: ({ range }) => range,
  alert_trend_rising: () => "rising",
  alert_trend_falling: () => "falling",
  alert_or: () => " or ",
  alert_or_list: ({ list, last }) => `${list} or ${last}`,
  details_waves: () => "Waves",
  details_swell: () => "Swell",
  details_period: () => "Period",
  details_energy: () => "Energy",
  details_wind: () => "Wind",
  details_clouds: () => "Clouds",
  details_rain: () => "Rain",
  details_air: () => "Air",
  unit_s: () => "s",
} satisfies UnitMessages & FormatMessages & DensityMessages & AlertMessages & MetricMessages;

/**
 * A reader of English, in the units the app starts with until a test chooses others, with what
 * writes for it as an app builds it.
 */
export function testReader(start: Units = DEFAULT_UNITS) {
  let units = start;
  const read = () => units;
  const format = formatting({ locale: () => "en", m: ENGLISH });
  const writing = unitWriting({ units: read, formatNumber: format.formatNumber, m: ENGLISH });
  return {
    units: read,
    setUnits: (next: Units) => {
      units = next;
    },
    format,
    writing,
    metrics: metricWriting({ writing, formatNumber: format.formatNumber, m: ENGLISH }),
  };
}
