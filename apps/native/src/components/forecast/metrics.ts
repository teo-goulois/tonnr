import type { Palette } from "@repo/client/palette";
import {
  CLOUD_COVER_SCALE,
  PRECIPITATION_SCALE,
  type ScaleStop,
  WAVE_ENERGY_SCALE,
  WAVE_HEIGHT_SCALE,
  WAVE_PERIOD_SCALE,
  WINDGURU_INK,
  WINDGURU_SCALES,
  WIND_SPEED_SCALE,
  scaleInk,
  windguruWindInk,
} from "@repo/client/sea-scales";
import type { MetricKey, NumericKey, WeatherKey } from "@repo/client/viewer/samples";
import { isNight } from "@repo/conditions/sun";

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

// The sea at one moment, as a buoy measured it or as the model computed it, and what is read of
// it, live in packages/client, which the web app reads too. Here is how the app writes and
// colors it, as `apps/web/src/components/viewer/details/metrics.ts` does for the web.
export * from "@repo/client/viewer/samples";

export type Metric = {
  key: NumericKey;
  label: string;
  unit: string;
  digits: number;
  scale: ScaleStop[];
  // A scale of one hue: a cell takes it as a tint, stronger with the value.
  tinted: boolean;
  // The bearing that goes with the value: where the waves, the swell or the wind come from.
  direction?: "waveDirection" | "swellDirection" | "windDirection";
  // The lowest value a chart starts from. The others start from zero.
  floor?: number;
  // A value written without a color: the air's temperature has no scale of the app's.
  plain?: boolean;
  // A value of zero leaves its cell empty: an hour without rain says so by saying nothing.
  hideZero?: boolean;
  // A value as it is written, when that is not the unit it is kept and colored in: the wind is
  // kept in knots and written in the reader's unit. `kept` is the way back.
  shown?: (value: number) => number;
  kept?: (shown: number) => number;
  // The ink a cell is written in, when its palette says. Otherwise the one that reads best.
  ink?: (value: number) => string;
  // Whether a value is written in bold, when its palette says: Windguru marks a big sea so.
  strong?: (value: number) => boolean;
};

export function metrics(): Record<MetricKey, Metric> {
  return {
    height: {
      key: "height",
      label: m.details_waves(),
      unit: heightUnit(),
      digits: 1,
      scale: WAVE_HEIGHT_SCALE,
      tinted: false,
      direction: "waveDirection",
      shown: (value) => heightIn(value),
      kept: (shown) => metersFrom(shown),
    },
    period: {
      key: "period",
      label: m.details_period(),
      unit: m.unit_s(),
      digits: 0,
      scale: WAVE_PERIOD_SCALE,
      tinted: true,
      floor: 3,
    },
    energy: {
      key: "energy",
      label: m.details_energy(),
      unit: "kJ",
      digits: 0,
      scale: WAVE_ENERGY_SCALE,
      tinted: true,
    },
    wind: {
      key: "wind",
      label: m.details_wind(),
      unit: windUnit(),
      digits: 0,
      scale: WIND_SPEED_SCALE,
      tinted: false,
      direction: "windDirection",
      shown: (value) => windIn(value),
      kept: (shown) => knotsFrom(shown),
    },
  };
}

export const METRIC_KEYS: MetricKey[] = ["height", "period", "energy", "wind"];

/** The weather beside the sea, for the rows under the wind's. */
export function weatherMetrics(): Record<WeatherKey, Metric> {
  return {
    cloud: {
      key: "cloud",
      label: m.details_clouds(),
      unit: "%",
      digits: 0,
      scale: CLOUD_COVER_SCALE,
      tinted: true,
      hideZero: true,
    },
    rain: {
      key: "rain",
      label: m.details_rain(),
      unit: rainUnit(),
      digits: rainDigits(),
      shown: (value) => rainIn(value),
      scale: PRECIPITATION_SCALE,
      tinted: true,
      hideZero: true,
    },
    air: {
      key: "air",
      label: m.details_air(),
      unit: temperatureUnit(),
      digits: 0,
      shown: (value) => temperatureIn(value),
      scale: CLOUD_COVER_SCALE,
      tinted: true,
      plain: true,
    },
  };
}

