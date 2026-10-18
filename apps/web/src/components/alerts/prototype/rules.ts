// PROTOTYPE, throwaway (branch prototype/alert-conditions): what an alert with "ou" and the
// four ways of asking the tide would find, hour by hour, judged in the browser over the hours
// the API's preview gives. Nothing here is the engine of decision 031: it reuses its
// `unmetCriteria` for everything but the tide.

import { unmetCriteria } from "@repo/conditions/spots/criteria";
import { TIDE_STAGES, type TideStage } from "@repo/config/sea-words";

import type { AlertCriteria, AlertPreview } from "../../viewer/types";
import { asked } from "../alert-words";

export type Trend = "rising" | "falling";
export type Range = { min?: number; max?: number };
export type TideVariant = "a" | "b" | "c" | "d";
export type OrVariant = "1" | "2";

export const STAGE_WORDS: Record<TideStage, string> = {
  low: "basse",
  mid_low: "basse à mi-marée",
  mid: "mi-marée",
  mid_high: "mi-marée à haute",
  high: "haute",
};

export const COEF_BUCKETS = {
  small: { min: 20, max: 70, word: "petit coef", hint: "mortes-eaux, moins de 70" },
  medium: { min: 70, max: 90, word: "coef moyen", hint: "70 à 90" },
  big: { min: 90, max: 120, word: "gros coef", hint: "vives-eaux, plus de 90" },
} as const;
export type CoefBucket = keyof typeof COEF_BUCKETS;
export const COEF_KEYS = Object.keys(COEF_BUCKETS) as CoefBucket[];

// D: one tide cycle, from low water to low water, in eight parts: the stage and the way the
// tide goes, which a surfer says together ("mi-marée montante").
export const CYCLE = [
  "low",
  "mid_low_rising",
  "mid_rising",
  "mid_high_rising",
  "high",
  "mid_high_falling",
  "mid_falling",
  "mid_low_falling",
] as const;
export type CycleSegment = (typeof CYCLE)[number];
export const CYCLE_WORDS: Record<CycleSegment, string> = {
  low: "basse",
  mid_low_rising: "début de montante",
  mid_rising: "mi-marée montante",
  mid_high_rising: "fin de montante",
  high: "haute",
  mid_high_falling: "début de descendante",
  mid_falling: "mi-marée descendante",
  mid_low_falling: "fin de descendante",
};

/** What a case asks of the tide. Each variant reads its own fields and leaves the others. */
export type TideAsk = {
  // A, and the way of B
  height?: Range;
  trend?: Trend;
  // B, and C's moment
  stages?: TideStage[];
  // C and D
  coefs?: CoefBucket[];
  coefRange?: Range;
  // D
  cycle?: CycleSegment[];
};

/** One case of an alert: a whole sentence. An alert finds an hour that any case finds. */
export type Case = { id: number; criteria: AlertCriteria; tide: TideAsk };

export type Extreme = {
  time: Date;
  type: "high" | "low";
  heightMeters: number;
  coefficient: number | null;
};

