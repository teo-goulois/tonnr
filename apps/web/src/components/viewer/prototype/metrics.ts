// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import { compassPoint, formatNumber, toKnots } from "@/lib/format";
import {
  CLOUD_COVER_SCALE,
  PRECIPITATION_SCALE,
  type ScaleStop,
  WAVE_ENERGY_SCALE,
  WAVE_HEIGHT_SCALE,
  WAVE_PERIOD_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
  scaleInk,
} from "@/lib/sea-scales";
import { getLocale } from "@/paraglide/runtime.js";

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
  // The sky under cloud in percent, the rain of the hour in millimetres, the air in °C. The
  // model's alone: a buoy reads none of them.
  cloud: number | null;
  rain: number | null;
  air: number | null;
};

// The strings of the prototype stay out of the messages until a variant is kept.
const STRINGS = {
  en: {
    height: "Swell",
    period: "Period",
    energy: "Energy",
    wind: "Wind",
    gust: "Gusts",
    direction: "Direction",
    cloud: "Clouds",
    rain: "Rain",
    air: "Air",
    model: "model",
    buoy: "buoy",
    gap: "difference",
    now: "now",
    live: "Buoy and model",
    ahead: "Forecast",
    week: "7 days",
    days: "d",
    more: "More",
    max: "Max height",
    water: "Water",
    about: "About these figures",
    backToNow: "Now",
    noWindSensor: "This buoy has no wind sensor: the wind is the model's.",
    biasHigh: "Over 24 h the model reads {value} above the buoy.",
    biasLow: "Over 24 h the model reads {value} under the buoy.",
    biasNone: "Over 24 h the model and the buoy agree on the height.",
    modelNote: "The model's past hours are its latest run, not the forecast as first issued.",
    nearestBuoy: "Buoy, {distance} km away",
    forecastTab: "Forecast",
    guideTab: "Guide",
    guideEmpty: "Nothing written about this spot yet.",
  },
  fr: {
    height: "Houle",
    period: "Période",
    energy: "Énergie",
    wind: "Vent",
    gust: "Rafales",
    direction: "Direction",
    cloud: "Nuages",
    rain: "Pluie",
    air: "Air",
    model: "modèle",
    buoy: "bouée",
    gap: "écart",
    now: "maintenant",
    live: "Bouée et modèle",
    ahead: "Prévisions",
    week: "7 jours",
    days: "j",
    more: "Plus",
    max: "Hauteur max",
    water: "Eau",
    about: "À propos de ces chiffres",
    backToNow: "Maintenant",
    noWindSensor: "Cette bouée ne mesure pas le vent : le vent est celui du modèle.",
    biasHigh: "Sur 24 h, le modèle donne {value} de plus que la bouée.",
    biasLow: "Sur 24 h, le modèle donne {value} de moins que la bouée.",
    biasNone: "Sur 24 h, le modèle et la bouée s'accordent sur la hauteur.",
    modelNote: "Les heures passées du modèle sont son dernier calcul, pas la prévision d'origine.",
    nearestBuoy: "Bouée à {distance} km",
    forecastTab: "Prévisions",
    guideTab: "Guide",
    guideEmpty: "Rien d'écrit sur ce spot pour l'instant.",
  },
};

export function t() {
  return getLocale() === "fr" ? STRINGS.fr : STRINGS.en;
}

/**
 * The energy of one wave along a metre of its crest, in kilojoules: the power of the sea in deep
 * water, ρg²H²T/64π, times the period. The figure surf forecasts print: a 1 m swell of 10 s
 * carries 49 kJ, a 2 m swell of 14 s carries 384 kJ.
 */
export function waveEnergy(heightMeters: number | null, periodSeconds: number | null) {
  if (heightMeters === null || periodSeconds === null) return null;
  return 0.4903 * heightMeters ** 2 * periodSeconds ** 2;
}

export type Metric = {
  key: NumericKey;
  label: string;
  unit: string;
  digits: number;
  scale: ScaleStop[];
  // A scale of one hue: a cell takes it as a tint, stronger with the value.
  tinted: boolean;
  // The bearing that goes with the value: where the waves or the wind come from.
  direction?: "waveDirection" | "windDirection";
  // The lowest value a lane starts from. The others start from zero.
  floor?: number;
  // A value written without a color: the air's temperature has no scale here.
  plain?: boolean;
  // A value of zero leaves its cell empty: an hour without rain says so by saying nothing.
  hideZero?: boolean;
};

