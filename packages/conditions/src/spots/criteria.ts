import {
  COEFFICIENT_BANDS,
  TIDE_CYCLE,
  TIDE_STAGES,
  type TideSegment,
  coefficientBand,
  segmentOf,
} from "@repo/config/sea-words";
import type { CriteriaAlternatives, SpotCriteria, TideAsk } from "@repo/db/schema/spots";
import { z } from "zod";

function range(min: number, max: number) {
  return z
    .object({
      min: z.number().min(min).max(max).optional(),
      max: z.number().min(min).max(max).optional(),
    })
    .refine(
      (value) => value.min === undefined || value.max === undefined || value.min <= value.max,
      {
        message: "min must not be greater than max",
      },
    );
}

const arc = z.object({
  from: z.number().min(0).max(360),
  to: z.number().min(0).max(360),
});

// Each named once, in any order: they are read as a set.
const setOf = <Word extends string>(words: readonly [Word, ...Word[]]) =>
  z
    .array(z.enum(words))
    .max(words.length)
    .refine((chosen) => new Set(chosen).size === chosen.length, "each is named once");

const HOUR_MS = 60 * 60 * 1000;

/** The most other values a part of an alert's conditions takes, beside its own. */
export const MAX_ALTERNATIVES = 3;

const ranges = {
  waveHeightMeters: range(0, 30),
  wavePeakPeriodSeconds: range(0, 40),
  primarySwellHeightMeters: range(0, 30),
  windSpeedMetersPerSecond: range(0, 120),
  tideHeightMeters: range(-5, 20),
};
const tideAskSchema = z.strictObject({
  tideHeightMeters: ranges.tideHeightMeters.optional(),
  tideTrend: z.enum(["rising", "falling"]).optional(),
  tideCycle: setOf(TIDE_CYCLE)
    .describe(
      "The parts of the tide's cycle that will do, from low water through high water and " +
        "back: each middle stage is named with the way the tide goes.",
    )
    .optional(),
  tideCoefficients: setOf(COEFFICIENT_BANDS)
    .describe(
      "How strong the tide may be, by its coefficient: `small` under 70, `medium` from 70 " +
        "to 90, `big` over 90. Met nowhere a coast's tables print no coefficient.",
    )
    .optional(),
});
const others = <Schema extends z.ZodType>(schema: Schema) =>
  z.array(schema).max(MAX_ALTERNATIVES).optional();

export const criteriaSchema = z.strictObject({
  waveHeightMeters: ranges.waveHeightMeters.optional(),
  wavePeakPeriodSeconds: ranges.wavePeakPeriodSeconds.optional(),
  waveDirectionDegrees: arc.optional(),
  primarySwellHeightMeters: ranges.primarySwellHeightMeters.optional(),
  primarySwellDirectionDegrees: arc.optional(),
  windSpeedMetersPerSecond: ranges.windSpeedMetersPerSecond.optional(),
  windDirectionDegrees: arc.optional(),
  ...tideAskSchema.shape,
  or: z
    .strictObject({
      waveHeightMeters: others(ranges.waveHeightMeters),
      wavePeakPeriodSeconds: others(ranges.wavePeakPeriodSeconds),
      waveDirectionDegrees: others(arc),
      primarySwellHeightMeters: others(ranges.primarySwellHeightMeters),
      primarySwellDirectionDegrees: others(arc),
      windSpeedMetersPerSecond: others(ranges.windSpeedMetersPerSecond),
      windDirectionDegrees: others(arc),
      tide: others(tideAskSchema),
    })
    .describe(
      "Other values of a part, any of which will do as well as the part's own: three at " +
        "most. The tide's are whole asks of the tide.",
    )
    .optional(),
}) satisfies z.ZodType<SpotCriteria>;

