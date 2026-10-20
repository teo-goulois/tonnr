import type { AppRouterClient } from "@repo/api/routers/index";
import type { SessionPlace } from "@repo/client/sessions/types";

import { MOST_MINUTES, isAhead, placeOfParam, placeParam, withinLengths } from "./session-logic";

// A session timed while it lasts: decision 074, "A session in progress". The phone keeps its
// place and its start, and nothing tells the API that it runs, until it is written as decision 043
// writes a session. What follows reads no clock, no phone and no storage: the screens give it the
// moment and what the phone kept.

const MINUTE_MS = 60 * 1000;

/**
 * The longest a session runs: the longest length the session form of decision 043 offers, eight
 * hours, which is when iOS ends a Live Activity too.
 */
export const LONGEST_MS = MOST_MINUTES * MINUTE_MS;

type PlaceNow = Awaited<ReturnType<AppRouterClient["v1"]["places"]["now"]>>["places"][number];

/** The next high and the next low after the start, as `places.now` computed them. */
export type LiveTide = { at: number; heightMeters: number };

/** The wind the nearest station measured as the session began, with when and how it meets the shore. */
export type LiveWind = {
  at: number;
  speedMetersPerSecond: number | null;
  gustMetersPerSecond: number | null;
  directionDegrees: number | null;
  atShore: string | null;
};

/** What the sea did at the start, read once from `places.now`, which the activity shows. */
export type LiveFigures = { high: LiveTide | null; low: LiveTide | null; wind: LiveWind | null };

/** A session in progress, as the phone keeps it. */
export type LiveSession = {
  place: SessionPlace;
  startedAt: number;
  // When it was ended, from the activity, the notification or the app: absent while it runs.
  endedAt?: number;
  // Null when `places.now` did not answer at the start: the activity then shows the place and
  // the time alone.
  figures: LiveFigures | null;
  // Whether the phone showed it outside the app as it began: its Live Activity, or its Live
  // Update on Android. False where the system did not let the app.
  shown: boolean;
};

/**
 * What a session in progress is now: running; ended and not yet written; or never ended, because
 * eight hours went by or because what the phone showed of it was swiped away. `stillShown` is
 * whether the phone still shows it, undefined when that cannot be read.
 */
export type LiveState = "running" | "ended" | "unended";

export function liveStateOf(
  session: LiveSession,
  now: number,
  stillShown: boolean | undefined,
): LiveState {
  if (session.endedAt !== undefined) return "ended";
  if (now - session.startedAt >= LONGEST_MS) return "unended";
  if (session.shown && stillShown === false) return "unended";
  return "running";
}

/** The time since a session began, as a timer writes it: "0:07:42", "1:23:05". */
export function elapsedOf(startedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

/**
 * How long a session lasted, in the minutes the form takes: rounded to five minutes, between a
 * quarter of an hour and eight hours, the bounds of decision 043.
 */
export const liveMinutes = (startedAt: number, endedAt: number) =>
  withinLengths(Math.round((endedAt - startedAt) / MINUTE_MS));

/**
 * What opens the session form for a session in progress: its place and its start, and its length
 * once it was ended. A session that was never ended is written at the length its surfer gives
 * it, which the form asks.
 */
export function formQueryOf(session: LiveSession) {
  return {
    place: placeParam(session.place),
    name: session.place.name,
    start: new Date(session.startedAt).toISOString(),
    ...(session.endedAt !== undefined && {
      minutes: String(liveMinutes(session.startedAt, session.endedAt)),
    }),
    live: "1",
  };
}

/**
 * The start and the length a route gives the form of a session in progress, when they hold: a
 * start that is a moment and has begun, and a length within the form's, or none.
 */
export function timedOf(params: { start?: string; minutes?: string }, now: number) {
  const start = params.start ? Date.parse(params.start) : Number.NaN;
  if (!Number.isFinite(start) || isAhead(new Date(start), now)) return null;
  const minutes = params.minutes ? Number(params.minutes) : Number.NaN;
  return {
    startedAt: new Date(start),
    minutes: Number.isFinite(minutes) ? withinLengths(minutes) : null,
  };
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const numberOrNull = (value: unknown) => (isNumber(value) ? value : null);

function tideOf(value: unknown): LiveTide | null {
  if (typeof value !== "object" || value === null) return null;
  const { at, heightMeters } = value as Record<string, unknown>;
  return isNumber(at) && isNumber(heightMeters) ? { at, heightMeters } : null;
}

function windOf(value: unknown): LiveWind | null {
  if (typeof value !== "object" || value === null) return null;
  const wind = value as Record<string, unknown>;
  if (!isNumber(wind.at)) return null;
  return {
    at: wind.at,
    speedMetersPerSecond: numberOrNull(wind.speedMetersPerSecond),
    gustMetersPerSecond: numberOrNull(wind.gustMetersPerSecond),
    directionDegrees: numberOrNull(wind.directionDegrees),
    atShore: typeof wind.atShore === "string" ? wind.atShore : null,
  };
}

/** A session in progress as the phone kept it, or null for what this app did not write. */
export function readLiveSession(kept: string | null): LiveSession | null {
  try {
    const read: unknown = JSON.parse(kept ?? "null");
    if (typeof read !== "object" || read === null) return null;
    const session = read as Record<string, unknown>;
    const place = session.place as Record<string, unknown> | undefined;
    const at = placeOfParam(
      typeof place?.kind === "string" && typeof place.id === "string"
        ? `${place.kind}:${place.id}`
        : undefined,
    );
    if (!at || typeof place?.name !== "string" || !isNumber(session.startedAt)) return null;
    const figures = session.figures as Record<string, unknown> | null | undefined;
    return {
      place: { ...at, name: place.name },
      startedAt: session.startedAt,
      ...(isNumber(session.endedAt) && { endedAt: session.endedAt }),
      figures:
        typeof figures === "object" && figures !== null
          ? { high: tideOf(figures.high), low: tideOf(figures.low), wind: windOf(figures.wind) }
          : null,
      shown: session.shown === true,
    };
  } catch {
    return null;
  }
}

/**
 * What the sea did at a place as a session began there, from `places.now`: the first high and the
 * first low after `at`, and the wind the nearest station last measured, with its time. The
 * forecast's wind is not the wind measured, and is left out.
 */
export function figuresOf(place: PlaceNow | undefined, at: number): LiveFigures | null {
  if (!place) return null;
  const ahead = (place.tide?.extremes ?? []).filter((extreme) => extreme.time.getTime() >= at);
  const first = (type: "high" | "low") => {
    const found = ahead.find((extreme) => extreme.type === type);
    return found ? { at: found.time.getTime(), heightMeters: found.heightMeters } : null;
  };
  const reading = place.wind?.latestReading;
  const measured =
    reading && (reading.windSpeedMetersPerSecond !== null || reading.windDirectionDegrees !== null);
  return {
    high: first("high"),
    low: first("low"),
    wind:
      place.wind && reading && measured
        ? {
            at: reading.observedAt.getTime(),
            speedMetersPerSecond: reading.windSpeedMetersPerSecond,
            gustMetersPerSecond: reading.windGustMetersPerSecond,
            directionDegrees: reading.windDirectionDegrees,
            atShore: place.wind.atShore,
          }
        : null,
  };
}
