// The words the catalogue says a tide and a direction with, for everything that reads or writes
// them: the schema, the API, the worker, the rules of decision 059 and the web app, which judges
// an hour as the page does without a module of the database. Decisions 050 and 061.

/** The stages of the tide, from low water to high water. */
export const TIDE_STAGES = ["low", "mid_low", "mid", "mid_high", "high"] as const;
export type TideStage = (typeof TIDE_STAGES)[number];

/** The sixteen points of the compass, clockwise from north. */
export const COMPASS_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * One tide, from low water to the next low, in eight parts: the stage and the way the tide
 * goes, which a surfer says together, "mid tide rising". Low and high water are each one part,
 * whichever way the tide turns there. An alert asks for some of them: decision 031, "The tide".
 */
export const TIDE_CYCLE = [
  "low",
  "mid_low_rising",
  "mid_rising",
  "mid_high_rising",
  "high",
  "mid_high_falling",
  "mid_falling",
  "mid_low_falling",
] as const;
export type TideSegment = (typeof TIDE_CYCLE)[number];

/** The part of the cycle a stage of the tide stands in, as the tide rises or falls. */
export function segmentOf(stage: TideStage, trend: "rising" | "falling"): TideSegment {
  return stage === "low" || stage === "high" ? stage : `${stage}_${trend}`;
}

/**
 * How strong a tide is, in three bands of its coefficient, as the tide tables of France and
 * Spain print it: under 70, from 70 to 90, over 90.
 */
export const COEFFICIENT_BANDS = ["small", "medium", "big"] as const;
export type CoefficientBand = (typeof COEFFICIENT_BANDS)[number];

/** The band a coefficient is in. */
export function coefficientBand(coefficient: number): CoefficientBand {
  if (coefficient < 70) return "small";
  return coefficient <= 90 ? "medium" : "big";
}
