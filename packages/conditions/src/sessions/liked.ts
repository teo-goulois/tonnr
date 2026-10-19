import { TIDE_CYCLE, TIDE_STAGES, segmentOf } from "@repo/config/sea-words";
import type { SpotCriteria } from "@repo/db/schema/spots";

import type { SessionFigures } from "./figures";

// What an account likes at a place, read from the sessions it rated there: decision 043. It is
// said as the conditions of an alert are, so that an alert can be made of it.

// A session rated this or more is one the account liked.
export const LIKED_FROM = 4;
// Fewer liked sessions than this say nothing yet.
export const LIKED_SESSIONS = 3;
// A wind lighter than this has no bearing worth reading, in metres a second.
const STEADY_WIND = 3;
// Bearings spread wider than this are no sector.
const WIDEST_ARC = 120;
// How much a sector is widened on each side of the bearings it was read from.
const ARC_MARGIN = 10;

export type RatedSession = { rating: number | null; figures: SessionFigures };

/** What rated sessions say of a place. `criteria` is null while too few were liked. */
export type Liked = {
  // The sessions that are rated, and those among them that were liked.
  rated: number;
  liked: number;
  criteria: SpotCriteria | null;
};

const known = (values: (number | null)[]) =>
  values.filter((value): value is number => value !== null);
const down = (value: number, step: number) => Number((Math.floor(value / step) * step).toFixed(2));
const up = (value: number, step: number) => Number((Math.ceil(value / step) * step).toFixed(2));

/**
 * The sector that holds every bearing, clockwise, with a margin on each side: the circle less
 * the widest gap between two neighbours. Null when the bearings are too few or spread too wide.
 */
export function arcOf(bearings: number[]) {
  if (bearings.length < LIKED_SESSIONS) return null;
  const sorted = bearings.map((bearing) => ((bearing % 360) + 360) % 360).sort((a, b) => a - b);
  let widest = { gap: -1, after: 0 };
  for (const [index, bearing] of sorted.entries()) {
    const next = sorted[(index + 1) % sorted.length]!;
    const gap = (next - bearing + 360) % 360 || (sorted.length === 1 ? 360 : 0);
    if (gap > widest.gap) widest = { gap, after: index };
  }
  const from = sorted[(widest.after + 1) % sorted.length]!;
  const to = sorted[widest.after]!;
  const width = (to - from + 360) % 360;
  if (width > WIDEST_ARC) return null;
  return {
    from: (down(from - ARC_MARGIN, 5) + 360) % 360,
    to: up(to + ARC_MARGIN, 5) % 360,
  };
}

/**
 * What an account likes at a place: the heights, the periods, the bearings and the tides its
 * liked sessions span. A figure is left out when too few of them had it.
 */
export function likedConditions(sessions: RatedSession[]): Liked {
  const rated = sessions.filter((session) => session.rating !== null);
  const liked = rated.filter((session) => (session.rating ?? 0) >= LIKED_FROM);
  if (liked.length < LIKED_SESSIONS) {
    return { rated: rated.length, liked: liked.length, criteria: null };
  }
  const figures = liked.map((session) => session.figures);
  const enough = (values: number[]) => values.length >= LIKED_SESSIONS;
  const criteria: SpotCriteria = {};

  const heights = known(figures.map((one) => one.waveHeightMeters));
  if (enough(heights)) {
    criteria.waveHeightMeters = {
      min: down(Math.min(...heights), 0.1),
      max: up(Math.max(...heights), 0.1),
    };
  }
  // A longer period than the ones that were liked is not one to miss: the shortest is kept.
  const periods = known(figures.map((one) => one.wavePeakPeriodSeconds));
  if (enough(periods)) criteria.wavePeakPeriodSeconds = { min: down(Math.min(...periods), 1) };
  const from = arcOf(known(figures.map((one) => one.waveDirectionDegrees)));
  if (from) criteria.waveDirectionDegrees = from;

  // A lighter wind than the ones that were liked is not one to miss either.
  const winds = known(figures.map((one) => one.windSpeedMetersPerSecond));
  if (enough(winds)) criteria.windSpeedMetersPerSecond = { max: up(Math.max(...winds), 1) };
  const blowing = arcOf(
    known(
      figures.map((one) =>
        (one.windSpeedMetersPerSecond ?? 0) >= STEADY_WIND ? one.windDirectionDegrees : null,
      ),
    ),
  );
  if (blowing) criteria.windDirectionDegrees = blowing;

  // The parts of the tide's cycle the liked sessions were surfed at: a height is another stage
  // on another day, and a part of the cycle is the same whatever the tide.
  const segments = figures.flatMap((one) =>
    one.tideLevel !== null && one.tideTrend !== null
      ? [
          segmentOf(
            TIDE_STAGES[Math.min(TIDE_STAGES.length - 1, Math.floor(one.tideLevel * 5))]!,
            one.tideTrend,
          ),
        ]
      : [],
  );
  const cycle = TIDE_CYCLE.filter((segment) => segments.includes(segment));
  if (segments.length >= LIKED_SESSIONS && cycle.length < TIDE_CYCLE.length) {
    criteria.tideCycle = cycle;
  }

  return {
    rated: rated.length,
    liked: liked.length,
    criteria: Object.keys(criteria).length > 0 ? criteria : null,
  };
}
