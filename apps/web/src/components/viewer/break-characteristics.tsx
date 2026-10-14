import {
  BoardIcon,
  BottomIcon,
  BreakTypeIcon,
  LevelIcon,
  SeasonIcon,
  SwellWindowIcon,
  TideIcon,
  WaveDirectionIcon,
  WaveSizeIcon,
  WindWindowIcon,
} from "@repo/ui/icon";
import type { ReactNode } from "react";

import { compassPoint } from "@/lib/format";
import { heightFigure, heightUnit, useUnits } from "@/lib/units";
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

const glyph = "size-10 shrink-0";
const has = (given: readonly string[], ...words: string[]) =>
  words.some((word) => given.includes(word));
const bearingsOf = (given: readonly string[]) =>
  COMPASS.filter((point) => given.includes(point)).map((point) => COMPASS.indexOf(point) * 22.5);

/**
 * A characteristic's glyph, drawn from what it says, as Stormrider's guides draw a break. One
 * that says nothing yet is drawn empty.
 */
export function CharacteristicIcon({
  field,
  given,
}: {
  field: ListedField;
  given: readonly string[];
}) {
  switch (field) {
    case "breakTypes": {
      const shape = (Object.keys(BREAK_TYPES) as WordOf<"breakTypes">[]).find((word) =>
        given.includes(word),
      );
      return <BreakTypeIcon className={glyph} shape={shape ?? "beach"} />;
    }
    case "waveDirections":
      return (
        <WaveDirectionIcon
          className={glyph}
          left={has(given, "left")}
          right={has(given, "right")}
        />
      );
    case "bottomTypes":
      return (
        <BottomIcon
          className={glyph}
          bottoms={given.filter((word) => word in BOTTOM_TYPES) as WordOf<"bottomTypes">[]}
        />
      );
    case "abilityLevels": {
      const order = Object.keys(ABILITY_LEVELS);
      return (
        <LevelIcon
          className={glyph}
          levels={given.map((word) => order.indexOf(word)).filter((at) => at >= 0)}
          of={order.length}
        />
      );
    }
    case "boardTypes":
      return <BoardIcon className={glyph} />;
    case "bestSeasons":
      return (
        <SeasonIcon
          className={glyph}
          seasons={given.filter((word) => word in SEASONS) as WordOf<"bestSeasons">[]}
        />
      );
    case "bestTides":
      return (
        <TideIcon
          className={glyph}
          low={has(given, "low", "mid_low")}
          mid={has(given, "mid_low", "mid", "mid_high")}
          high={has(given, "mid_high", "high")}
        />
      );
    case "bestSwellDirections":
      return <SwellWindowIcon className={glyph} bearings={bearingsOf(given)} />;
    case "bestWindDirections":
      return <WindWindowIcon className={glyph} bearings={bearingsOf(given)} />;
  }
}

/** The glyph of the wind that blows offshore at a break: its arrow alone. */
export function OffshoreIcon({ degrees }: { degrees: number }) {
  return <WindWindowIcon className={glyph} bearings={[degrees]} window={false} />;
}

type WaveSize = NonNullable<Characteristics["waveSizeMeters"]>;

/** The glyph of the size a break works at. */
export function SizeIcon({ size }: { size: WaveSize }) {
  return <WaveSizeIcon className={glyph} smallest={size.min} largest={size.max} />;
}

/**
 * The size a break works at, in the reader's unit: a whole number of feet, as a list gives them,
 * or meters to the tenth.
 */
export function SizeReading({ size }: { size: WaveSize }) {
  const { height } = useUnits();
  const figure = (meters: number) => heightFigure(meters, height === "ft" ? 0 : 1);
  const unit = heightUnit();
  if (size.min !== null && size.max !== null) {
    return m.break_size_range({ min: figure(size.min), max: figure(size.max), unit });
  }
  if (size.min !== null) return m.break_size_from({ min: figure(size.min), unit });
  return size.max === null ? null : m.break_size_up_to({ max: figure(size.max), unit });
}

/**
 * A characteristic as a guide gives it: its glyph, then its name over what it says. A row with no
 * glyph keeps its place, so that what the rows say stands in one column.
 */
export function CharacteristicRow({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-s text-left text-s">
      <span aria-hidden className="flex size-10">
        {icon}
      </span>
      <span className="grid">
        <span className="text-neutral-7">{label}</span>
        <span className="break-words">{children}</span>
      </span>
    </span>
  );
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
  const size = known.waveSizeMeters;
  const listed: { label: string; value: ReactNode; icon?: ReactNode }[] = [
    // The nearest place first, as an address reads.
    { label: m.break_location(), value: location && [...location].reverse().join(", ") },
    ...CHARACTERISTIC_FIELDS.map(({ key, label }) => {
      const given = known[key];
      return {
        label: label(),
        value: given && given.length > 0 ? readCharacteristic(key, given) : undefined,
        icon: given && <CharacteristicIcon field={key} given={given} />,
      };
    }),
    {
      label: m.break_offshore_wind(),
      value: offshore == null ? undefined : <Bearing degrees={offshore} />,
      icon: offshore == null ? undefined : <OffshoreIcon degrees={offshore} />,
    },
    {
      label: m.break_wave_size(),
      value: size ? <SizeReading size={size} /> : undefined,
      icon: size ? <SizeIcon size={size} /> : undefined,
    },
  ];
  const rows = listed.filter(({ value }) => Boolean(value));

  if (rows.length === 0) return null;

  return (
    <Section title={title}>
      <ul className="grid gap-xs">
        {rows.map(({ label, value, icon }) => (
          <li key={label}>
            <CharacteristicRow icon={icon} label={label}>
              {value}
            </CharacteristicRow>
          </li>
        ))}
      </ul>
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