/** What the tide is at a moment, as the four variants read it. */
export type TideContext = {
  height: number | null;
  trend: Trend | null;
  stage: TideStage | null;
  segment: CycleSegment | null;
  coefficient: number | null;
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * The tide at a moment between the extreme before and the one after: its stage is the fifth of
 * that tide's own range the height stands in, so that it follows the coefficient by itself.
 */
export function tideContextAt(time: Date, height: number | null, extremes: Extreme[]): TideContext {
  const at = time.getTime();
  const nextIndex = extremes.findIndex((one) => one.time.getTime() > at);
  const next = nextIndex === -1 ? undefined : extremes[nextIndex];
  const previous = nextIndex > 0 ? extremes[nextIndex - 1] : undefined;
  // The coefficient of the nearest high water, on a coast that has them.
  let coefficient: number | null = null;
  let distance = Infinity;
  for (const one of extremes) {
    if (one.type !== "high" || one.coefficient === null) continue;
    const away = Math.abs(one.time.getTime() - at);
    if (away < distance && away < 13 * HOUR_MS) {
      distance = away;
      coefficient = one.coefficient;
    }
  }
  if (!next || !previous || height === null) {
    return {
      height,
      trend: next ? (next.type === "high" ? "rising" : "falling") : null,
      stage: null,
      segment: null,
      coefficient,
    };
  }
  const trend: Trend = next.type === "high" ? "rising" : "falling";
  const low = Math.min(previous.heightMeters, next.heightMeters);
  const high = Math.max(previous.heightMeters, next.heightMeters);
  const part = high > low ? Math.min(1, Math.max(0, (height - low) / (high - low))) : 0.5;
  const stage =
    TIDE_STAGES[Math.min(TIDE_STAGES.length - 1, Math.floor(part * TIDE_STAGES.length))]!;
  const segment: CycleSegment =
    stage === "low" || stage === "high" ? stage : (`${stage}_${trend}` as CycleSegment);
  return { height, trend, stage, segment, coefficient };
}

const inRange = (value: number | null, range: Range | undefined) =>
  value !== null &&
  (range?.min === undefined || value >= range.min) &&
  (range?.max === undefined || value <= range.max);

const isSet = (range: Range | undefined) =>
  range !== undefined && (range.min !== undefined || range.max !== undefined);

function coefMeets(ask: TideAsk, coefficient: number | null) {
  if (isSet(ask.coefRange)) return inRange(coefficient, ask.coefRange);
  if (!ask.coefs?.length) return true;
  return ask.coefs.some((key) => inRange(coefficient, COEF_BUCKETS[key]));
}

/** Whether a case asks something of the tide, in the variant that reads it. */
export function asksTide(variant: TideVariant, ask: TideAsk) {
  switch (variant) {
    case "a":
      return isSet(ask.height) || ask.trend !== undefined;
    case "b":
      return Boolean(ask.stages?.length) || ask.trend !== undefined;
    case "c":
      return Boolean(ask.coefs?.length) || isSet(ask.coefRange) || Boolean(ask.stages?.length);
    case "d":
      return Boolean(ask.cycle?.length) || Boolean(ask.coefs?.length) || isSet(ask.coefRange);
  }
}

/** Whether the tide meets what a case asks of it. A case that asks nothing of it is met. */
export function tideMeets(variant: TideVariant, ask: TideAsk, tide: TideContext) {
  switch (variant) {
    case "a":
      return (
        (!isSet(ask.height) || inRange(tide.height, ask.height)) &&
        (ask.trend === undefined || tide.trend === ask.trend)
      );
    case "b":
      return (
        (!ask.stages?.length || (tide.stage !== null && ask.stages.includes(tide.stage))) &&
        (ask.trend === undefined || tide.trend === ask.trend)
      );
    case "c":
      return (
        coefMeets(ask, tide.coefficient) &&
        (!ask.stages?.length || (tide.stage !== null && ask.stages.includes(tide.stage)))
      );
    case "d":
      return (
        coefMeets(ask, tide.coefficient) &&
        (!ask.cycle?.length || (tide.segment !== null && ask.cycle.includes(tide.segment)))
      );
  }
}

/** Whether a case asks anything at all: one that asks nothing finds nothing. */
export function asksSomething(variant: TideVariant, one: Case) {
  return Object.keys(asked(one.criteria)).length > 0 || asksTide(variant, one.tide);
}

type Tried = AlertPreview["spots"][number];
export type JudgedHour = {
  time: Date;
  tide: TideContext;
  // The cases this hour meets, by their place in the list, from 0.
  cases: number[];
  waveHeightMeters: number | null;
  wavePeakPeriodSeconds: number | null;
  windSpeedMetersPerSecond: number | null;
};
export type Piece = { start: Date; end: Date; cases: number[]; first: JudgedHour };

/**
 * Every hour of the preview judged against each case, and the pieces an account would be told:
 * hours some case meets, inside the hours the API says the account can go (the preview was
 * asked with no condition and a one-hour window, so its `open` is that mask), as long as the
 * shortest window at least.
 */
export function judge(
  tried: Tried | undefined,
  cases: Case[],
  variant: TideVariant,
  extremes: Extreme[],
  shortestMinutes: number,
  now: number,
) {
  if (!tried?.hasSea) return { hours: [] as JudgedHour[], pieces: [] as Piece[] };
  const usable = (time: Date) =>
    tried.open.some((piece) => piece.start <= time && time < piece.end);
  const hours: JudgedHour[] = tried.hours
    .filter((hour) => hour.time.getTime() > now - HOUR_MS)
    .map((hour) => {
      const tide = tideContextAt(hour.time, hour.tideHeightMeters, extremes);
      const matched = cases.flatMap((one, index) => {
        if (!asksSomething(variant, one)) return [];
        const rest = asked(one.criteria);
        const { tideHeightMeters: _height, tideTrend: _trend, ...notTide } = rest;
        if (unmetCriteria(hour, notTide).length > 0) return [];
        if (asksTide(variant, one.tide)) {
          // Where no tide is known, a condition on it is not met.
          if (hour.tideHeightMeters === null) return [];
          if (!tideMeets(variant, one.tide, tide)) return [];
        }
        return [index];
      });
      return {
        time: hour.time,
        tide,
        cases: matched,
        waveHeightMeters: hour.waveHeightMeters,
        wavePeakPeriodSeconds: hour.wavePeakPeriodSeconds,
        windSpeedMetersPerSecond: hour.windSpeedMetersPerSecond,
      };
    });

  const pieces: Piece[] = [];
  let run: JudgedHour[] = [];
  const close = () => {
    if (run.length * 60 >= shortestMinutes) {
      const first = run[0]!;
      const last = run.at(-1)!;
      pieces.push({
        start: first.time,
        end: new Date(last.time.getTime() + HOUR_MS),
        cases: [...new Set(run.flatMap((hour) => hour.cases))].sort(),
        first,
      });
    }
    run = [];
  };
  for (const hour of hours) {
    const previous = run.at(-1);
    const follows = previous && hour.time.getTime() - previous.time.getTime() === HOUR_MS;
    if (hour.cases.length > 0 && usable(hour.time)) {
      if (previous && !follows) close();
      run.push(hour);
    } else close();
  }
  close();
  return { hours, pieces: pieces.filter((piece) => piece.end.getTime() > now) };
}

/** The mean low and high water over the extremes given: what A's quick choices are cut from. */
export function meanRange(extremes: Extreme[]) {
  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  const low = mean(extremes.filter((one) => one.type === "low").map((one) => one.heightMeters));
  const high = mean(extremes.filter((one) => one.type === "high").map((one) => one.heightMeters));
  return low !== undefined && high !== undefined && high > low ? { low, high } : undefined;
}

/**
 * A's quick choice: the heights of some stages on the week's mean tide. Open at the bottom for a
 * choice that takes low water, and at the top for one that takes high water.
 */
export function heightsOfStages(stages: TideStage[], range: { low: number; high: number }) {
  const indexes = stages.map((stage) => TIDE_STAGES.indexOf(stage)).sort();
  if (indexes.length === 0) return undefined;
  const first = indexes[0]!;
  const last = indexes.at(-1)!;
  const fifth = (range.high - range.low) / TIDE_STAGES.length;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    ...(first === 0 ? {} : { min: round(range.low + first * fifth) }),
    ...(last === TIDE_STAGES.length - 1 ? {} : { max: round(range.low + (last + 1) * fifth) }),
  };
}

/** D's segments for stages: both ways for the middle ones. */
export function cycleOfStages(stages: TideStage[]): CycleSegment[] {
  return CYCLE.filter((segment) => stages.includes(stageOfSegment(segment)));
}

export function stageOfSegment(segment: CycleSegment): TideStage {
  return segment.replace(/_(rising|falling)$/, "") as TideStage;
}

/** The coefficient of each day ahead: its largest, on a coast that has them. */
export function coefficientsByDay(extremes: Extreme[], dayOf: (time: Date) => string) {
  const days = new Map<string, number>();
  for (const one of extremes) {
    if (one.coefficient === null) continue;
    const day = dayOf(one.time);
    days.set(day, Math.max(days.get(day) ?? 0, one.coefficient));
  }
  return [...days.entries()];
}
