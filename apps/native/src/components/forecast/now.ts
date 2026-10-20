import type { TideExtremes, TideTimeline } from "@repo/client/viewer/types";
import type { ShoreWind } from "@repo/conditions/shore-wind";
import {
  type SeaWords,
  type Verdict,
  tideNowOf,
  verdictOf,
  windAtShoreOf,
} from "@repo/conditions/sea-now";

import { HOUR_MS, type Metric, type Sample, directionAt, valueAt } from "./metrics";

// What the panel reads of the sea now, as the web's `nowOf` and `seaNowOf` read it: a buoy's last
// reading while it is recent, and the model at that time. Pure, so that a test reads it.

// A reading older than this no longer stands for the sea now.
export const LIVE_REACH = 3 * HOUR_MS;

/** What the panel reads the sea from: the buoy's readings and the model's hours, oldest first. */
export type SeaRead = { measured: Sample[]; model: Sample[]; now: number };

/** What a metric reads now: the buoy's last reading when it is recent, and the model at that time. */
export function nowOf(
  metric: Pick<Metric, "key" | "direction">,
  { measured, model, now }: SeaRead,
) {
  const last = measured.filter((sample) => sample[metric.key] !== null).at(-1);
  const live = last && now - last.time <= LIVE_REACH ? last : undefined;
  const at = live?.time ?? now;
  const measuredValue = live?.[metric.key] ?? undefined;
  const modelValue = valueAt(model, metric.key, at);
  const measuredBearing = live && metric.direction ? live[metric.direction] : null;
  const bearing =
    measuredBearing ?? (metric.direction ? directionAt(model, metric.direction, at) : undefined);
  return {
    measured: measuredValue,
    model: modelValue,
    shown: measuredValue ?? modelValue,
    bearing,
  };
}

/** What the sentence of the sea now is given: each figure as the tiles read it. */
export type SeaNowFacts = {
  waves: { height?: number; period?: number; direction?: number };
  // The wind in knots, and how it meets the shore where the place knows its shore.
  wind: { knots?: number; direction?: number; atShore: ShoreWind | null };
  // Null where no tide is predicted. `next` is the next high or low water.
  tide: { trend: "rising" | "falling"; next?: { type: "high" | "low"; time: Date } } | null;
  // Null at a place that has no words to be judged by, as a buoy.
  verdict: Verdict | null;
};

/**
 * The sea now as the sentence says it: what the tiles read, the wind named by the shore, the
 * tide from its timeline, and the place's words laid against them. Decision 061.
 */
export function seaNowOf(
  read: SeaRead,
  {
    offshoreFrom,
    words,
    tides,
    extremes,
  }: {
    offshoreFrom: number | null | undefined;
    words: SeaWords | null | undefined;
    tides: TideTimeline | undefined;
    extremes: TideExtremes | undefined;
  },
): SeaNowFacts {
  const height = nowOf({ key: "height", direction: "waveDirection" }, read);
  const period = nowOf({ key: "period" }, read);
  const wind = nowOf({ key: "wind", direction: "windDirection" }, read);
  const tideNow = tideNowOf(tides?.timeline ?? [], read.now);
  // The next low and high water, which the stage of the tide is read between.
  const ahead = (extremes?.extremes ?? []).filter((extreme) => extreme.time.getTime() >= read.now);
  const hour = {
    waveHeightMeters: height.shown ?? null,
    waveDirectionDegrees: height.bearing ?? null,
    windDirectionDegrees: wind.bearing ?? null,
  };
  return {
    waves: { height: height.shown, period: period.shown, direction: height.bearing },
    wind: {
      knots: wind.shown,
      direction: wind.bearing,
      atShore: windAtShoreOf(hour, { offshoreDirectionDegrees: offshoreFrom ?? null }),
    },
    tide: tideNow && { trend: tideNow.trend, next: ahead[0] },
    verdict: words
      ? verdictOf(words, hour, tideNow ? { now: tideNow, extremes: ahead } : null)
      : null,
  };
}
