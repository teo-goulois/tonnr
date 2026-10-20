import { scaleInk } from "@repo/client/sea-scales";
import { type Metric, metricWriting, tintOf } from "@repo/client/viewer/metrics";

import { colorAt } from "@/components/charts/chart-math";
import { formatNumber } from "@/lib/format";
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
import { m } from "@/paraglide/messages";

// The sea at one moment, as a buoy measured it or as the model computed it, what is read of it,
// and how each figure is named, written and colored, live in packages/client, which the web app
// reads too. Here they are given the app's messages and units, and a cell the colors React
// Native and Skia read, as `apps/web/src/components/viewer/details/metrics.ts` does for the web.
export * from "@repo/client/viewer/samples";
export {
  METRIC_KEYS,
  type Metric,
  inPalette,
  isNight,
  nightsBetween,
} from "@repo/client/viewer/metrics";
// A color of a scale as both React Native and Skia read it, which the charts write too.
export { colorAt };

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

/**
 * The ground of a value's cell, and the ink to write on it. A tinted scale lets the theme show
 * through: the web mixes its color with transparent, which a color with that alpha draws.
 */
export function cellColors(metric: Metric, value: number): { background: string; color?: string } {
  if (!metric.tinted) {
    return {
      background: colorAt(metric.scale, value),
      color: metric.ink?.(value) ?? scaleInk(metric.scale, value),
    };
  }
  return { background: colorAt(metric.scale, value, tintOf(metric, value) / 100) };
}

export function metricColor(metric: Metric, value: number) {
  return colorAt(metric.scale, value);
}
