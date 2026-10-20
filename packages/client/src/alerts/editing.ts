import { type Part, tideSegmentAt } from "@repo/conditions/spots/criteria";
import type { TideSegment } from "@repo/config/sea-words";

import type { AlertCriteria, AlertPreview } from "../viewer/types";
import {
  type Arc,
  type Range,
  type TideAsk,
  asksOfTide,
  isSetRange,
  tideOf,
  withTide,
} from "./alert-words";
import type { TidePoint } from "./tide-band";

// What an alert's editor does with the parts of its sentence, the same on a page and on a phone:
// which values a part holds, how one is set, how long the tide asked lasts, and what the week
// ahead is said in. Each app draws it its own way. Decision 031, "The editor".

/** The shortest windows an alert may ask for, in hours. */
export const SHORTEST_HOURS = [1, 2, 3, 4, 6] as const;

/** The most places an alert holds, spots and breaks together: decisions 031 and 064. */
export const PLACES_MOST = 12;

/** The parts of the sentence, in the order it says them: a new alert says them one at a time. */
export const STEPS = [
  "waveHeightMeters",
  "wavePeakPeriodSeconds",
  "waveDirectionDegrees",
  "windSpeedMetersPerSecond",
  "windDirectionDegrees",
  "tide",
  "shortest",
] as const;
export type Step = (typeof STEPS)[number];

/** A part whose values are ranges or sectors: every part but the tide. */
export type ValuePart = Exclude<Part, "tide">;

const ARC_PARTS: readonly Part[] = [
  "waveDirectionDegrees",
  "primarySwellDirectionDegrees",
  "windDirectionDegrees",
];

/** Whether a part's values are sectors of the compass. */
export const isArcPart = (key: Part) => ARC_PARTS.includes(key);

/** A value of a part: its own first, at 0, then its others, as they are written. */
export function valueAt(criteria: AlertCriteria, key: ValuePart, index: number) {
  return (index === 0 ? criteria[key] : criteria.or?.[key]?.[index - 1]) as Range | Arc | undefined;
}

/** An ask of the tide: its own first, at 0, then its others. */
export function tideAt(criteria: AlertCriteria, index: number): TideAsk {
  return index === 0 ? tideOf(criteria) : (criteria.or?.tide?.[index - 1] ?? {});
}

/** How many other values a part holds. */
export const othersOf = (criteria: AlertCriteria, key: Part) => (criteria.or?.[key] ?? []).length;

/** Whether a value of a part asks something. */
export function isSetValue(criteria: AlertCriteria, key: Part, index: number) {
  if (key === "tide") return asksOfTide(tideAt(criteria, index));
  const value = valueAt(criteria, key, index);
  return isArcPart(key) ? value !== undefined : isSetRange(value as Range | undefined);
}

/**
 * The conditions once a value of a part is set. Its own value set to nothing leaves the whole
 * part asking nothing: "any size" is no size, whatever else was said. An other value set to
 * nothing goes. A value that is being moved, by a slider or a dial, keeps its place and the
 * part's others with it, whatever it says meanwhile.
 */
export function withValue(
  criteria: AlertCriteria,
  key: Part,
  index: number,
  value: unknown,
  moving = false,
): AlertCriteria {
  const others = [...((criteria.or?.[key] ?? []) as unknown[])];
  const ownGone = (): AlertCriteria =>
    key === "tide" ? withTide(criteria, {}) : { ...criteria, [key]: undefined };
  if (moving && value === undefined) {
    if (index > 0) value = {};
    else return ownGone();
  }
  if (index === 0 && value === undefined) {
    const { [key]: _gone, ...rest } = criteria.or ?? {};
    return { ...ownGone(), or: rest };
  }
  if (index === 0) {
    return key === "tide"
      ? withTide(criteria, value as TideAsk)
      : ({ ...criteria, [key]: value } as AlertCriteria);
  }
  if (value === undefined) others.splice(index - 1, 1);
  else others[index - 1] = value;
  return { ...criteria, or: { ...criteria.or, [key]: others } } as AlertCriteria;
}

/** The asks of the tide that ask something: its own, then its others. */
export function tideAsksOf(criteria: AlertCriteria) {
  return [tideOf(criteria), ...(criteria.or?.tide ?? [])].filter(asksOfTide);
}

type Extremes = Parameters<typeof tideSegmentAt>[2];

const QUARTER_MS = 15 * 60 * 1000;

/**
 * How long the parts of the cycle asked last, at their longest over the tide given, to the
 * quarter hour: a window cannot be longer, so a shortest window above it never comes. Null when
 * no part of the cycle is asked, or no run of it is whole in what is given.
 */
export function tideLastsOf(
  asks: readonly TideAsk[],
  tide: readonly TidePoint[],
  extremes: Extremes,
) {
  const cycles = asks.flatMap((ask) => (ask.tideCycle ? [ask.tideCycle] : []));
  if (cycles.length === 0 || tide.length < 2) return null;
  let longest = 0;
  let start: number | null = null;
  for (const point of tide) {
    const segment = tideSegmentAt(point.time, point.value, extremes);
    const meets = segment !== null && cycles.some((cycle) => cycle.includes(segment));
    const at = point.time.getTime();
    if (meets && start === null) start = at;
    if (!meets && start !== null) {
      longest = Math.max(longest, at - start);
      start = null;
    }
  }
  return longest > 0 ? Math.round(longest / QUARTER_MS) * 15 : null;
}

