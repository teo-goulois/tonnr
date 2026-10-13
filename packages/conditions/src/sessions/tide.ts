import type { SessionConditions } from "@repo/db/schema/sessions";

import { predictTideExtremes, predictTideTimeline } from "../tides/tide-prediction";

// The tide is kept every quarter of an hour over a session, and its turns are looked for this
// far on each side: a tide lasts a little over six hours.
const STEP_MINUTES = 15;
const AROUND_MS = 8 * 60 * 60 * 1000;

/**
 * The tide over a session, where it is predicted nearest the place: its height from the
 * session's start to its end, and the high and the low on each side. Null far from any station.
 */
export function tideOver(
  place: { latitude: number; longitude: number },
  from: Date,
  until: Date,
): SessionConditions["tide"] {
  // The timeline is asked on whole steps around the session, so that its start and its end lie
  // between two heights.
  const stepMs = STEP_MINUTES * 60 * 1000;
  const start = new Date(Math.floor(from.getTime() / stepMs) * stepMs);
  const end = new Date(Math.ceil(until.getTime() / stepMs) * stepMs);
  const timeline = predictTideTimeline({ ...place, start, end, stepMinutes: STEP_MINUTES });
  const turns = predictTideExtremes({
    ...place,
    start: new Date(from.getTime() - AROUND_MS),
    end: new Date(until.getTime() + AROUND_MS),
  });
  if (!timeline || !turns) return null;

  // The last turn before the session, those during it, and the first one after it.
  const before = turns.extremes.filter((turn) => turn.time <= from).at(-1);
  const after = turns.extremes.find((turn) => turn.time >= until);
  const kept = turns.extremes.filter(
    (turn) => turn === before || turn === after || (turn.time > from && turn.time < until),
  );
  return {
    station: {
      id: timeline.station.id,
      name: timeline.station.name,
      distanceKm: timeline.station.distanceKm,
    },
    datum: timeline.datum,
    heights: timeline.timeline.map((height) => ({
      time: height.time.toISOString(),
      heightMeters: height.heightMeters,
    })),
    extremes: kept.map((turn) => ({
      time: turn.time.toISOString(),
      type: turn.type,
      heightMeters: turn.heightMeters,
    })),
  };
}
