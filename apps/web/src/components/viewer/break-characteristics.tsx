import { Fragment } from "react";

import { compassPoint } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { Section } from "./point-conditions";
import type { SurfBreak } from "./types";

type Characteristics = SurfBreak["characteristics"];
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

function points(given: WordOf<"bestSwellDirections">[] | null) {
  return given?.map((point) => compassPoint(COMPASS.indexOf(point) * 22.5)).join(", ");
}

/** What the catalogue knows of a break. Nothing is shown of a break of which it knows no more than the place. */
export function BreakCharacteristics({ found }: { found: SurfBreak }) {
  const { characteristics: known, location } = found;
  const offshore = known.offshoreDirectionDegrees;
  const rows = [
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
    [m.break_offshore_wind(), offshore === null ? undefined : compassPoint(offshore)],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  if (rows.length === 0) return null;

  return (
    <Section title={m.break_about()}>
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