export function metrics(): Record<MetricKey, Metric> {
  const strings = t();
  return {
    height: {
      key: "height",
      label: strings.height,
      unit: "m",
      digits: 1,
      scale: WAVE_HEIGHT_SCALE,
      tinted: false,
      direction: "waveDirection",
    },
    period: {
      key: "period",
      label: strings.period,
      unit: "s",
      digits: 0,
      scale: WAVE_PERIOD_SCALE,
      tinted: true,
      floor: 3,
    },
    energy: {
      key: "energy",
      label: strings.energy,
      unit: "kJ",
      digits: 0,
      scale: WAVE_ENERGY_SCALE,
      tinted: true,
    },
    wind: {
      key: "wind",
      label: strings.wind,
      unit: getLocale() === "fr" ? "nds" : "kn",
      digits: 0,
      scale: WIND_SPEED_SCALE,
      tinted: false,
      direction: "windDirection",
    },
  };
}

export const METRIC_KEYS: MetricKey[] = ["height", "period", "energy", "wind"];

/** The weather beside the sea, for the rows under the wind's. */
export function weatherMetrics(): Record<WeatherKey, Metric> {
  const strings = t();
  return {
    cloud: {
      key: "cloud",
      label: strings.cloud,
      unit: "%",
      digits: 0,
      scale: CLOUD_COVER_SCALE,
      tinted: true,
      hideZero: true,
    },
    rain: {
      key: "rain",
      label: strings.rain,
      unit: "mm",
      digits: 1,
      scale: PRECIPITATION_SCALE,
      tinted: true,
      hideZero: true,
    },
    air: {
      key: "air",
      label: strings.air,
      unit: "°C",
      digits: 0,
      scale: CLOUD_COVER_SCALE,
      tinted: true,
      plain: true,
    },
  };
}

export function formatMetric(metric: Metric, value: number, withUnit = true) {
  // A period read on a buoy has a decimal worth showing only when it stands alone.
  const figure = formatNumber(value, metric.digits);
  return withUnit ? `${figure} ${metric.unit}` : figure;
}

/** A difference written with its sign, such as "+0.6 m". */
export function formatDelta(metric: Metric, delta: number, withUnit = true) {
  const rounded = Number(delta.toFixed(metric.digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${formatMetric(metric, Math.abs(rounded), withUnit)}`;
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
        cloud: null,
        rain: null,
        air: null,
      };
    })
    .sort((a, b) => a.time - b.time);
}

export function modelSamples(hours: Forecast["hours"]): Sample[] {
  return hours.map((hour) => ({
    time: hour.time.getTime(),
    height: hour.waveHeightMeters,
    period: hour.wavePeriodSeconds,
    energy: waveEnergy(hour.waveHeightMeters, hour.wavePeriodSeconds),
    wind: toKnots(hour.windSpeedMetersPerSecond),
    gust: toKnots(hour.windGustMetersPerSecond),
    windDirection: hour.windDirectionDegrees,
    waveDirection: hour.waveDirectionDegrees,
    cloud: hour.cloudCoverPercent,
    rain: hour.precipitationMillimeters,
    air: hour.airTemperatureCelsius,
  }));
}

export type NumericKey = MetricKey | WeatherKey | "gust";

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
  key: "waveDirection" | "windDirection",
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

/** The color of a value, and the ink to write on it. A tinted scale lets the theme show through. */
export function cellColors(metric: Metric, value: number) {
  const color = scaleColor(metric.scale, value);
  if (!metric.tinted) return { background: color, color: scaleInk(metric.scale, value) };
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

export function describeDirection(degrees: number) {
  return `${compassPoint(degrees)} ${formatNumber(degrees, 0)}°`;
}

const RADIANS = Math.PI / 180;

/** Whether the sun is under the horizon at a place and a moment. */
export function isNight(time: number, latitude: number, longitude: number) {
  const days = time / DAY_MS + 2440587.5 - 2451545;
  const anomaly = (357.529 + 0.98560028 * days) * RADIANS;
  const ecliptic =
    (280.459 + 0.98564736 * days + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) *
    RADIANS;
  const tilt = (23.439 - 0.00000036 * days) * RADIANS;
  const ascension = Math.atan2(Math.cos(tilt) * Math.sin(ecliptic), Math.cos(ecliptic));
  const declination = Math.asin(Math.sin(tilt) * Math.sin(ecliptic));
  const sidereal = ((18.697374558 + 24.06570982441908 * days) * 15 + longitude) * RADIANS;
  const altitude = Math.asin(
    Math.sin(latitude * RADIANS) * Math.sin(declination) +
      Math.cos(latitude * RADIANS) * Math.cos(declination) * Math.cos(sidereal - ascension),
  );
  return altitude < -0.833 * RADIANS;
}

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
