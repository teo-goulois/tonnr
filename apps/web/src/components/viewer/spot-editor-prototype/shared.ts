// PROTOTYPE, to throw away. See spot-editor-prototype.tsx.

// The engine's own rules, read from its file so that the preview cannot disagree with an alert.
// The real editor would take them through a dependency on the package, or from the API.
import {
  findWindows,
  tideTrendAt,
  unmetCriteria,
  type HourConditions,
} from "../../../../../../packages/conditions/src/spots/criteria";
import { getLocale } from "@/paraglide/runtime.js";

import type { Forecast, SurfBreak, TideExtremes, TideTimeline } from "../types";

export type Range = { min?: number; max?: number };
export type Arc = { from: number; to: number };
/** The criteria of a spot, as `POST /v1/spots` takes them: decision 006. */
export type Criteria = {
  swellHeightMeters?: Range;
  swellPeriodSeconds?: Range;
  swellDirectionDegrees?: Arc;
  windSpeedMetersPerSecond?: Range;
  windDirectionDegrees?: Arc;
  tideHeightMeters?: Range;
  tideTrend?: "rising" | "falling";
};
export type CriterionKey = keyof Criteria;
export type RangeKey =
  | "swellHeightMeters"
  | "swellPeriodSeconds"
  | "windSpeedMetersPerSecond"
  | "tideHeightMeters";
export type ArcKey = "swellDirectionDegrees" | "windDirectionDegrees";

export type Point = { latitude: number; longitude: number };
export type Draft = {
  name: string;
  criteria: Criteria;
  alertsEnabled: boolean;
  visibility: "private" | "public";
};

export type JudgedHour = HourConditions & { unmet: CriterionKey[] };
export type Window = { start: Date; end: Date };
export type Judged = { hours: JudgedHour[]; windows: Window[] };

export const HOUR_MS = 60 * 60 * 1000;
export const KNOT = 1.943844;

/** One string in the reader's language. A prototype keeps its strings beside what shows them. */
export function t(en: string, fr: string) {
  return getLocale() === "fr" ? fr : en;
}

/** The hours ahead as the alert engine reads them, from the forecast and the tide of the point. */
export function hoursAhead(
  forecast: Forecast | undefined,
  tides: TideTimeline | undefined,
  extremes: TideExtremes | undefined,
  now: number,
): HourConditions[] {
  if (!forecast) return [];
  const tideAt = new Map<number, number>();
  for (const sample of tides?.timeline ?? []) {
    tideAt.set(sample.time.getTime(), sample.heightMeters);
  }
  const turns = extremes?.extremes ?? [];
  return forecast.hours
    .filter((hour) => hour.time.getTime() > now - HOUR_MS)
    .map((hour) => ({
      time: hour.time,
      swellHeightMeters: hour.swellHeightMeters,
      swellPeriodSeconds: hour.swellPeriodSeconds,
      swellDirectionDegrees: hour.swellDirectionDegrees,
      windSpeedMetersPerSecond: hour.windSpeedMetersPerSecond,
      windDirectionDegrees: hour.windDirectionDegrees,
      tideHeightMeters: tideAt.get(hour.time.getTime()) ?? null,
      tideTrend: tideTrendAt(hour.time, turns),
    }));
}

export function judge(hours: HourConditions[], criteria: Criteria): Judged {
  const judged = hours.map((hour) => ({ ...hour, unmet: unmetCriteria(hour, criteria) }));
  return { hours: judged, windows: findWindows(judged) };
}

/** For each criterion, the hours that it alone rules out: what to loosen first. */
export function blockers(judged: Judged) {
  const alone = new Map<CriterionKey, number>();
  for (const hour of judged.hours) {
    const only = hour.unmet.length === 1 ? hour.unmet[0] : undefined;
    if (only) alone.set(only, (alone.get(only) ?? 0) + 1);
  }
  return [...alone.entries()].sort((a, b) => b[1] - a[1]);
}

// The sixteen points of the compass, clockwise from north, as the catalogue names them.
const ALL_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

/** The smallest sector that holds every compass point given, half a point wider on each side. */
function arcOf(points: readonly string[] | null | undefined): Arc | undefined {
  const degrees = [...new Set(points ?? [])]
    .map((point) => ALL_POINTS.indexOf(point) * 22.5)
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  if (degrees.length === 0) return undefined;
  // The sector is all of the compass but the widest gap between two neighbours.
  let widest = { gap: -1, after: 0 };
  degrees.forEach((value, index) => {
    const next = degrees[(index + 1) % degrees.length]! + (index + 1 === degrees.length ? 360 : 0);
    if (next - value > widest.gap) widest = { gap: next - value, after: index };
  });
  const from = degrees[(widest.after + 1) % degrees.length]!;
  const to = degrees[widest.after]!;
  return { from: (from - 11.25 + 360) % 360, to: (to + 11.25) % 360 };
}

