import { metricWriting, type Metric, tintOf } from "@repo/client/viewer/metrics";

import { formatNumber } from "@/lib/format";
import { scaleColor, scaleInk } from "@/lib/sea-scales";
import {
  heightIn,
  heightUnit,
  knotsFrom,
  metersFrom,
  rainDigits,
  rainIn,
  rainUnit,
  temperatureIn,
  temperatureUnit,
  windIn,
  windUnit,
} from "@/lib/units";
import { m } from "@/paraglide/messages.js";

// The sea at one moment, as a buoy measured it or as the model computed it, what is read of it,
// and how each figure is named, written and colored, live in packages/client, which the app for
// phones reads too. Here they are given the web's messages and units, and a cell its colors.
export * from "@repo/client/viewer/samples";
export {
  METRIC_KEYS,
  type Metric,
  inPalette,
  isNight,
  nightsBetween,
} from "@repo/client/viewer/metrics";

export const { metrics, weatherMetrics, swellMetric, formatMetric, formatGap } = metricWriting({
  writing: {
    heightIn,
    metersFrom,
    heightUnit,
    windIn,
    knotsFrom,
    windUnit,
    rainIn,
    rainUnit,
    rainDigits,
    temperatureIn,
    temperatureUnit,
  },
  formatNumber,
  m: {
    details_waves: m.details_waves,
    details_swell: m.details_swell,
    details_period: m.details_period,
    details_energy: m.details_energy,
    details_wind: m.details_wind,
    details_clouds: m.details_clouds,
    details_rain: m.details_rain,
    details_air: m.details_air,
    unit_s: m.unit_s,
  },
});

/** The color of a value, and the ink to write on it. A tinted scale lets the theme show through. */
export function cellColors(metric: Metric, value: number) {
  const color = scaleColor(metric.scale, value);
  if (!metric.tinted) {
    return { background: color, color: metric.ink?.(value) ?? scaleInk(metric.scale, value) };
  }
  return { background: `color-mix(in oklab, ${color} ${tintOf(metric, value)}%, transparent)` };
}

export function metricColor(metric: Metric, value: number) {
  return scaleColor(metric.scale, value);
}
