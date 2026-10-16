import { isNight } from "@repo/conditions/sun";

import { formatNumber, toKnots } from "@/lib/format";
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
  scaleColor,
  scaleInk,
  windguruWindInk,
} from "@/lib/sea-scales";
import type { Palette } from "@/lib/palette";
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

import { type Forecast, type Reading, periodOf } from "../types";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export type MetricKey = "height" | "period" | "energy" | "wind";
export type WeatherKey = "cloud" | "rain" | "air";

/** The sea at one moment, as a buoy measured it or as the model computed it. */
export type Sample = {
  time: number;
  height: number | null;
  period: number | null;
  energy: number | null;
  // In knots.
  wind: number | null;
  gust: number | null;
  windDirection: number | null;
  waveDirection: number | null;
  // The first swell apart from the wind sea, and where it comes from. The model's alone: a buoy
  // reads the whole sea.
  swell: number | null;
  swellDirection: number | null;
  // The sky under cloud in percent, the rain of the hour in millimetres, the air in °C. The
  // model's alone: a buoy reads none of them.
  cloud: number | null;
  rain: number | null;
  air: number | null;
};

/**
 * The energy of one wave along a metre of its crest, in kilojoules, as surf forecasts print it:
 * a regular wave of the sea's height and of the period of its peak, ρg²H²T²/16π. A 1 m sea of
 * 10 s gives 196 kJ, a 2 m sea of 14 s gives 1,537 kJ. It ranks seas more than it measures them:
 * a real sea of that significant height carries a quarter of it, and a mean period reads lower
 * than a peak one. Decision 036.
 */
export function waveEnergy(heightMeters: number | null, periodSeconds: number | null) {
  if (heightMeters === null || periodSeconds === null) return null;
  return 1.9612 * heightMeters ** 2 * periodSeconds ** 2;
}

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
  // The lowest value a lane starts from. The others start from zero.
  floor?: number;
  // A value written without a color: the air's temperature has no scale here.
  plain?: boolean;
  // A value of zero leaves its cell empty: an hour without rain says so by saying nothing.
  hideZero?: boolean;
  // A value as it is written, when that is not the unit it is kept and colored in: the wind is
  // kept in knots and written in the reader's unit. `kept` is the way back.
  shown?: (value: number) => number;
  kept?: (shown: number) => number;
  // The ink a cell is written in, when its palette says. Otherwise the one that reads best.
  ink?: (value: number) => string;
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
  // A period read on a buoy has a decimal worth showing only when it stands alone.
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

export function measuredSamples(readings: Reading[]): Sample[] {
  return readings
    .map((reading) => {
      const height = reading.significantHeightMeters;
      const period = periodOf(reading);
      return {
        time: reading.observedAt.getTime(),
        height,
        period,
        energy: waveEnergy(height, period),
        wind: toKnots(reading.windSpeedMetersPerSecond),
        gust: toKnots(reading.windGustMetersPerSecond),
        windDirection: reading.windDirectionDegrees,
        waveDirection: reading.peakDirectionDegrees,
        swell: null,
        swellDirection: null,
        cloud: null,
        rain: null,
        air: null,
      };
    })
    .sort((a, b) => a.time - b.time);
}

/** Which period a buoy gives, as far as the model can answer in kind. */
export type PeriodKind = "peak" | "mean";

/** The kind of the period `periodOf` reads on a buoy. A significant period counts as a mean one. */
export function periodKindOf(reading: Reading | null | undefined): PeriodKind {
  return reading && reading.peakPeriodSeconds === null && periodOf(reading) !== null
    ? "mean"
    : "peak";
}

/**
 * The model's hours as samples. Its period is the one of the peak, which a surfer reads, or the
 * mean one beside a buoy that gives no peak: a peak period beside a mean one would read as a gap
 * of a second or more that is not in the sea. A model without a peak period gives its mean one.
 */
