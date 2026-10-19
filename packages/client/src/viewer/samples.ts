import { toKnots } from "../format";
import { type Forecast, type Reading, periodOf } from "./types";

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

const RADIANS = Math.PI / 180;

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
