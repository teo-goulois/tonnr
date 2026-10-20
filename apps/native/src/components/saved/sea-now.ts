import type { AppRouterClient } from "@repo/api/routers/index";
import { toKnots } from "@repo/client/format";
import { periodOf } from "@repo/client/viewer/types";
import type { ShoreWind } from "@repo/conditions/shore-wind";

// What the sea does now at the places a screen lists, from `places.now`: one call names twelve
// places at most, breaks, stations and spots together, and asks the forecast provider nothing
// (decision 074). Each row asks for its own place, and the asks of one moment leave together,
// twelve to a call. A module that reads no React and no phone, so that a test reads it.

type V1 = AppRouterClient["v1"];
/** What `places.now` is asked: the ids of each kind, between them twelve at most. */
export type PlacesNowInput = { breakIds?: string[]; stationIds?: string[]; spotIds?: string[] };
export type PlacesNow = Awaited<ReturnType<V1["places"]["now"]>>;
export type SeaNow = PlacesNow["places"][number];
export type PlaceKind = SeaNow["place"]["kind"];

/** A place a screen names: a surf break of the catalogue, a station, or a spot of an account's. */
export type PlaceRef = { kind: PlaceKind; id: string };

/** How many places one call of `places.now` names: decision 074. The API refuses more. */
export const PLACES_AT_ONCE = 12;

export const keyOf = (ref: PlaceRef) => `${ref.kind}:${ref.id}`;

export const sameRef = (one: PlaceRef, other: PlaceRef) =>
  one.kind === other.kind && one.id === other.id;