export function modelSamples(hours: Forecast["hours"], kind: PeriodKind = "peak"): Sample[] {
  return hours.map((hour) => {
    const period =
      kind === "peak"
        ? (hour.wavePeakPeriodSeconds ?? hour.wavePeriodSeconds)
        : hour.wavePeriodSeconds;
    return {
      time: hour.time.getTime(),
      height: hour.waveHeightMeters,
      period,
      energy: waveEnergy(hour.waveHeightMeters, period),
      wind: toKnots(hour.windSpeedMetersPerSecond),
      gust: toKnots(hour.windGustMetersPerSecond),
      windDirection: hour.windDirectionDegrees,
      waveDirection: hour.waveDirectionDegrees,
      // An API of the version before gives no swell: the row then stays out of the table.
      swell: hour.primarySwellHeightMeters ?? null,
      swellDirection: hour.primarySwellDirectionDegrees ?? null,
      cloud: hour.cloudCoverPercent,
      rain: hour.precipitationMillimeters,
      air: hour.airTemperatureCelsius,
    };
  });
}

export type NumericKey = MetricKey | WeatherKey | "gust" | "swell";

/**
 * A value at a moment, between the two samples around it. Undefined when the nearest samples are
 * further than `reach` from it: a buoy that stopped reporting says nothing of the hours after.
 */
export function valueAt(samples: Sample[], key: NumericKey, time: number, reach = 2 * HOUR_MS) {
  let before: Sample | undefined;
  let after: Sample | undefined;
  for (const sample of samples) {
    if (sample[key] === null) continue;
    if (sample.time <= time) before = sample;
    else {
      after = sample;
      break;
    }
  }
  const near = (sample: Sample | undefined) =>
    sample !== undefined && Math.abs(sample.time - time) <= reach;
  if (near(before) && near(after)) {
    const ratio = (time - before!.time) / (after!.time - before!.time);
    return before![key]! + (after![key]! - before![key]!) * ratio;
  }
  if (near(before)) return before![key]!;
  if (near(after)) return after![key]!;
  return undefined;
}

/** The bearing at a moment: the one of the nearest sample, since bearings do not average. */
export function directionAt(
  samples: Sample[],
  key: "waveDirection" | "swellDirection" | "windDirection",
  time: number,
  reach = 2 * HOUR_MS,
) {
  let nearest: Sample | undefined;
  for (const sample of samples) {
    if (sample[key] === null) continue;
    if (!nearest || Math.abs(sample.time - time) < Math.abs(nearest.time - time)) nearest = sample;
  }
  return nearest && Math.abs(nearest.time - time) <= reach ? nearest[key]! : undefined;
}

/** How far the model stands from the buoy on average since a moment: model minus buoy. */
export function bias(measured: Sample[], model: Sample[], key: MetricKey, since: number) {
  let sum = 0;
  let count = 0;
  for (const sample of measured) {
    const value = sample[key];
    if (sample.time < since || value === null) continue;
    const modelled = valueAt(model, key, sample.time);
    if (modelled === undefined) continue;
    sum += modelled - value;
    count++;
  }
  return count < 6 ? undefined : sum / count;
}

/**
 * A metric as the week's table colors it in a palette. Windguru's fills every cell, the air's
 * too, and writes on it in its own ink. The swell takes the waves' scale, the gusts the wind's.
 */
export function inPalette(metric: Metric, palette: Palette): Metric {
  if (palette === "tonnr") return metric;
  const key = metric.key === "swell" ? "height" : metric.key === "gust" ? "wind" : metric.key;
  const ink = key === "wind" ? windguruWindInk : () => WINDGURU_INK;
  return { ...metric, scale: WINDGURU_SCALES[key], tinted: false, plain: false, ink };
}

/** The color of a value, and the ink to write on it. A tinted scale lets the theme show through. */
export function cellColors(metric: Metric, value: number) {
  const color = scaleColor(metric.scale, value);
  if (!metric.tinted) {
    return { background: color, color: metric.ink?.(value) ?? scaleInk(metric.scale, value) };
  }
  const first = metric.scale[0]!.value;
  const last = metric.scale.at(-1)!.value;
  const position = Math.min(1, Math.max(0, (value - first) / (last - first)));
  // A square root: most of the sea lives at the low end of an energy scale.
  const strength = Math.round(14 + 72 * Math.sqrt(position));
  return { background: `color-mix(in oklab, ${color} ${strength}%, transparent)` };
}

export function metricColor(metric: Metric, value: number) {
  return scaleColor(metric.scale, value);
}

const RADIANS = Math.PI / 180;

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

/** The distance between two points of the globe, in kilometres. */
export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const latitude = (to.latitude - from.latitude) * RADIANS;
  const longitude = (to.longitude - from.longitude) * RADIANS;
  const chord =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(from.latitude * RADIANS) *
      Math.cos(to.latitude * RADIANS) *
      Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(chord));
}