/** A condition an hour may not meet: every key of the conditions but their other values. */
export const CRITERIA_KEYS = [
  "waveHeightMeters",
  "wavePeakPeriodSeconds",
  "waveDirectionDegrees",
  "primarySwellHeightMeters",
  "primarySwellDirectionDegrees",
  "windSpeedMetersPerSecond",
  "windDirectionDegrees",
  "tideHeightMeters",
  "tideTrend",
  "tideCycle",
  "tideCoefficients",
] as const satisfies readonly Exclude<keyof SpotCriteria, "or">[];
export type Criterion = (typeof CRITERIA_KEYS)[number];

/** The parts of the conditions that take other values, the tide's being one part. */
export type Part = keyof CriteriaAlternatives;
export const TIDE_KEYS = [
  "tideHeightMeters",
  "tideTrend",
  "tideCycle",
  "tideCoefficients",
] as const satisfies readonly (keyof TideAsk)[];
type ValueKey = Exclude<Part, "tide">;
const VALUE_KEYS: readonly ValueKey[] = [
  "waveHeightMeters",
  "wavePeakPeriodSeconds",
  "waveDirectionDegrees",
  "primarySwellHeightMeters",
  "primarySwellDirectionDegrees",
  "windSpeedMetersPerSecond",
  "windDirectionDegrees",
];

// Whether a value asks something: a range with an end, a sector, a word, a set with a word in
// it that is not every word.
function asks(key: Criterion, value: unknown) {
  if (value === undefined) return false;
  if (typeof value === "string") return true;
  if (Array.isArray(value)) {
    const whole = key === "tideCycle" ? TIDE_CYCLE.length : COEFFICIENT_BANDS.length;
    return value.length > 0 && value.length < whole;
  }
  return Object.values(value as object).some((end) => end !== undefined);
}

/** What of an ask of the tide asks something. Empty when nothing does. */
export function tideAskOf(ask: TideAsk): TideAsk {
  return Object.fromEntries(
    TIDE_KEYS.flatMap((key) => (asks(key, ask[key]) ? [[key, ask[key]]] : [])),
  );
}

/**
 * The conditions as they are kept: a value that asks nothing is left out, a range with no end,
 * a set of every word or of none, and so is an other value that asks nothing. A part whose own
 * value asks nothing takes its first other value as its own. The same conditions in another
 * order come out the same.
 */
export function askedCriteria(criteria: SpotCriteria): SpotCriteria {
  const kept: SpotCriteria = {};
  const or: CriteriaAlternatives = {};
  for (const key of VALUE_KEYS) {
    const values = [criteria[key], ...(criteria.or?.[key] ?? [])].filter((value) =>
      asks(key, value),
    );
    const [first, ...rest] = values;
    if (first === undefined) continue;
    Object.assign(kept, { [key]: first });
    if (rest.length > 0) Object.assign(or, { [key]: rest });
  }
  const tides = [tideAskOf(criteria), ...(criteria.or?.tide ?? []).map(tideAskOf)].filter(
    (ask) => Object.keys(ask).length > 0,
  );
  const [tide, ...otherTides] = tides;
  if (tide) Object.assign(kept, tide);
  if (otherTides.length > 0) or.tide = otherTides;
  // The sets in the order of their words, so that two that hold the same are the same.
  for (const ask of [kept, ...(or.tide ?? [])]) {
    if (ask.tideCycle) ask.tideCycle = TIDE_CYCLE.filter((one) => ask.tideCycle?.includes(one));
    if (ask.tideCoefficients) {
      ask.tideCoefficients = COEFFICIENT_BANDS.filter((one) => ask.tideCoefficients?.includes(one));
    }
  }
  if (Object.keys(or).length > 0) kept.or = or;
  return kept;
}

/** Whether conditions ask something of the swell apart from the wind sea. */
export function asksSwell(criteria: SpotCriteria) {
  return (
    criteria.primarySwellHeightMeters !== undefined ||
    criteria.primarySwellDirectionDegrees !== undefined ||
    (criteria.or?.primarySwellHeightMeters?.length ?? 0) > 0 ||
    (criteria.or?.primarySwellDirectionDegrees?.length ?? 0) > 0
  );
}

