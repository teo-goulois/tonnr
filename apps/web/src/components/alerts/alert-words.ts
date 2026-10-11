import { compassPoint, formatNumber, toKnots } from "@/lib/format";
import { knotsFrom, windIn, windUnit } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import type { AlertCriteria } from "../viewer/types";

export type CriterionKey = keyof AlertCriteria;
export type RangeKey =
  | "swellHeightMeters"
  | "swellPeriodSeconds"
  | "windSpeedMetersPerSecond"
  | "tideHeightMeters";
export type ArcKey = "swellDirectionDegrees" | "windDirectionDegrees";
export type Range = NonNullable<AlertCriteria[RangeKey]>;
export type Arc = NonNullable<AlertCriteria[ArcKey]>;

const KNOTS_PER_MS = 1.943844;

/**
 * How a range is shown and set: its unit, the usual ends of its slider, its step, how its value
 * is kept, and the least and the most the API takes of it, as it is kept. The wind is kept in
 * metres per second and read in knots.
 */
export const RANGES: Record<
  RangeKey,
  {
    label: () => string;
    unit: (value: string) => string;
    least: number;
    most: number;
    step: number;
    digits: number;
    shown: (kept: number) => number;
    kept: (shown: number) => number;
    floor: number;
    ceiling: number;
  }
> = {
  swellHeightMeters: {
    label: m.alert_label_swell_height,
    unit: (value) => m.unit_meters({ value }),
    least: 0,
    most: 5,
    step: 0.1,
    digits: 1,
    shown: (kept) => kept,
    kept: (shown) => Math.round(shown * 10) / 10,
    floor: 0,
    ceiling: 30,
  },
  swellPeriodSeconds: {
    label: m.alert_label_swell_period,
    unit: (value) => m.unit_seconds({ value }),
    least: 4,
    most: 22,
    step: 1,
    digits: 0,
    shown: (kept) => kept,
    kept: (shown) => Math.round(shown),
    floor: 0,
    ceiling: 40,
  },
  windSpeedMetersPerSecond: {
    label: m.alert_label_wind_speed,
    // Written and set in the reader's unit, and kept in metres a second. The bounds are those of
    // 40 and 120 knots, read each time: the reader may change units while the editor is open.
    unit: (value) => `${value} ${windUnit()}`,
    least: 0,
    get most() {
      return Math.round(windIn(40));
    },
    step: 1,
    digits: 0,
    shown: (kept) => Math.round(windIn(toKnots(kept))),
    kept: (shown) => Math.round((knotsFrom(shown) / KNOTS_PER_MS) * 100) / 100,
    // The API's bounds are of the wind as it is kept: metres a second.
    floor: 0,
    ceiling: 120,
  },
  tideHeightMeters: {
    label: m.alert_label_tide_height,
    unit: (value) => m.unit_meters({ value }),
    least: 0,
    most: 8,
    step: 0.1,
    digits: 1,
    shown: (kept) => kept,
    kept: (shown) => Math.round(shown * 10) / 10,
    floor: -5,
    ceiling: 20,
  },
};

export const CRITERION_LABELS: Record<CriterionKey, () => string> = {
  swellHeightMeters: m.alert_label_swell_height,
  swellPeriodSeconds: m.alert_label_swell_period,
  swellDirectionDegrees: m.alert_label_swell_from,
  windSpeedMetersPerSecond: m.alert_label_wind_speed,
  windDirectionDegrees: m.alert_label_wind_from,
  tideHeightMeters: m.alert_label_tide_height,
  tideTrend: m.alert_label_tide_trend,
};

export function isSetRange(range: Range | undefined): range is Range {
  return range !== undefined && (range.min !== undefined || range.max !== undefined);
}

/** A range in words: "1–2 m", "9 s or more", "under 15 kn". */
export function rangeWords(key: RangeKey, range: Range) {
  const { unit, digits, shown } = RANGES[key];
  const said = (kept: number) => formatNumber(shown(kept), digits);
  if (range.min !== undefined && range.max !== undefined) {
    return unit(`${said(range.min)}–${said(range.max)}`);
  }
  if (range.min !== undefined) return m.alert_range_min({ value: unit(said(range.min)) });
  if (range.max !== undefined) return m.alert_range_max({ value: unit(said(range.max)) });
  return "";
}

/** A sector in words, clockwise: "W–NW". */
export function arcWords(arc: Arc) {
  return `${compassPoint(arc.from)}–${compassPoint(arc.to)}`;
}

/** The conditions as they are sent: a range with neither end, or a part left out, is not there. */
export function asked(criteria: AlertCriteria): AlertCriteria {
  return Object.fromEntries(
    Object.entries(criteria).filter(
      ([, criterion]) =>
        typeof criterion === "string" ||
        (criterion !== undefined && Object.values(criterion).some((end) => end !== undefined)),
    ),
  );
}

/** The conditions as one string, the same for the same conditions in whatever order they come. */
export function conditionsKey(criteria: AlertCriteria) {
  const sorted = (value: object) =>
    Object.fromEntries(Object.entries(value).sort(([one], [other]) => one.localeCompare(other)));
  return JSON.stringify(
    Object.entries(asked(criteria))
      .sort(([one], [other]) => one.localeCompare(other))
      .map(([key, criterion]) => [
        key,
        typeof criterion === "object" ? sorted(criterion) : criterion,
      ]),
  );
}

