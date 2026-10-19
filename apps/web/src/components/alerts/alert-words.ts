import {
  type Criterion,
  type Part,
  TIDE_KEYS,
  askedCriteria,
  tideAskOf,
} from "@repo/conditions/spots/criteria";
import {
  COEFFICIENT_BANDS,
  TIDE_CYCLE,
  type CoefficientBand,
  type TideSegment,
} from "@repo/config/sea-words";

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

export type CriterionKey = Criterion;
export type { Part };
/** What an alert asks of the tide: one value of its part. */
export type TideAsk = Pick<
  AlertCriteria,
  "tideHeightMeters" | "tideTrend" | "tideCycle" | "tideCoefficients"
>;
// The first three are the whole sea, with the period of its peak. The swell apart from the wind
// sea is `primarySwellHeightMeters` and `primarySwellDirectionDegrees`: decision 038.
export type RangeKey =
  | "waveHeightMeters"
  | "wavePeakPeriodSeconds"
  | "primarySwellHeightMeters"
  | "windSpeedMetersPerSecond"
  | "tideHeightMeters";
export type ArcKey =
  | "waveDirectionDegrees"
  | "primarySwellDirectionDegrees"
  | "windDirectionDegrees";
const ARC_KEYS: readonly CriterionKey[] = [
  "waveDirectionDegrees",
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
  waveHeightMeters: {
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
  wavePeakPeriodSeconds: {
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
  waveHeightMeters: m.alert_label_wave_height,
  wavePeakPeriodSeconds: m.alert_label_wave_period,
  waveDirectionDegrees: m.alert_label_wave_from,
  primarySwellHeightMeters: m.alert_label_swell_height,
  primarySwellDirectionDegrees: m.alert_label_swell_from,
  windSpeedMetersPerSecond: m.alert_label_wind_speed,
  windDirectionDegrees: m.alert_label_wind_from,
  tideHeightMeters: m.alert_label_tide_height,
  tideTrend: m.alert_label_tide_trend,
  tideCycle: m.alert_label_tide,
  tideCoefficients: m.alert_label_coefficient,
};

/** Each part of the tide's cycle, in a word or two: "mid tide rising". */
export const SEGMENT_WORDS: Record<TideSegment, () => string> = {
  low: m.alert_tide_low,
  mid_low_rising: m.alert_tide_mid_low_rising,
  mid_rising: m.alert_tide_mid_rising,
  mid_high_rising: m.alert_tide_mid_high_rising,
  high: m.alert_tide_high,
  mid_high_falling: m.alert_tide_mid_high_falling,
  mid_falling: m.alert_tide_mid_falling,
  mid_low_falling: m.alert_tide_mid_low_falling,
};

/** The bands of the coefficient in figures: a word alone says too little. */
export const BAND_FIGURES: Record<CoefficientBand, string> = {
  small: "< 70",
  medium: "70–90",
  big: "> 90",
};

/** Words joined by "or": "a, b or c". */
export function orWords(words: string[]) {
  if (words.length <= 1) return words[0] ?? "";
  return m.alert_or_list({ list: words.slice(0, -1).join(", "), last: words.at(-1)! });
}

/**
 * The parts of the cycle in runs, each said by its two ends, from low water on: a run across low
 * water stays whole and comes first. "from mid tide rising to high". Undefined for none, or all.
 */
export function cycleWords(cycle: readonly TideSegment[] | undefined) {
  if (!cycle?.length || cycle.length >= TIDE_CYCLE.length) return undefined;
  const length = TIDE_CYCLE.length;
  const on = TIDE_CYCLE.map((one) => cycle.includes(one));
  // Each run from the part that follows one not asked, with where it starts: a run that
  // started before low water and goes on past it starts below nought.
  const runs: { from: number; parts: TideSegment[] }[] = [];
  for (let at = 0; at < length; at++) {
    if (!on[at] || on[(at + length - 1) % length]) continue;
    const parts: TideSegment[] = [];
    for (let next = at; on[next % length] && parts.length < length; next++) {
      parts.push(TIDE_CYCLE[next % length]!);
    }
    runs.push({ from: at + parts.length > length ? at - length : at, parts });
  }
  return orWords(
    runs
      .sort((one, other) => one.from - other.from)
      .map(({ parts }) =>
        parts.length === 1
          ? SEGMENT_WORDS[parts[0]!]()
          : m.alert_tide_run({
              from: SEGMENT_WORDS[parts[0]!](),
              to: SEGMENT_WORDS[parts.at(-1)!](),
            }),
      ),
  );
}

/** The bands of the coefficient asked, in figures: "coef < 70 or > 90". */
export function coefficientWords(bands: readonly CoefficientBand[] | undefined) {
  if (!bands?.length || bands.length >= COEFFICIENT_BANDS.length) return undefined;
  return m.alert_tide_coefficient({
    bands: COEFFICIENT_BANDS.filter((band) => bands.includes(band))
      .map((band) => BAND_FIGURES[band])
      .join(m.alert_or()),
  });
}

/**
 * What an ask of the tide says, in words: the parts of its cycle and its coefficient, or the
 * height and the way of an alert written before the cycle. Empty when it asks nothing.
 */
export function tideWords(ask: TideAsk) {
  const trend =
    ask.tideTrend === "rising"
      ? m.alert_trend_rising()
      : ask.tideTrend === "falling"
        ? m.alert_trend_falling()
        : undefined;
  return [
    cycleWords(ask.tideCycle),
    coefficientWords(ask.tideCoefficients),
    isSetRange(ask.tideHeightMeters)
      ? m.alert_tide_at({ range: rangeWords("tideHeightMeters", ask.tideHeightMeters) })
      : undefined,
    trend,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Whether an ask of the tide asks something. */
export const asksOfTide = (ask: TideAsk) => Object.keys(tideAskOf(ask)).length > 0;

/** The ask of the tide that conditions hold as their own: the tide's fields of them. */
export function tideOf(criteria: AlertCriteria): TideAsk {
  return Object.fromEntries(TIDE_KEYS.map((key) => [key, criteria[key]]));
}

/** Conditions whose own ask of the tide is another. */
export function withTide(criteria: AlertCriteria, ask: TideAsk): AlertCriteria {
  const rest = Object.fromEntries(
    Object.entries(criteria).filter(([key]) => !(TIDE_KEYS as readonly string[]).includes(key)),
  );
  return { ...rest, ...ask };
}

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

/** The conditions as they are sent: what asks nothing is not there. */
export function asked(criteria: AlertCriteria): AlertCriteria {
  return askedCriteria(criteria);
}

// A value as one string, its keys in order, at every depth.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, inner]) => inner !== undefined)
        .sort(([one], [other]) => one.localeCompare(other))
        .map(([key, inner]) => [key, stable(inner)]),
    );
  }
  return value;
}

/** The conditions as one string, the same for the same conditions in whatever order they come. */
export function conditionsKey(criteria: AlertCriteria) {
  return JSON.stringify(stable(asked(criteria)));
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

// One value of a range or a sector, one notch wider. Undefined when it would ask nothing.
function wider(key: RangeKey | ArcKey, value: Range | Arc): Range | Arc | undefined {
  if (isArcKey(key)) {
    const arc = value as Arc;
    const sweep = (arc.to - arc.from + 360) % 360 || 360;
    if (sweep + 2 * ARC_NOTCH >= 360) return undefined;
    return { from: (arc.from - ARC_NOTCH + 360) % 360, to: (arc.to + ARC_NOTCH) % 360 };
  }
  const range = value as Range;
  const { step, floor, ceiling, kept, shown } = RANGES[key as RangeKey];
  // A period loosens by a second, a height by two tenths, the wind by two knots.
  const by = key === "wavePeakPeriodSeconds" ? step : step * 2;
  return {
    ...(range.min === undefined
      ? {}
      : { min: Math.max(floor, Math.min(range.min, kept(shown(range.min) - by))) }),
    ...(range.max === undefined
      ? {}
      : { max: Math.min(ceiling, Math.max(range.max, kept(shown(range.max) + by))) }),
  };
}

/**
 * One notch wider: what the button beside a condition that holds a spot back does. Whatever
 * the condition took, it still takes: a sector that would pass the whole compass asks nothing
 * any more, and a range stops at the least and the most the API takes. Each of a part's values
 * is widened. The tide, which has no notch, asks nothing any more.
 */
export function loosened(criteria: AlertCriteria, key: CriterionKey): AlertCriteria {
  if ((TIDE_KEYS as readonly string[]).includes(key)) {
    const asks = [tideOf(criteria), ...(criteria.or?.tide ?? [])];
    // A height is widened as a range is, and a way of the tide let go of, in every ask of the
    // tide. The parts of the cycle and the coefficient have no notch: the tide asks nothing more.
    const eased =
      key === "tideHeightMeters"
        ? asks.map((ask) => ({
            ...ask,
            tideHeightMeters: ask.tideHeightMeters && wider(key, ask.tideHeightMeters),
          }))
        : key === "tideTrend"
          ? asks.map((ask) => ({ ...ask, tideTrend: undefined }))
          : [];
    const [own = {}, ...others] = eased as TideAsk[];
    return asked({ ...withTide(criteria, own), or: { ...criteria.or, tide: others } });
  }
  const part = key as RangeKey | ArcKey;
  const own = criteria[part];
  const values = (criteria.or?.[part as Exclude<Part, "tide">] ?? []) as (Range | Arc)[];
  const widened = [own, ...values].flatMap((value) => (value ? [wider(part, value)] : []));
  // A value that now takes every direction makes the whole part take them.
  const whole = widened.some((value) => value === undefined);
  const [first, ...rest] = whole ? [] : widened;
  return asked({
    ...criteria,
    [part]: first,
    or: { ...criteria.or, [part]: rest },
  });
}

/** An alert as its editor holds it, before it is saved. */
export type AlertDraft = {
  name: string;
  criteria: AlertCriteria;
  enabled: boolean;
  shortestMinutes: number;
  // Its places: spots of the account's own, and surf breaks of the catalogue. Decision 064.
  spotIds: string[];
  breakIds: string[];
};

/** The places of a draft, which the preview is asked about. Null when no editor is open. */
export type AlertTrial = Pick<AlertDraft, "spotIds" | "breakIds"> | null;

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
  if (key === "spotIds" || key === "breakIds") {
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
 * deleted meanwhile is no longer asked for. The spots are those that were written here: those
 * that were changed, and those a new alert starts with, as a copy's, one of which may be gone
 * before the copy is touched. The spots of an alert that is saved, when they were not changed
 * here, are not made a change of: the alert will say what they are when it is read again, and
 * a change made here for it would hide whatever else it then says. The same object when
 * nothing is taken out.
 */
export function withoutGone(
  changed: Partial<AlertDraft>,
  saved: AlertDraft,
  isKnown: (spotId: string) => boolean,
  isSaved: boolean,
) {
  if (changed.spotIds === undefined && isSaved) return changed;
  const spotIds = changed.spotIds ?? saved.spotIds;
  return spotIds.every(isKnown) ? changed : { ...changed, spotIds: spotIds.filter(isKnown) };
}

/**
 * The user's spots were read again. What was written of the alert's spots no longer asks for
 * one that is gone, and what that leaves is held against the alert as any part is: spots that
 * are now those the alert has are no longer a change, and follow the alert from then on.
 */
export function afterSpotsRead(
  drafting: Drafting,
  saved: AlertDraft,
  isKnown: (spotId: string) => boolean,
  isSaved: boolean,
): Drafting {
  const changed = withoutGone(drafting.changed, saved, isKnown, isSaved);
  return afterRead(changed === drafting.changed ? drafting : { ...drafting, changed }, saved);
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
