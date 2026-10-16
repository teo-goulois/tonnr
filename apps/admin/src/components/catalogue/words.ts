import type { BreakCharacteristics } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

// The words a break is said in, and how each reads. A word the catalogue gains has to be given
// its reading here before the admin builds.

type ListLine = Exclude<keyof BreakCharacteristics, "offshoreDirectionDegrees" | "waveSizeMeters">;
export type WordOf<Line extends ListLine> = NonNullable<BreakCharacteristics[Line]>[number];
type Readings<Line extends ListLine> = Record<WordOf<Line>, () => string>;

const COMPASS = [
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
] as const satisfies readonly WordOf<"bestSwellDirections">[];

/** A point of the compass as the reader's language writes it. */
export function pointName(point: WordOf<"bestSwellDirections">) {
  return m.compass_points().split(",")[COMPASS.indexOf(point)] ?? point;
}

const compass = Object.fromEntries(
  COMPASS.map((point) => [point, () => pointName(point)]),
) as Readings<"bestSwellDirections">;

/** Each line of a break, with its words in the order of their vocabulary. */
export const LINES: { [Line in ListLine]: { label: () => string; words: Readings<Line> } } = {
  breakTypes: {
    label: m.moderation_said_break,
    words: {
      beach: m.word_beach,
      reef: m.word_reef,
      point: m.word_point,
      jetty: m.word_jetty,
      pier: m.word_pier,
      offshore: m.word_offshore,
      slab: m.word_slab,
      canyon: m.word_canyon,
      peak: m.word_peak,
      rivermouth: m.word_rivermouth,
      man_made: m.word_man_made,
      tidal_bore: m.word_tidal_bore,
      standing_wave: m.word_standing_wave,
    },
  },
  waveDirections: {
    label: m.moderation_said_wave,
    words: { left: m.word_left, right: m.word_right },
  },
  bottomTypes: {
    label: m.moderation_said_bottom,
    words: {
      sand: m.word_sand,
      rock: m.word_rock,
      coral: m.word_coral,
      lava: m.word_lava,
      uneven_reef: m.word_uneven_reef,
      boulders: m.word_boulders,
      rock_shelf: m.word_rock_shelf,
    },
  },
  abilityLevels: {
    label: m.moderation_said_ability,
    words: {
      beginner: m.word_beginner,
      intermediate: m.word_intermediate,
      advanced: m.word_advanced,
      pro: m.word_pro,
    },
  },
  boardTypes: {
    label: m.moderation_said_boards,
    words: {
      shortboard: m.word_shortboard,
      fish: m.word_fish,
      funboard: m.word_funboard,
      longboard: m.word_longboard,
      gun: m.word_gun,
      bodyboard: m.word_bodyboard,
      bodysurf: m.word_bodysurf,
      skimboard: m.word_skimboard,
      sup: m.word_sup,
      foil: m.word_foil,
      kite: m.word_kite,
      tow: m.word_tow,
    },
  },
  bestSeasons: {
    label: m.moderation_said_seasons,
    words: {
      spring: m.word_spring,
      summer: m.word_summer,
      autumn: m.word_autumn,
      winter: m.word_winter,
    },
  },
  bestTides: {
    label: m.moderation_said_tides,
    words: {
      low: m.word_low,
      mid_low: m.word_mid_low,
      mid: m.word_mid,
      mid_high: m.word_mid_high,
      high: m.word_high,
    },
  },
  bestSwellDirections: { label: m.moderation_said_swell, words: compass },
  bestWindDirections: { label: m.moderation_said_wind, words: compass },
  sizeFactors: {
    label: m.moderation_said_size_factor,
    words: {
      half: m.word_half,
      same: m.word_same,
      one_and_a_half: m.word_one_and_a_half,
      double: m.word_double,
      more: m.word_more,
    },
  },
};

export const LIST_LINES = Object.keys(LINES) as ListLine[];
export type { ListLine };

/** A line's words as they read, or null when it says nothing. */
export function readLine(line: ListLine, given: readonly string[] | null | undefined) {
  if (!given || given.length === 0) return null;
  const words = LINES[line].words as Record<string, () => string>;
  return given.map((word) => words[word]?.() ?? word).join(", ");
}

/** The order of a line's words, in which a list of them is kept. */
export function inOrder(line: ListLine, given: readonly string[]) {
  return Object.keys(LINES[line].words).filter((word) => given.includes(word));
}

/** No characteristic said: the values a new break starts from. */
export const NOTHING_SAID: BreakCharacteristics = {
  breakTypes: null,
  waveDirections: null,
  bottomTypes: null,
  abilityLevels: null,
  boardTypes: null,
  bestSeasons: null,
  bestTides: null,
  bestSwellDirections: null,
  bestWindDirections: null,
  sizeFactors: null,
  offshoreDirectionDegrees: null,
  waveSizeMeters: null,
};

/** The height of the faces of the waves a break works at, as it reads, or null. */
export function readSize(size: BreakCharacteristics["waveSizeMeters"]) {
  if (!size) return null;
  const { min, max } = size;
  if (min !== null && max !== null) return m.catalogue_size_range({ min, max });
  if (min !== null) return m.catalogue_size_from({ min });
  return max === null ? null : m.catalogue_size_up_to({ max });
}
