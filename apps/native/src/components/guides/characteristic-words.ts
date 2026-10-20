import type { SurfBreak } from "@repo/client/viewer/types";

import { compassPoint } from "@/lib/format";
import { m } from "@/paraglide/messages";

// The words a surf break is said in, and how each reads, as the web's
// `apps/web/src/components/viewer/break-characteristics.tsx` reads them: the catalogue's lists of
// words (decision 050), in the order a guide gives them. A module that draws nothing, so that a
// test reads it. A word the catalogue gains is given its reading here and on the web.

export type Characteristics = SurfBreak["characteristics"];
type WordOf<Field extends keyof Characteristics> = Extract<
  NonNullable<Characteristics[Field]>,
  unknown[]
>[number];
// A word of the catalogue and how it reads. A word the catalogue gains has to be given its
// reading here before the app builds.
type Readings<Field extends keyof Characteristics> = Record<WordOf<Field>, () => string>;

export const BREAK_TYPES: Readings<"breakTypes"> = {
  beach: m.break_type_beach,
  reef: m.break_type_reef,
  point: m.break_type_point,
  jetty: m.break_type_jetty,
  pier: m.break_type_pier,
  offshore: m.break_type_offshore,
  slab: m.break_type_slab,
  canyon: m.break_type_canyon,
  peak: m.break_type_peak,
  rivermouth: m.break_type_rivermouth,
  man_made: m.break_type_man_made,
  tidal_bore: m.break_type_tidal_bore,
  standing_wave: m.break_type_standing_wave,
};
// How big the waves run against the forecast, in the steps the guide's line takes: decision 062.
export const SIZE_FACTORS: Readings<"sizeFactors"> = {
  half: m.break_size_half,
  same: m.break_size_same,
  one_and_a_half: m.break_size_one_and_a_half,
  double: m.break_size_double,
  more: m.break_size_more,
};
// The same steps, short, for a range: "between the forecast and one and a half times".
const SIZE_STEPS: Readings<"sizeFactors"> = {
  half: m.size_step_half,
  same: m.size_step_same,
  one_and_a_half: m.size_step_one_and_a_half,
  double: m.size_step_double,
  more: m.size_step_more,
};
const WAVE_DIRECTIONS: Readings<"waveDirections"> = {
  left: m.break_wave_left,
  right: m.break_wave_right,
};
export const BOTTOM_TYPES: Readings<"bottomTypes"> = {
  sand: m.break_bottom_sand,
  rock: m.break_bottom_rock,
  coral: m.break_bottom_coral,
  lava: m.break_bottom_lava,
  uneven_reef: m.break_bottom_uneven_reef,
  boulders: m.break_bottom_boulders,
  rock_shelf: m.break_bottom_rock_shelf,
};
export const ABILITY_LEVELS: Readings<"abilityLevels"> = {
  beginner: m.break_level_beginner,
  intermediate: m.break_level_intermediate,
  advanced: m.break_level_advanced,
  pro: m.break_level_pro,
};
const BOARD_TYPES: Readings<"boardTypes"> = {
  shortboard: m.break_board_shortboard,
  fish: m.break_board_fish,
  funboard: m.break_board_funboard,
  longboard: m.break_board_longboard,
  gun: m.break_board_gun,
  bodyboard: m.break_board_bodyboard,
  bodysurf: m.break_board_bodysurf,
  skimboard: m.break_board_skimboard,
  sup: m.break_board_sup,
  foil: m.break_board_foil,
  kite: m.break_board_kite,
  tow: m.break_board_tow,
};
export const SEASONS: Readings<"bestSeasons"> = {
  spring: m.break_season_spring,
  summer: m.break_season_summer,
  autumn: m.break_season_autumn,
  winter: m.break_season_winter,
};
const TIDE_STAGES: Readings<"bestTides"> = {
  low: m.break_tide_low,
  mid_low: m.break_tide_mid_low,
  mid: m.break_tide_mid,
  mid_high: m.break_tide_mid_high,
  high: m.break_tide_high,
};

export type CompassPoint = WordOf<"bestSwellDirections">;
// The sixteen points in the order `compass_points` gives their names.
export const COMPASS: CompassPoint[] = [
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
];

