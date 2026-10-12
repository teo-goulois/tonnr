import { compassPoint, formatNumber, toKnots } from "@/lib/format";
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

import type { AlertCriteria } from "../viewer/types";

export type CriterionKey = keyof AlertCriteria;
// `swellHeightMeters`, `swellPeriodSeconds` and `swellDirectionDegrees` are the whole sea, under
// the names an alert's conditions were first saved with. The swell apart from the wind sea is
// `primarySwellHeightMeters` and `primarySwellDirectionDegrees`: decision 038.
export type RangeKey =
  | "swellHeightMeters"
  | "swellPeriodSeconds"
  | "primarySwellHeightMeters"
  | "windSpeedMetersPerSecond"
  | "tideHeightMeters";
export type ArcKey =
  | "swellDirectionDegrees"
  | "primarySwellDirectionDegrees"
  | "windDirectionDegrees";
const ARC_KEYS: readonly CriterionKey[] = [
  "swellDirectionDegrees",
  "primarySwellDirectionDegrees",
  "windDirectionDegrees",
];
const isArcKey = (key: CriterionKey): key is ArcKey => ARC_KEYS.includes(key);
export type Range = NonNullable<AlertCriteria[RangeKey]>;
export type Arc = NonNullable<AlertCriteria[ArcKey]>;

const KNOTS_PER_MS = 1.943844;

/**
 * How a range is shown and set: its unit, the usual ends of its slider and its step, in the unit
 * its reader chose, how its value is kept, and `floor` and `ceiling`, the least and the most
 * the API takes of it, as it is kept: metres, seconds, metres a second.
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
    label: m.alert_label_wave_height,
    // Written and set in the reader's unit, and kept in metres. In feet a step is half a foot.
    unit: (value) => `${value} ${heightUnit()}`,
    least: 0,
    get most() {
      return Math.round(heightIn(5));
    },
    get step() {
      return getUnits().height === "ft" ? 0.5 : 0.1;
    },
    digits: 1,
    shown: (kept) =>
      getUnits().height === "ft" ? Math.round(heightIn(kept) * 2) / 2 : Math.round(kept * 10) / 10,
    kept: (shown) => Math.round(metersFrom(shown) * 100) / 100,
    // The API's bounds are of the height as it is kept, in metres, whatever unit it is read in.
    floor: 0,
    ceiling: 30,
  },
  swellPeriodSeconds: {
    label: m.alert_label_wave_period,
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
  primarySwellHeightMeters: {
    label: m.alert_label_swell_height,
    // Written and set in the reader's unit, and kept in metres. In feet a step is half a foot.
    unit: (value) => `${value} ${heightUnit()}`,
    least: 0,
    get most() {
      return Math.round(heightIn(5));
    },
    get step() {
      return getUnits().height === "ft" ? 0.5 : 0.1;
    },
    digits: 1,
    shown: (kept) =>
      getUnits().height === "ft" ? Math.round(heightIn(kept) * 2) / 2 : Math.round(kept * 10) / 10,
    kept: (shown) => Math.round(metersFrom(shown) * 100) / 100,
    // The API's bounds are of the height as it is kept, in metres, whatever unit it is read in.
    floor: 0,
    ceiling: 30,
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
    // Written and set in the reader's unit, and kept in metres. In feet a step is half a foot.
    unit: (value) => `${value} ${heightUnit()}`,
    least: 0,
    get most() {
      return Math.round(heightIn(8));
    },
    get step() {
      return getUnits().height === "ft" ? 0.5 : 0.1;
    },
    digits: 1,
    shown: (kept) =>
      getUnits().height === "ft" ? Math.round(heightIn(kept) * 2) / 2 : Math.round(kept * 10) / 10,
    kept: (shown) => Math.round(metersFrom(shown) * 100) / 100,
    // The API's bounds are of the height as it is kept, in metres, whatever unit it is read in.
    floor: -5,
    ceiling: 20,
  },
};

export const CRITERION_LABELS: Record<CriterionKey, () => string> = {
  swellHeightMeters: m.alert_label_wave_height,
  swellPeriodSeconds: m.alert_label_wave_period,
  swellDirectionDegrees: m.alert_label_wave_from,
  primarySwellHeightMeters: m.alert_label_swell_height,
  primarySwellDirectionDegrees: m.alert_label_swell_from,
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
  if (isArcKey(key)) {
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

/**
 * What is left of what was changed in an editor once a save has answered: the parts that the
 * save did not send, and those that were changed again since it sent them. The others are
 * saved, and follow the alert from then on.
 */
