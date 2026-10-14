import { Fragment, type ReactNode } from "react";

import { compassPoint } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "./bearing";
import { Section } from "./point-conditions";
import type { SurfBreak } from "./types";

export type Characteristics = SurfBreak["characteristics"];
type WordOf<Field extends keyof Characteristics> = Extract<
  NonNullable<Characteristics[Field]>,
  unknown[]
>[number];
// A word of the catalogue and how it reads. A word the catalogue gains has to be given its
// reading here before the app builds.
type Readings<Field extends keyof Characteristics> = Record<WordOf<Field>, () => string>;

const BREAK_TYPES: Readings<"breakTypes"> = {
  beach: m.break_type_beach,
  reef: m.break_type_reef,
  point: m.break_type_point,
  jetty: m.break_type_jetty,
  pier: m.break_type_pier,
  offshore: m.break_type_offshore,
  slab: m.break_type_slab,
  canyon: m.break_type_canyon,
};
const WAVE_DIRECTIONS: Readings<"waveDirections"> = {
  left: m.break_wave_left,
  right: m.break_wave_right,
};
const BOTTOM_TYPES: Readings<"bottomTypes"> = {
  sand: m.break_bottom_sand,
  rock: m.break_bottom_rock,
  coral: m.break_bottom_coral,
  lava: m.break_bottom_lava,
};
const ABILITY_LEVELS: Readings<"abilityLevels"> = {
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
const SEASONS: Readings<"bestSeasons"> = {
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
// The sixteen points in the order `compass_points` gives their names.
const COMPASS: WordOf<"bestSwellDirections">[] = [
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

function words<Word extends string>(given: Word[] | null, readings: Record<Word, () => string>) {
  return given?.map((word) => readings[word]()).join(", ");
}

/** A point of the compass as the reader's language writes it. */
export function pointName(point: WordOf<"bestSwellDirections">) {
  return compassPoint(COMPASS.indexOf(point) * 22.5);
}

// Each point with its arrow, as a direction is written everywhere.
function points(given: WordOf<"bestSwellDirections">[] | null) {
  if (!given || given.length === 0) return undefined;
  return (
    <span className="flex flex-wrap gap-x-xs gap-y-xxs">
      {given.map((point) => (
        <Bearing key={point} degrees={COMPASS.indexOf(point) * 22.5} />
      ))}
    </span>
  );
}

// A characteristic that is said in a list of words, with the words it may be said in.
export type ListedField = Exclude<keyof Characteristics, "offshoreDirectionDegrees">;
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
 * words in the order of the catalogue. What shows a break reads them, and so does what lets the
 * owner of a spot describe it.
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
];

/** The words of one characteristic as they read: its points with their arrows, or its words. */
export function readCharacteristic(key: ListedField, given: readonly string[]): ReactNode {
  if (key === "bestSwellDirections" || key === "bestWindDirections") {
    return points(COMPASS.filter((point) => given.includes(point)));
  }
  const field = CHARACTERISTIC_FIELDS.find((one) => one.key === key);
  return field?.words
    .filter(({ word }) => given.includes(word))
    .map(({ reading }) => reading())
    .join(", ");
}

/**
 * What is known of a place where the sea is surfed, as a list. Nothing is shown of a place of
 * which nothing is known.
 */
export function CharacteristicsList({
  known,
  location = null,
  title,
}: {
  known: Characteristics;
  // The places it lies in, from the widest to the nearest.
  location?: string[] | null;
  title: string;
}) {
  const offshore = known.offshoreDirectionDegrees;
  const listed: [string, ReactNode][] = [
    // The nearest place first, as an address reads.
    [m.break_location(), location && [...location].reverse().join(", ")],
    [m.break_types(), words(known.breakTypes, BREAK_TYPES)],
    [m.break_wave_directions(), words(known.waveDirections, WAVE_DIRECTIONS)],
    [m.break_bottom_types(), words(known.bottomTypes, BOTTOM_TYPES)],
    [m.break_ability_levels(), words(known.abilityLevels, ABILITY_LEVELS)],
    [m.break_board_types(), words(known.boardTypes, BOARD_TYPES)],
    [m.break_best_seasons(), words(known.bestSeasons, SEASONS)],
    [m.break_best_tides(), words(known.bestTides, TIDE_STAGES)],
    [m.break_best_swell(), points(known.bestSwellDirections)],
    [m.break_best_wind(), points(known.bestWindDirections)],
    [m.break_offshore_wind(), offshore == null ? undefined : <Bearing degrees={offshore} />],
  ];
  const rows = listed.filter(([, value]) => Boolean(value));

  if (rows.length === 0) return null;

  return (
    <Section title={title}>
      <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-s gap-y-xxs text-s">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-neutral-7">{label}</dt>
            <dd className="break-words">{value}</dd>
          </Fragment>
        ))}
      </dl>
    </Section>
  );
}

/**
 * What the instance's operator wrote of a break, in the language they wrote it in, whichever the
 * reader's: decision 049.
 */
export function BreakDescription({ description }: { description: SurfBreak["description"] }) {
  if (!description) return null;
  return (
    <p lang={description.language} className="text-s text-pretty">
      {description.text}
    </p>
  );
}

/** What the catalogue knows of a break. Nothing is shown of a break of which it knows no more than the place. */
export function BreakCharacteristics({ found }: { found: SurfBreak }) {
  return (
    <div className="grid gap-m">
      <BreakDescription description={found.description} />
      <CharacteristicsList
        known={found.characteristics}
        location={found.location}
        title={m.break_about()}
      />
    </div>
  );
}