/** The places once each, in the order they were first named, twelve to a call. */
export function chunksOf(refs: readonly PlaceRef[], size = PLACES_AT_ONCE): PlaceRef[][] {
  const seen = new Set<string>();
  const once = refs.filter((ref) => {
    const key = keyOf(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const chunks: PlaceRef[][] = [];
  for (let start = 0; start < once.length; start += size) {
    chunks.push(once.slice(start, start + size));
  }
  return chunks;
}

/** What `places.now` is asked for these places: the ids of each kind, and no empty list. */
export function inputOf(refs: readonly PlaceRef[]): PlacesNowInput {
  const ids = (kind: PlaceKind) => refs.filter((ref) => ref.kind === kind).map((ref) => ref.id);
  const breakIds = ids("break");
  const stationIds = ids("station");
  const spotIds = ids("spot");
  return {
    ...(breakIds.length > 0 && { breakIds }),
    ...(stationIds.length > 0 && { stationIds }),
    ...(spotIds.length > 0 && { spotIds }),
  };
}

/**
 * What an answer says of one place, with the moment it was made. Null for a place it left out:
 * one that does not exist any more, or a spot the caller does not read.
 */
export type Told = { at: Date; sea: SeaNow } | null;

export function toldOf(answer: PlacesNow, ref: PlaceRef): Told {
  const sea = answer.places.find((one) => one.place.kind === ref.kind && one.place.id === ref.id);
  return sea ? { at: answer.at, sea } : null;
}

type Waiting = { ref: PlaceRef; resolve: (told: Told) => void; reject: (error: unknown) => void };

/**
 * Asks `places.now` for places as they are asked for one by one, in as few calls as it can: the
 * asks of one moment, `wait` milliseconds long, leave together, twelve to a call. A call that
 * fails fails the places it named, and no other.
 */
export function createSeaNowLoader(
  ask: (input: PlacesNowInput) => Promise<PlacesNow>,
  { wait = 16 }: { wait?: number } = {},
) {
  let waiting: Waiting[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    const batch = waiting;
    waiting = [];
    timer = null;
    for (const chunk of chunksOf(batch.map((one) => one.ref))) {
      const waiters = batch.filter((one) => chunk.some((ref) => sameRef(ref, one.ref)));
      ask(inputOf(chunk)).then(
        (answer) => {
          for (const one of waiters) one.resolve(toldOf(answer, one.ref));
        },
        (error: unknown) => {
          for (const one of waiters) one.reject(error);
        },
      );
    }
  }

  return function load(ref: PlaceRef): Promise<Told> {
    return new Promise<Told>((resolve, reject) => {
      waiting.push({ ref, resolve, reject });
      timer ??= setTimeout(flush, wait);
    });
  };
}

type Hour = NonNullable<SeaNow["forecast"]>["hours"][number];
type Extreme = NonNullable<SeaNow["tide"]>["extremes"][number];

/** The hour of the forecast that is under way at `at`: the last that has begun, else the first. */
export function hourNowOf(hours: readonly Hour[], at: Date): Hour | null {
  let now: Hour | null = null;
  for (const hour of hours) {
    if (hour.time.getTime() <= at.getTime()) now = hour;
    else break;
  }
  return now ?? hours[0] ?? null;
}

/** What a row says of the sea at a place, each figure null where nothing says it. */
export type SeaFigures = {
  heightMeters: number | null;
  periodSeconds: number | null;
  /** Where the waves come from, clockwise from north. */
  wavesFromDegrees: number | null;
  windKnots: number | null;
  windFromDegrees: number | null;
  /** How the wind meets the shore, where the place knows its offshore bearing. */
  atShore: ShoreWind | null;
  /**
   * Where the waves' figures come from: the hour of the forecast that is kept, or what a buoy
   * measured, at `observedAt`. Null when nothing says them.
   */
  from: "forecast" | "measured" | null;
  observedAt: Date | null;
  /** The next high or low of the tide after `at`. */
  nextTide: Extreme | null;
};

/**
 * The sea at a place now, as a row says it. A station says what it measured itself, and nothing
 * else: a buoy that stopped says so. A break or a spot says the hour of the forecast that is
 * kept, and what its nearest buoy and wind station measured when no forecast is kept.
 */
export function seaFiguresOf(sea: SeaNow, at: Date): SeaFigures {
  const nextTide =
    sea.tide?.extremes.find((extreme) => extreme.time.getTime() > at.getTime()) ?? null;

  if (sea.place.kind === "station") {
    const waves = sea.waves?.id === sea.place.id ? sea.waves.latestReading : null;
    const wind = sea.wind?.id === sea.place.id ? sea.wind : null;
    const windReading = wind?.latestReading ?? waves;
    const height = waves?.significantHeightMeters ?? null;
    return {
      heightMeters: height,
      periodSeconds: periodOf(waves),
      wavesFromDegrees: waves?.peakDirectionDegrees ?? null,
      windKnots: toKnots(windReading?.windSpeedMetersPerSecond),
      windFromDegrees: windReading?.windDirectionDegrees ?? null,
      atShore: wind?.atShore ?? null,
      from: waves && height !== null ? "measured" : null,
      observedAt: waves?.observedAt ?? windReading?.observedAt ?? null,
      nextTide,
    };
  }

  const hour = sea.forecast ? hourNowOf(sea.forecast.hours, at) : null;
  if (hour && hour.waveHeightMeters !== null) {
    return {
      heightMeters: hour.waveHeightMeters,
      periodSeconds: hour.wavePeakPeriodSeconds ?? hour.wavePeriodSeconds,
      wavesFromDegrees: hour.waveDirectionDegrees,
      windKnots: toKnots(hour.windSpeedMetersPerSecond),
      windFromDegrees: hour.windDirectionDegrees,
      atShore: hour.atShore,
      from: "forecast",
      observedAt: null,
      nextTide,
    };
  }

  // No forecast kept for the place's cell today: what was measured near it, as its page says.
  const waves = sea.waves?.latestReading ?? null;
  const wind = sea.wind;
  const height = waves?.significantHeightMeters ?? null;
  return {
    heightMeters: height,
    periodSeconds: periodOf(waves),
    wavesFromDegrees: waves?.peakDirectionDegrees ?? null,
    windKnots: toKnots(wind?.latestReading.windSpeedMetersPerSecond),
    windFromDegrees: wind?.latestReading.windDirectionDegrees ?? null,
    atShore: wind?.atShore ?? null,
    from: height !== null ? "measured" : null,
    observedAt: waves?.observedAt ?? null,
    nextTide,
  };
}