/** The longest of the shortest windows offered that the tide leaves room for. */
export function longestFitting(tideLasts: number | null) {
  return [...SHORTEST_HOURS]
    .reverse()
    .find((hours) => tideLasts !== null && hours * 60 <= tideLasts);
}

/** What an alert asks, so that a window says those figures and no other. */
export type Asked = {
  waves: boolean;
  period: boolean;
  swell: boolean;
  wind: boolean;
  tide: boolean;
  coefficient: boolean;
};

/** The figures the conditions ask for, as they are sent. */
export function askedFiguresOf(sent: AlertCriteria): Asked {
  const asks = (key: ValuePart) =>
    [sent[key], ...(sent.or?.[key] ?? [])].some((value) => value !== undefined);
  const tide = tideAsksOf(sent);
  return {
    waves: asks("waveHeightMeters"),
    period: asks("wavePeakPeriodSeconds"),
    swell: asks("primarySwellHeightMeters"),
    wind: asks("windSpeedMetersPerSecond"),
    tide: tide.some((ask) => ask.tideCycle || ask.tideHeightMeters || ask.tideTrend !== undefined),
    coefficient: tide.some((ask) => ask.tideCoefficients),
  };
}

type Tried = AlertPreview["spots"][number];

/** Where what the sentence would tell stands: nothing asked, failed, no sea, coming, or ready. */
export type WeekState = "nothing" | "failed" | "noSea" | "pending" | "ready";

export function weekStateOf({
  asksSomething,
  failed,
  tried,
}: {
  asksSomething: boolean;
  failed: boolean;
  tried: readonly Tried[];
}): WeekState {
  if (!asksSomething) return "nothing";
  if (failed) return "failed";
  if (tried.length === 0) return "pending";
  if (!tried.some((one) => one.hasSea)) return "noSea";
  return "ready";
}

const HOUR_MS = 60 * 60 * 1000;
const DAYS = 7;

type Hour = Tried["hours"][number];

/** A window an account would be told of, at one of the alert's places. */
export type WeekPiece = { start: Date; end: Date; spotId: string; hours: Hour[] };

/** The hour of a moment in a zone, from 0 to 24, with its minutes as a fraction. */
export function hourIn(time: Date, zone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(time);
  const of = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return of("hour") + of("minute") / 60;
}

/**
 * The seven days from today, each with the windows that start on it. `dayOf` writes a day as
 * the app does, in the zone: it is what tells two days apart.
 */
export function weekDays<Piece extends { start: Date }>(
  pieces: readonly Piece[],
  now: number,
  zone: string | undefined,
  dayOf: (time: Date, zone: string | undefined) => string,
) {
  const days: { key: string; pieces: Piece[] }[] = [];
  for (let at = 0; at < DAYS; at++) {
    days.push({ key: dayOf(new Date(now + at * 24 * HOUR_MS), zone), pieces: [] });
  }
  for (const piece of pieces) {
    days.find((day) => day.key === dayOf(piece.start, zone))?.pieces.push(piece);
  }
  return days;
}

/** How each figure of a window is written, in the app's units and language. */
export type FigureWriters = {
  height: (meters: number) => string;
  seconds: (seconds: number) => string;
  swell: (meters: number) => string;
  wind: (metersPerSecond: number) => string;
  segment: (segment: TideSegment) => string;
  coefficient: (value: number) => string;
};

/** The least and the most of some figures, once: "1.2 m → 1.6 m". */
function spread(values: number[], say: (value: number) => string) {
  if (values.length === 0) return undefined;
  const least = Math.min(...values);
  const most = Math.max(...values);
  return least === most ? say(least) : `${say(least)} → ${say(most)}`;
}

/** What a window was, in the figures the alert asks and no other. */
export function pieceFigures(piece: WeekPiece, asked: Asked, write: FigureWriters) {
  const inside = piece.hours.filter((hour) => hour.time >= piece.start && hour.time < piece.end);
  const of = (read: (hour: Hour) => number | null | undefined) =>
    inside.flatMap((hour) => read(hour) ?? []);
  const segments = [
    ...new Set(
      inside.flatMap((hour): TideSegment[] => (hour.tideSegment ? [hour.tideSegment] : [])),
    ),
  ];
  const coefficient = inside.find((hour) => hour.tideCoefficient !== null)?.tideCoefficient;
  return [
    asked.waves &&
      spread(
        of((hour) => hour.waveHeightMeters),
        write.height,
      ),
    asked.period &&
      spread(
        of((hour) => hour.wavePeakPeriodSeconds),
        write.seconds,
      ),
    asked.swell &&
      spread(
        of((hour) => hour.primarySwellHeightMeters),
        write.swell,
      ),
    asked.wind &&
      spread(
        of((hour) => hour.windSpeedMetersPerSecond),
        write.wind,
      ),
    asked.tide &&
      segments.length > 0 &&
      (segments.length === 1
        ? write.segment(segments[0]!)
        : `${write.segment(segments[0]!)} → ${write.segment(segments.at(-1)!)}`),
    asked.coefficient && coefficient != null && write.coefficient(coefficient),
  ].filter((figure): figure is string => typeof figure === "string" && figure !== "");
}