/** Whether conditions ask something of the tide, in any of their values. */
export function asksTide(criteria: SpotCriteria) {
  return Object.keys(tideAskOf(criteria)).length > 0 || (criteria.or?.tide?.length ?? 0) > 0;
}

/** What is known about the sea at a spot for one hour. Null is a value nobody could give. */
export type HourConditions = {
  time: Date;
  waveHeightMeters: number | null;
  wavePeakPeriodSeconds: number | null;
  waveDirectionDegrees: number | null;
  // The first swell apart from the wind sea. The three above are the whole sea, with the
  // period of its peak: null where the model gives no peak period, and a condition on it is
  // then not met.
  primarySwellHeightMeters: number | null;
  primarySwellDirectionDegrees: number | null;
  windSpeedMetersPerSecond: number | null;
  windDirectionDegrees: number | null;
  tideHeightMeters: number | null;
  tideTrend: "rising" | "falling" | null;
  // The part of the tide's cycle, and the coefficient of the nearest high water, on a coast
  // whose tables print one: null elsewhere.
  tideSegment: TideSegment | null;
  tideCoefficient: number | null;
};

function isInRange(value: number | null, { min, max }: { min?: number; max?: number }) {
  return (
    value !== null && (min === undefined || value >= min) && (max === undefined || value <= max)
  );
}

/** Whether a direction lies in the sector that runs clockwise from `from` to `to`. */
export function isInArc(degrees: number | null, { from, to }: { from: number; to: number }) {
  if (degrees === null) return false;
  const direction = ((degrees % 360) + 360) % 360;
  const start = from % 360;
  const end = to % 360;
  // A sector whose two ends meet covers the whole compass.
  if (start === end) return true;
  return start < end
    ? direction >= start && direction <= end
    : direction >= start || direction <= end;
}

// Whether an hour meets one value of a part.
function meets(hour: HourConditions, key: ValueKey, value: unknown) {
  switch (key) {
    case "waveDirectionDegrees":
    case "primarySwellDirectionDegrees":
    case "windDirectionDegrees":
      return isInArc(hour[key], value as { from: number; to: number });
    default:
      return isInRange(hour[key], value as { min?: number; max?: number });
  }
}

/** What of an ask of the tide an hour does not meet. */
function unmetTide(hour: HourConditions, ask: TideAsk): Criterion[] {
  const unmet: Criterion[] = [];
  if (ask.tideHeightMeters && !isInRange(hour.tideHeightMeters, ask.tideHeightMeters)) {
    unmet.push("tideHeightMeters");
  }
  if (ask.tideTrend && hour.tideTrend !== ask.tideTrend) unmet.push("tideTrend");
  if (ask.tideCycle && (hour.tideSegment === null || !ask.tideCycle.includes(hour.tideSegment))) {
    unmet.push("tideCycle");
  }
  if (
    ask.tideCoefficients &&
    (hour.tideCoefficient === null ||
      !ask.tideCoefficients.includes(coefficientBand(hour.tideCoefficient)))
  ) {
    unmet.push("tideCoefficients");
  }
  return unmet;
}

/**
 * The criteria an hour does not meet. An empty list means the spot works at that hour.
 * A criterion on a value that is unknown counts as not met. A part with other values is met
 * when one of them is, and named by its key when none is. The tide is met when one of its asks
 * is met whole: when none is, the hour is said not to meet what its first ask does not.
 */