/**
 * The ends of a range's slider: the usual ones, or those given for it, moved out to hold a
 * bound that is kept beyond them. A bound that is kept is then never past the end of its line.
 */
export function sliderEnds(
  key: RangeKey,
  range: Range | undefined,
  usual: [number, number] = [RANGES[key].least, RANGES[key].most],
): [number, number] {
  const { step, shown } = RANGES[key];
  // Either bound may lie past either end: a least that is more than the line usually shows.
  const kept = [range?.min, range?.max].flatMap((bound) =>
    bound === undefined ? [] : shown(bound),
  );
  return [
    Math.min(usual[0], ...kept.map((value) => Math.floor(value / step + 1e-9) * step)),
    Math.max(usual[1], ...kept.map((value) => Math.ceil(value / step - 1e-9) * step)),
  ];
}

/** Where the two thumbs of a range stand on its slider. An end that is open is at its end. */
export function thumbsOf(key: RangeKey, range: Range | undefined, [least, most]: [number, number]) {
  const { shown } = RANGES[key];
  const within = (value: number) => Math.min(most, Math.max(least, value));
  return [
    range?.min === undefined ? least : within(shown(range.min)),
    range?.max === undefined ? most : within(shown(range.max)),
  ] as [number, number];
}

/**
 * What a range becomes when the thumbs of its slider go from `before` to `after`. An end whose
 * thumb did not move keeps exactly what was kept: it is not read back from the slider, which
 * shows it rounded. A thumb moved to the end of the line leaves that side open.
 */
export function rangeAfter(
  key: RangeKey,
  range: Range | undefined,
  before: readonly number[],
  after: readonly number[],
  [least, most]: [number, number],
): Range | undefined {
  const { kept } = RANGES[key];
  const [from, to] = after;
  const movedMin = from !== undefined && from !== before[0];
  const movedMax = to !== undefined && to !== before[1];
  let min = movedMin ? (from > least ? kept(from) : undefined) : range?.min;
  let max = movedMax ? (to < most ? kept(to) : undefined) : range?.max;
  // Two thumbs that meet are one value: the end that moved stops at the one that did not, which
  // is kept more finely than the slider shows it.
  if (min !== undefined && max !== undefined && min > max) {
    if (movedMax && !movedMin) max = min;
    else min = max;
  }
  if (min === undefined && max === undefined) return undefined;
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
}

// A sector loosens by this much at each end.
const ARC_NOTCH = 15;

/**
 * One notch wider: what the button beside a condition that holds a spot back does. Whatever
 * the condition took, it still takes: a sector that would pass the whole compass asks nothing
 * any more, and a range stops at the least and the most the API takes.
 */
export function loosened(criteria: AlertCriteria, key: CriterionKey): AlertCriteria {
  if (key === "tideTrend") return { ...criteria, tideTrend: undefined };
  if (key === "swellDirectionDegrees" || key === "windDirectionDegrees") {
    const arc = criteria[key];
    if (!arc) return criteria;
    const sweep = (arc.to - arc.from + 360) % 360 || 360;
    if (sweep + 2 * ARC_NOTCH >= 360) return { ...criteria, [key]: undefined };
    return {
      ...criteria,
      [key]: { from: (arc.from - ARC_NOTCH + 360) % 360, to: (arc.to + ARC_NOTCH) % 360 },
    };
  }
  const range = criteria[key];
  if (!range) return criteria;
  const { step, floor, ceiling, kept, shown } = RANGES[key];
  // A period loosens by a second, a height by two tenths, the wind by two knots.
  const by = key === "swellPeriodSeconds" ? step : step * 2;
  return {
    ...criteria,
    [key]: {
      ...(range.min === undefined
        ? {}
        : { min: Math.max(floor, Math.min(range.min, kept(shown(range.min) - by))) }),
      ...(range.max === undefined
        ? {}
        : { max: Math.min(ceiling, Math.max(range.max, kept(shown(range.max) + by))) }),
    },
  };
}

/** An alert as its editor holds it, before it is saved. */
export type AlertDraft = {
  name: string;
  criteria: AlertCriteria;
  enabled: boolean;
  shortestMinutes: number;
  spotIds: string[];
};

/** What of a draft the preview is asked for. Null when no editor is open. */
export type AlertTrial = Pick<AlertDraft, "criteria" | "shortestMinutes" | "spotIds"> | null;

/** Whether two values of a part of a draft say the same. */
export function samePart<Key extends keyof AlertDraft>(
  key: Key,
  one: AlertDraft[Key],
  other: AlertDraft[Key],
) {
  if (key === "name") return (one as string).trim() === (other as string).trim();
  if (key === "criteria") {
    return conditionsKey(one as AlertCriteria) === conditionsKey(other as AlertCriteria);
  }
  if (key === "spotIds") {
    return [...(one as string[])].sort().join() === [...(other as string[])].sort().join();
  }
  return one === other;
}

/** What of a draft differs from the alert that is saved: the parts to send. */
export function changedParts(changed: Partial<AlertDraft>, saved: AlertDraft) {
  return Object.fromEntries(
    (Object.keys(changed) as (keyof AlertDraft)[])
      .filter((key) => changed[key] !== undefined && !samePart(key, changed[key]!, saved[key]))
      .map((key) => [key, changed[key]]),
  ) as Partial<AlertDraft>;
}
