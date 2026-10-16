import {
  ABILITY_LEVELS,
  BOARD_TYPES,
  BOTTOM_TYPES,
  BREAK_TYPES,
  COMPASS_POINTS,
  SEASONS,
  SIZE_FACTORS,
  type SpotCharacteristics,
  TIDE_STAGES,
  WAVE_DIRECTIONS,
  WAVE_SIZE_MOST,
} from "@repo/db/schema/spots";
import { z } from "zod";

// The words each characteristic is said in. A break of the catalogue and a spot of a user's own
// are described in the same ones.
const VOCABULARY = {
  breakTypes: BREAK_TYPES,
  waveDirections: WAVE_DIRECTIONS,
  bottomTypes: BOTTOM_TYPES,
  abilityLevels: ABILITY_LEVELS,
  boardTypes: BOARD_TYPES,
  bestSeasons: SEASONS,
  bestTides: TIDE_STAGES,
  // Where the swell and the wind come from when the place works, as points of the compass.
  bestSwellDirections: COMPASS_POINTS,
  bestWindDirections: COMPASS_POINTS,
  // How big the waves run against the height of the forecast: decision 062.
  sizeFactors: SIZE_FACTORS,
} as const;

type Listed = keyof typeof VOCABULARY;
const LISTED = Object.keys(VOCABULARY) as Listed[];

/** The height of the faces of the waves a place works at, in meters. */
const waveSizeSchema = z.object({ min: z.number().nullable(), max: z.number().nullable() });

const bound = z.number().min(0).max(WAVE_SIZE_MOST).nullish();
/** A size as it is given: one bound at least, the smallest no larger than the largest. */
const waveSizeInput = z
  .object({ min: bound, max: bound })
  .refine(({ min, max }) => min != null || max != null, "gives no bound")
  .refine(
    ({ min, max }) => min == null || max == null || min <= max,
    "has a smallest larger than its largest",
  )
  .nullish();

// A bound is kept to the tenth of a meter: a list's feet say no more.
const tenth = (meters: number | null | undefined) =>
  meters == null ? null : Math.round(meters * 10) / 10;

/** What is known of a place where the sea is surfed. Null where nobody has said. */
export const characteristicsSchema = z.object({
  breakTypes: z.array(z.enum(BREAK_TYPES)).nullable(),
  waveDirections: z.array(z.enum(WAVE_DIRECTIONS)).nullable(),
  bottomTypes: z.array(z.enum(BOTTOM_TYPES)).nullable(),
  abilityLevels: z.array(z.enum(ABILITY_LEVELS)).nullable(),
  boardTypes: z.array(z.enum(BOARD_TYPES)).nullable(),
  bestSeasons: z.array(z.enum(SEASONS)).nullable(),
  bestTides: z.array(z.enum(TIDE_STAGES)).nullable(),
  // Where the swell and the wind come from when the place works, as points of the compass.
  bestSwellDirections: z.array(z.enum(COMPASS_POINTS)).nullable(),
  bestWindDirections: z.array(z.enum(COMPASS_POINTS)).nullable(),
  // How big the waves run against the height of the forecast, as the people who surf the place
  // say it: about half, about the same, about one and a half times, about double, more than
  // double. Two neighbouring steps say a range. Decision 062.
  sizeFactors: z.array(z.enum(SIZE_FACTORS)).nullable(),
  // Where the wind blows from when it blows off the shore, clockwise from north.
  offshoreDirectionDegrees: z.number().nullable(),
  waveSizeMeters: waveSizeSchema.nullable(),
});

// A list as its owner sends it: no longer than its vocabulary, whatever it repeats.
const said = <Words extends readonly [string, ...string[]]>(words: Words) =>
  z
    .array(z.enum(words))
    .max(words.length * 2)
    .nullish();

/**
 * What the owner of a spot says it is like. Each characteristic may be left out, or null, which
 * says the same: that they have not said.
 */
export const characteristicsInput = z.object({
  breakTypes: said(BREAK_TYPES),
  waveDirections: said(WAVE_DIRECTIONS),
  bottomTypes: said(BOTTOM_TYPES),
  abilityLevels: said(ABILITY_LEVELS),
  boardTypes: said(BOARD_TYPES),
  bestSeasons: said(SEASONS),
  bestTides: said(TIDE_STAGES),
  bestSwellDirections: said(COMPASS_POINTS),
  bestWindDirections: said(COMPASS_POINTS),
  sizeFactors: said(SIZE_FACTORS),
  offshoreDirectionDegrees: z.number().int().min(0).max(359).nullish(),
  waveSizeMeters: waveSizeInput,
});

/**
 * What is kept of what an owner said: each list once through, in the order of its vocabulary,
 * and nothing of a characteristic left out or emptied. Null when nothing is left.
 */
export function keptCharacteristics(
  given: z.infer<typeof characteristicsInput> | null,
): SpotCharacteristics | null {
  if (!given) return null;
  const kept: Record<string, unknown> = {};
  for (const key of LISTED) {
    const words: readonly string[] = given[key] ?? [];
    const ordered = VOCABULARY[key].filter((word) => words.includes(word));
    if (ordered.length > 0) kept[key] = ordered;
  }
  if (given.offshoreDirectionDegrees != null) {
    kept.offshoreDirectionDegrees = given.offshoreDirectionDegrees;
  }
  if (given.waveSizeMeters) {
    kept.waveSizeMeters = {
      min: tenth(given.waveSizeMeters.min),
      max: tenth(given.waveSizeMeters.max),
    };
  }
  return Object.keys(kept).length > 0 ? (kept as SpotCharacteristics) : null;
}

/** What a spot holds, as an answer gives it: every characteristic, null where nothing was said. */
export function describeCharacteristics(
  kept: SpotCharacteristics | null,
): z.infer<typeof characteristicsSchema> {
  return {
    breakTypes: kept?.breakTypes ?? null,
    waveDirections: kept?.waveDirections ?? null,
    bottomTypes: kept?.bottomTypes ?? null,
    abilityLevels: kept?.abilityLevels ?? null,
    boardTypes: kept?.boardTypes ?? null,
    bestSeasons: kept?.bestSeasons ?? null,
    bestTides: kept?.bestTides ?? null,
    bestSwellDirections: kept?.bestSwellDirections ?? null,
    bestWindDirections: kept?.bestWindDirections ?? null,
    sizeFactors: kept?.sizeFactors ?? null,
    offshoreDirectionDegrees: kept?.offshoreDirectionDegrees ?? null,
    waveSizeMeters: kept?.waveSizeMeters ?? null,
  };
}
