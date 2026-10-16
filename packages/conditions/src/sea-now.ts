import { COMPASS_POINTS, TIDE_STAGES, type TideStage } from "@repo/config/sea-words";

import type { ForecastHour } from "./forecasts/week";
import { type ShoreWind, shoreWind } from "./shore-wind";

// What the hour's forecast is, laid against what a break says of itself, for the sentence of
// the sea now on its page and in its panel: functions that read no clock and no database. The
// API and the web app both read them, so that the page and the app judge an hour the same way.
// Decisions 059 and 061.

/** What a break, or a spot of an account's own, says of itself that an hour is judged by. */
export type SeaWords = {
  bestTides: readonly string[] | null;
  bestSwellDirections: readonly string[] | null;
  bestWindDirections: readonly string[] | null;
  offshoreDirectionDegrees: number | null;
  waveSizeMeters: { min: number | null; max: number | null } | null;
};
export type SeaHour = ForecastHour;
export type TideNow = { heightMeters: number; trend: "rising" | "falling" };
type Extreme = { type: "high" | "low"; heightMeters: number };

/** The things a break may be judged on, in the order they are said. */
export const JUDGED = ["swell", "size", "wind", "tide"] as const;
export type Judged = (typeof JUDGED)[number];

/** What fits the break at this hour, and what does not, among the things it says. */
export type Verdict = { fits: Judged[]; off: Judged[] };

/** The point of the compass a bearing is nearest to, as an index of the sixteen. */
function pointIndex(degrees: number) {
  return Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
}

/** Whether a bearing is within a point of the compass of one of the points named. */
export function nearPoints(degrees: number, points: readonly string[]) {
  const at = pointIndex(degrees);
  return points.some((name) => {
    const index = (COMPASS_POINTS as readonly string[]).indexOf(name);
    if (index < 0) return false;
    const apart = Math.abs(at - index);
    return Math.min(apart, 16 - apart) <= 1;
  });
}

/**
 * The stage of the tide now, from its height between the next low and the next high water:
 * the fifths of the range, from low to high. Null without both.
 */
export function tideStageOf(
  heightMeters: number,
  extremes: readonly Pick<Extreme, "type" | "heightMeters">[],
): TideStage | null {
  const high = extremes.find((extreme) => extreme.type === "high")?.heightMeters;
  const low = extremes.find((extreme) => extreme.type === "low")?.heightMeters;
  if (high === undefined || low === undefined || high <= low) return null;
  const part = Math.min(1, Math.max(0, (heightMeters - low) / (high - low)));
  return TIDE_STAGES[Math.min(TIDE_STAGES.length - 1, Math.floor(part * TIDE_STAGES.length))]!;
}

/** How the hour's wind meets the shore, where the break knows its offshore direction. */
export function windAtShoreOf(
  hour: Pick<SeaHour, "windDirectionDegrees">,
  known: Pick<SeaWords, "offshoreDirectionDegrees">,
): ShoreWind | null {
  if (hour.windDirectionDegrees === null || known.offshoreDirectionDegrees === null) return null;
  return shoreWind(hour.windDirectionDegrees, known.offshoreDirectionDegrees);
}

/**
 * The hour laid against the break's own words, and nothing else: a thing the break says
 * nothing of, or the hour has no figure for, is not judged.
 */
export function verdictOf(
  known: SeaWords,
  hour: Pick<SeaHour, "waveHeightMeters" | "waveDirectionDegrees" | "windDirectionDegrees">,
  tide: { now: TideNow | null; extremes: readonly Pick<Extreme, "type" | "heightMeters">[] } | null,
): Verdict {
  const verdict: Verdict = { fits: [], off: [] };
  const judge = (thing: Judged, fits: boolean) => (fits ? verdict.fits : verdict.off).push(thing);

  if (known.bestSwellDirections?.length && hour.waveDirectionDegrees !== null) {
    judge("swell", nearPoints(hour.waveDirectionDegrees, known.bestSwellDirections));
  }
  const size = known.waveSizeMeters;
  if (size && size.min !== null && size.max !== null && hour.waveHeightMeters !== null) {
    judge("size", hour.waveHeightMeters >= size.min && hour.waveHeightMeters <= size.max);
  }
  if (hour.windDirectionDegrees !== null) {
    const atShore = windAtShoreOf(hour, known);
    const byName = known.bestWindDirections?.length
      ? nearPoints(hour.windDirectionDegrees, known.bestWindDirections)
      : null;
    if (atShore !== null || byName !== null) {
      judge("wind", atShore === "offshore" || atShore === "cross_offshore" || byName === true);
    }
  }
  if (known.bestTides?.length && tide?.now) {
    const stage = tideStageOf(tide.now.heightMeters, tide.extremes);
    if (stage !== null) judge("tide", known.bestTides.includes(stage));
  }
  return verdict;
}