export function unmetCriteria(hour: HourConditions, criteria: SpotCriteria): Criterion[] {
  const unmet: Criterion[] = [];
  for (const key of VALUE_KEYS) {
    const values = [criteria[key], ...(criteria.or?.[key] ?? [])].filter(
      (value) => value !== undefined,
    );
    if (values.length > 0 && !values.some((value) => meets(hour, key, value))) unmet.push(key);
  }
  const tides = [tideAskOf(criteria), ...(criteria.or?.tide ?? []).map(tideAskOf)].filter(
    (ask) => Object.keys(ask).length > 0,
  );
  const missed = tides.map((ask) => unmetTide(hour, ask));
  if (missed.length > 0 && missed.every((one) => one.length > 0)) unmet.push(...missed[0]!);
  return unmet;
}

// A coefficient is the high water's, and is read for the hours around it: no further than half
// a day, on a coast with two tides a day.
const COEFFICIENT_REACH_MS = 13 * HOUR_MS;

type TideExtreme = {
  time: Date;
  type: "high" | "low";
  heightMeters: number;
  coefficient?: number | null;
};

/**
 * Where the tide stands at a moment, in its cycle: the stage is the fifth of the range of the
 * tide under way, between the turn before and the turn after, so that it follows how strong
 * the tide is by itself. Null without both turns or the height.
 */
export function tideSegmentAt(
  time: Date,
  heightMeters: number | null,
  extremes: readonly TideExtreme[],
): TideSegment | null {
  if (heightMeters === null) return null;
  const at = time.getTime();
  const nextIndex = extremes.findIndex((one) => one.time.getTime() > at);
  if (nextIndex < 1) return null;
  const next = extremes[nextIndex]!;
  const previous = extremes[nextIndex - 1]!;
  const low = Math.min(previous.heightMeters, next.heightMeters);
  const high = Math.max(previous.heightMeters, next.heightMeters);
  if (high <= low) return null;
  const part = Math.min(1, Math.max(0, (heightMeters - low) / (high - low)));
  const stage =
    TIDE_STAGES[Math.min(TIDE_STAGES.length - 1, Math.floor(part * TIDE_STAGES.length))]!;
  return segmentOf(stage, next.type === "high" ? "rising" : "falling");
}

/** The coefficient of the high water nearest a moment, within half a day. Null on a coast
 * whose tables print none. */
export function coefficientAt(time: Date, extremes: readonly TideExtreme[]): number | null {
  let nearest: number | null = null;
  let distance = COEFFICIENT_REACH_MS;
  for (const one of extremes) {
    if (one.type !== "high" || one.coefficient == null) continue;
    const away = Math.abs(one.time.getTime() - time.getTime());
    if (away < distance) {
      distance = away;
      nearest = one.coefficient;
    }
  }
  return nearest;
}

/**
 * Whether the tide is rising or falling at a moment: it rises toward the next high water and
 * falls toward the next low water. Comparing two heights an hour apart would get it wrong around
 * a turn of the tide. Null when no later tide is known.
 */
export function tideTrendAt(time: Date, extremes: readonly { time: Date; type: "high" | "low" }[]) {
  const next = extremes.find((extreme) => extreme.time > time);
  if (!next) return null;
  return next.type === "high" ? ("rising" as const) : ("falling" as const);
}

/**
 * The periods during which every hour works. `hours` are consecutive and one hour apart, and a
 * window ends one hour after its last working hour.
 */
export function findWindows(hours: { time: Date; unmet: readonly Criterion[] }[]) {
  const windows: { start: Date; end: Date }[] = [];
  let start: Date | null = null;
  let previous: Date | null = null;

  for (const hour of hours) {
    const works = hour.unmet.length === 0;
    const follows = previous !== null && hour.time.getTime() - previous.getTime() === HOUR_MS;

    if (start && previous && (!works || !follows)) {
      windows.push({ start, end: new Date(previous.getTime() + HOUR_MS) });
      start = null;
    }
    if (works && !start) start = hour.time;
    previous = works ? hour.time : null;
  }
  if (start && previous) windows.push({ start, end: new Date(previous.getTime() + HOUR_MS) });

  return windows;
}