/** The bearing of a point of the compass, clockwise from north. */
export const bearingOf = (point: CompassPoint) => COMPASS.indexOf(point) * 22.5;

/** A point of the compass as the reader's language writes it. */
export function pointName(point: CompassPoint) {
  return compassPoint(bearingOf(point));
}

/** The points a list of words holds, in the compass's order, as bearings. */
export function bearingsOf(given: readonly string[]) {
  return COMPASS.filter((point) => given.includes(point)).map(bearingOf);
}

// A characteristic that is said in a list of words, with the words it may be said in.
export type ListedField = Exclude<
  keyof Characteristics,
  "offshoreDirectionDegrees" | "waveSizeMeters"
>;
export type CharacteristicField = {
  [Field in ListedField]: {
    key: Field;
    label: () => string;
    words: { word: WordOf<Field>; reading: () => string }[];
  };
}[ListedField];

const wordsOf = <Word extends string>(readings: Record<Word, () => string>) =>
  (Object.keys(readings) as Word[]).map((word) => ({ word, reading: readings[word] }));
const compassWords = COMPASS.map((word) => ({ word, reading: () => pointName(word) }));

/**
 * The characteristics that are lists of words, in the order a guide gives them, each with its
 * words in the order of the catalogue.
 */
export const CHARACTERISTIC_FIELDS: CharacteristicField[] = [
  { key: "breakTypes", label: m.break_types, words: wordsOf(BREAK_TYPES) },
  { key: "waveDirections", label: m.break_wave_directions, words: wordsOf(WAVE_DIRECTIONS) },
  { key: "bottomTypes", label: m.break_bottom_types, words: wordsOf(BOTTOM_TYPES) },
  { key: "abilityLevels", label: m.break_ability_levels, words: wordsOf(ABILITY_LEVELS) },
  { key: "boardTypes", label: m.break_board_types, words: wordsOf(BOARD_TYPES) },
  { key: "bestSeasons", label: m.break_best_seasons, words: wordsOf(SEASONS) },
  { key: "bestTides", label: m.break_best_tides, words: wordsOf(TIDE_STAGES) },
  { key: "bestSwellDirections", label: m.break_best_swell, words: compassWords },
  { key: "bestWindDirections", label: m.break_best_wind, words: compassWords },
  { key: "sizeFactors", label: m.break_size_factors, words: wordsOf(SIZE_FACTORS) },
];

/** Whether a characteristic is said in points of the compass, each written with its arrow. */
export const isCompassField = (key: ListedField) =>
  key === "bestSwellDirections" || key === "bestWindDirections";

/** The steps of the size against the forecast, in their order, that a list of words holds. */
export function sizeStepsOf(given: readonly string[]) {
  return (Object.keys(SIZE_FACTORS) as WordOf<"sizeFactors">[]).filter((step) =>
    given.includes(step),
  );
}

/** How a line of size steps reads: one step, or a range from the first to the last. */
export function readSizeFactors(given: readonly string[]) {
  const steps = sizeStepsOf(given);
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return "";
  if (first === last) return SIZE_FACTORS[first]();
  return m.break_size_between({ from: SIZE_STEPS[first](), to: SIZE_STEPS[last]() });
}

/**
 * The words of one characteristic as a sentence reads them: its points by their names, in the
 * compass's order, or its words in the catalogue's. A screen draws a point with its arrow
 * (`WordsReading`): this is what a screen reader says, and what a short line shows.
 */
export function wordsText(key: ListedField, given: readonly string[]) {
  if (isCompassField(key)) {
    return COMPASS.filter((point) => given.includes(point))
      .map(pointName)
      .join(", ");
  }
  if (key === "sizeFactors") return readSizeFactors(given);
  const field = CHARACTERISTIC_FIELDS.find((one) => one.key === key);
  return (
    field?.words
      .filter(({ word }) => given.includes(word))
      .map(({ reading }) => reading())
      .join(", ") ?? ""
  );
}

/** The field a line of a guide is said in, when it is a list of words. */
export function fieldOf(key: string) {
  return CHARACTERISTIC_FIELDS.find((one) => one.key === key);
}