export function leftAfterSave(changed: Partial<AlertDraft>, sent: Partial<AlertDraft>) {
  return Object.fromEntries(
    (Object.keys(changed) as (keyof AlertDraft)[])
      .filter(
        (key) =>
          changed[key] !== undefined &&
          (sent[key] === undefined || !samePart(key, changed[key]!, sent[key]!)),
      )
      .map((key) => [key, changed[key]]),
  ) as Partial<AlertDraft>;
}

/**
 * What an editor holds of an alert between two saves: the parts that were changed here, and
 * what the save that is on its way sent, the whole of a new alert or the changed parts of one
 * that is saved. Null while no save is on its way.
 */
export type Drafting = { changed: Partial<AlertDraft>; sending: Partial<AlertDraft> | null };
export const NOTHING_DRAFTED: Drafting = { changed: {}, sending: null };

// What was changed without the parts that say what the alert says, which follow the alert
// again. A part that the save on its way sent is kept whatever it says: what was sent may be
// something else, and the part is held against that save's answer. The same object when
// nothing is let go of.
function differing(drafting: Drafting, changed: Partial<AlertDraft>, saved: AlertDraft) {
  const kept = (Object.keys(changed) as (keyof AlertDraft)[]).filter(
    (key) =>
      changed[key] !== undefined &&
      (drafting.sending?.[key] !== undefined || !samePart(key, changed[key]!, saved[key])),
  );
  if (kept.length === Object.keys(changed).length) return changed;
  return Object.fromEntries(kept.map((key) => [key, changed[key]])) as Partial<AlertDraft>;
}

/**
 * A part is set. Put back to what the alert says, it is no longer a change: left there, it
 * would hide what the alert becomes elsewhere, and be sent with the next save. Unless the save
 * that is on its way sent that very part.
 */
export function setPart<Key extends keyof AlertDraft>(
  drafting: Drafting,
  saved: AlertDraft,
  key: Key,
  value: AlertDraft[Key],
): Drafting {
  return {
    ...drafting,
    changed: differing(drafting, { ...drafting.changed, [key]: value }, saved),
  };
}

/** The parts that differ from the alert as it is saved: what the next save sends. */
export function partsToSave(drafting: Drafting, saved: AlertDraft) {
  return changedParts(drafting.changed, saved);
}

/**
 * Whether leaving the editor now would lose something: a part that differs from the alert as
 * it is saved, or a save that has not answered. What was sent is not saved until it is.
 */
export function isUnsaved(drafting: Drafting, saved: AlertDraft) {
  return drafting.sending !== null || Object.keys(partsToSave(drafting, saved)).length > 0;
}

/**
 * The save that was on its way has answered, with the alert as it is saved, or with nothing
 * when it failed. What it sent and was not changed since is saved. What it did not send, and
 * what was changed again meanwhile, is held against the alert as it answered.
 */
export function afterAnswer(
  drafting: Drafting,
  sent: Partial<AlertDraft>,
  answer: AlertDraft | undefined,
): Drafting {
  if (!answer) return { ...drafting, sending: null };
  return { changed: changedParts(leftAfterSave(drafting.changed, sent), answer), sending: null };
}

/**
 * The alert was read again. A part that says what the alert now says is no longer a change,
 * unless the save that is on its way sent it: until that save answers, the part is kept.
 */
export function afterRead(drafting: Drafting, saved: AlertDraft): Drafting {
  const changed = differing(drafting, drafting.changed, saved);
  return changed === drafting.changed ? drafting : { ...drafting, changed };
}

/**
 * What was changed, without the spots that are no longer the user's: a neighbour that was
 * deleted meanwhile is no longer asked for. The spots are those the alert is written with,
 * changed here or not: a copy starts with those of the alert it was made from, and one of them
 * may be gone before the copy is touched. The same object when none is gone.
 */
export function withoutGone(
  changed: Partial<AlertDraft>,
  saved: AlertDraft,
  isKnown: (spotId: string) => boolean,
) {
  const spotIds = changed.spotIds ?? saved.spotIds;
  return spotIds.every(isKnown) ? changed : { ...changed, spotIds: spotIds.filter(isKnown) };
}

/** What a spot's panel writes: an alert that is saved, or a new one, which may start from a copy. */
export type Written = { alertId?: string; initial?: AlertDraft };

/**
 * Whether what a spot's panel is asked to write is the alert that is open in it: that alert
 * then stays as it is, with what is written of it.
 */
export function isOpenAlert(open: Written | null, asked: Written | null) {
  return open !== null && asked?.alertId !== undefined && asked.alertId === open.alertId;
}