// The share of the tide's range that each stage of the catalogue stands for.
const TIDE_SHARES: Record<string, [number, number]> = {
  low: [0, 0.25],
  mid_low: [0.2, 0.45],
  mid: [0.35, 0.65],
  mid_high: [0.55, 0.8],
  high: [0.75, 1],
};

export function tideBounds(tides: TideTimeline | undefined) {
  const heights = (tides?.timeline ?? []).map((sample) => sample.heightMeters);
  if (heights.length === 0) return undefined;
  return { low: Math.min(...heights), high: Math.max(...heights) };
}

const round = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Criteria to start from: what the catalogue says of the break, then a swell a surfer can ride
 * and a wind that does not spoil it. A free point starts from the last two alone.
 */
export function suggest(found: SurfBreak | undefined, tides: TideTimeline | undefined): Criteria {
  const known = found?.characteristics;
  const criteria: Criteria = {
    swellHeightMeters: { min: 0.8, max: 2.5 },
    swellPeriodSeconds: { min: 9 },
    windSpeedMetersPerSecond: { max: round(15 / KNOT, 0.1) },
  };
  const swell = arcOf(known?.bestSwellDirections);
  if (swell) criteria.swellDirectionDegrees = swell;
  const offshore = known?.offshoreDirectionDegrees;
  const wind =
    arcOf(known?.bestWindDirections) ??
    (offshore == null
      ? undefined
      : { from: (offshore - 45 + 360) % 360, to: (offshore + 45) % 360 });
  if (wind) criteria.windDirectionDegrees = wind;
  const bounds = tideBounds(tides);
  const stages = known?.bestTides ?? [];
  if (bounds && stages.length > 0 && stages.length < 5) {
    const shares = stages.map((stage) => TIDE_SHARES[stage] ?? [0, 1]);
    const span = bounds.high - bounds.low;
    criteria.tideHeightMeters = {
      min: round(bounds.low + span * Math.min(...shares.map((share) => share[0]!)), 0.1),
      max: round(bounds.low + span * Math.max(...shares.map((share) => share[1]!)), 0.1),
    };
  }
  return criteria;
}

/** Criteria drawn around one hour that worked: "like then". */
export function around(hour: HourConditions): Criteria {
  const criteria: Criteria = {};
  const { swellHeightMeters: height, swellPeriodSeconds: period } = hour;
  if (height !== null) {
    criteria.swellHeightMeters = {
      min: round(Math.max(0, height * 0.7), 0.1),
      max: round(height * 1.4, 0.1),
    };
  }
  if (period !== null) criteria.swellPeriodSeconds = { min: Math.max(0, Math.round(period - 2)) };
  const sector = (degrees: number | null, half: number) =>
    degrees === null
      ? undefined
      : { from: round((degrees - half + 360) % 360, 5), to: round((degrees + half) % 360, 5) };
  const swell = sector(hour.swellDirectionDegrees, 25);
  if (swell) criteria.swellDirectionDegrees = swell;
  if (hour.windSpeedMetersPerSecond !== null) {
    criteria.windSpeedMetersPerSecond = {
      max: round(Math.max(hour.windSpeedMetersPerSecond * 1.3, 8 / KNOT), 0.1),
    };
  }
  const wind = sector(hour.windDirectionDegrees, 45);
  if (wind) criteria.windDirectionDegrees = wind;
  if (hour.tideHeightMeters !== null) {
    criteria.tideHeightMeters = {
      min: round(hour.tideHeightMeters - 0.8, 0.1),
      max: round(hour.tideHeightMeters + 0.8, 0.1),
    };
  }
  if (hour.tideTrend) criteria.tideTrend = hour.tideTrend;
  return criteria;
}

export function compass(degrees: number) {
  return ALL_POINTS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]!;
}

const number = (value: number, digits: number) =>
  value.toLocaleString(getLocale(), { maximumFractionDigits: digits });

/** A range in words: "1–2 m", "9 s or more", "under 15 kn". */
export function rangeWords(range: Range, unit: string, scale = 1, digits = 1) {
  const min = range.min === undefined ? undefined : number(range.min * scale, digits);
  const max = range.max === undefined ? undefined : number(range.max * scale, digits);
  if (min !== undefined && max !== undefined) return `${min}–${max} ${unit}`;
  if (min !== undefined) return t(`${min} ${unit} or more`, `${min} ${unit} ou plus`);
  if (max !== undefined) return t(`under ${max} ${unit}`, `moins de ${max} ${unit}`);
  return t("any", "peu importe");
}

export function arcWords(arc: Arc) {
  return `${compass(arc.from)}–${compass(arc.to)}`;
}

export function dayOf(date: Date) {
  return date.toLocaleDateString(getLocale(), { weekday: "short", day: "numeric" });
}

export function clockOf(date: Date) {
  return date.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
}

/** A window as the alert of decision 008 would count it: two hours at least. */
export function isAnnounced(window: Window) {
  return window.end.getTime() - window.start.getTime() >= 2 * HOUR_MS;
}

export type { HourConditions };