/**
 * The swell apart from the wind sea, as the week's table writes it under the waves: a height on
 * the waves' own scale, with the bearing the swell comes from.
 */
export function swellMetric(): Metric {
  return {
    key: "swell",
    label: m.details_swell(),
    unit: heightUnit(),
    digits: 1,
    scale: WAVE_HEIGHT_SCALE,
    tinted: false,
    direction: "swellDirection",
    shown: (value) => heightIn(value),
    kept: (shown) => metersFrom(shown),
  };
}

/** A value in the unit it is written in, to the digits it is written with. */
function written(metric: Metric, value: number) {
  return Number((metric.shown ? metric.shown(value) : value).toFixed(metric.digits));
}

export function formatMetric(metric: Metric, value: number, withUnit = true) {
  const figure = formatNumber(metric.shown ? metric.shown(value) : value, metric.digits);
  return withUnit ? `${figure} ${metric.unit}` : figure;
}

/**
 * The difference between two values written with its sign, such as "+0.6 m": the difference of
 * the two figures as they are written, so that the three agree.
 */
export function formatGap(metric: Metric, one: number, other: number, withUnit = true) {
  const gap = Number((written(metric, one) - written(metric, other)).toFixed(metric.digits));
  const sign = gap > 0 ? "+" : gap < 0 ? "−" : "±";
  const figure = formatNumber(Math.abs(gap), metric.digits);
  return `${sign}${withUnit ? `${figure} ${metric.unit}` : figure}`;
}

// Above what Windguru writes a figure in bold: metres, seconds, knots and kilojoules.
const WINDGURU_BOLD = { height: 3, period: 10, wind: 11, energy: 10000 };

/**
 * A metric as the week's table colors it in a palette. Windguru's fills every cell, the air's
 * too, and writes on it in its own ink. The swell takes the waves' scale, the gusts the wind's.
 */
export function inPalette(metric: Metric, palette: Palette): Metric {
  if (palette === "tonnr") return metric;
  const key = metric.key === "swell" ? "height" : metric.key === "gust" ? "wind" : metric.key;
  const ink = key === "wind" ? windguruWindInk : () => WINDGURU_INK;
  const over = WINDGURU_BOLD[key as keyof typeof WINDGURU_BOLD];
  const strong = over === undefined ? undefined : (value: number) => value > over;
  return {
    ...metric,
    scale: WINDGURU_SCALES[key as keyof typeof WINDGURU_SCALES],
    tinted: false,
    plain: false,
    ink,
    strong,
  };
}

// A color of a scale as both React Native and Skia read it, which the charts write too.
export { colorAt };

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
  const first = metric.scale[0]!.value;
  const last = metric.scale.at(-1)!.value;
  const position = Math.min(1, Math.max(0, (value - first) / (last - first)));
  // A square root: most of the sea lives at the low end of an energy scale.
  const strength = Math.round(14 + 72 * Math.sqrt(position));
  return { background: colorAt(metric.scale, value, strength / 100) };
}

export function metricColor(metric: Metric, value: number) {
  return colorAt(metric.scale, value);
}

// The sun's own computation is shared with the alerts, which keep to daylight by it.
export { isNight };

/** The nights between two moments, each from dusk to dawn. */
export function nightsBetween(start: number, end: number, latitude: number, longitude: number) {
  const step = 10 * 60 * 1000;
  const nights: { from: number; to: number }[] = [];
  let from: number | undefined;
  for (let time = start; time <= end; time += step) {
    const night = isNight(time, latitude, longitude);
    if (night && from === undefined) from = time;
    if (!night && from !== undefined) {
      nights.push({ from, to: time });
      from = undefined;
    }
  }
  if (from !== undefined) nights.push({ from, to: end });
  return nights;
}
