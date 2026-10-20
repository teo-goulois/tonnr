import {
  BoardIcon,
  BottomIcon,
  type BottomKind,
  BreakTypeIcon,
  type BreakShape,
  LevelIcon,
  type Season,
  SeasonIcon,
  SizeFactorIcon,
  type SurfLook,
  SwellWindowIcon,
  TideIcon,
  WaveDirectionIcon,
  WaveSizeIcon,
  WindWindowIcon,
} from "@repo/ui/icon";
import type { ReactElement, ReactNode } from "react";
import { View } from "react-native";

import { Bearing } from "@/components/forecast/bearing";
import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { heightFigure, heightUnit, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import {
  ABILITY_LEVELS,
  BOTTOM_TYPES,
  BREAK_TYPES,
  bearingOf,
  bearingsOf,
  CHARACTERISTIC_FIELDS,
  type Characteristics,
  COMPASS,
  isCompassField,
  type ListedField,
  SEASONS,
  SIZE_FACTORS,
  wordsText,
} from "./characteristic-words";

// What a surf break is like, drawn as the web's `break-characteristics.tsx` draws it: each line
// of its guide with its glyph, a round drawn from what the line says as Stormrider's guides draw
// a break, then its name over what it says. The glyphs are `@repo/ui/icon`'s, drawn natively by
// `Glyph` (decision 069).

/** The size a glyph is read at, beside two lines of text. */
export const GLYPH_SIZE = 40;

const has = (given: readonly string[], ...words: string[]) =>
  words.some((word) => given.includes(word));

/** A glyph of the surf icons, whose props are its own, as `Glyph` draws an icon. */
function surf<Props>(icon: (props: Props) => ReactNode, props: Props): GlyphIcon {
  return (base) => icon({ ...(base as Props), ...props });
}

/** The glyph a characteristic is drawn with, from what it says. One that says nothing is empty. */
function glyphOf(field: ListedField, given: readonly string[], look?: SurfLook): GlyphIcon {
  switch (field) {
    case "breakTypes": {
      const shape = (Object.keys(BREAK_TYPES) as BreakShape[]).find((word) => given.includes(word));
      return surf(BreakTypeIcon, { shape: shape ?? "beach", look });
    }
    case "waveDirections":
      return surf(WaveDirectionIcon, {
        left: has(given, "left"),
        right: has(given, "right"),
        look,
      });
    case "bottomTypes":
      return surf(BottomIcon, {
        bottoms: given.filter((word) => word in BOTTOM_TYPES) as BottomKind[],
        look,
      });
    case "abilityLevels": {
      const order = Object.keys(ABILITY_LEVELS);
      return surf(LevelIcon, {
        levels: given.map((word) => order.indexOf(word)).filter((at) => at >= 0),
        of: order.length,
        look,
      });
    }
    case "boardTypes":
      return surf(BoardIcon, { look });
    case "bestSeasons":
      return surf(SeasonIcon, {
        seasons: given.filter((word) => word in SEASONS) as Season[],
        look,
      });
    case "bestTides":
      return surf(TideIcon, {
        low: has(given, "low", "mid_low"),
        mid: has(given, "mid_low", "mid", "mid_high"),
        high: has(given, "mid_high", "high"),
        look,
      });
    case "bestSwellDirections":
      return surf(SwellWindowIcon, { bearings: bearingsOf(given), look });
    case "bestWindDirections":
      return surf(WindWindowIcon, { bearings: bearingsOf(given), look });
    case "sizeFactors": {
      const order = Object.keys(SIZE_FACTORS);
      return surf(SizeFactorIcon, {
        steps: given.map((word) => order.indexOf(word)).filter((at) => at >= 0),
        look,
      });
    }
  }
}

/**
 * A characteristic's glyph, drawn from what it says. One that says nothing yet is drawn empty,
 * and lighter. What it says is read in words beside it: the glyph says nothing to a screen reader.
 */
export function CharacteristicIcon({
  field,
  given,
  look,
  size = GLYPH_SIZE,
  faint = false,
}: {
  field: ListedField;
  given: readonly string[];
  look?: SurfLook;
  size?: number;
  faint?: boolean;
}) {
  const { colors } = useTheme();
  // Each line has its glyph, whose hooks are its own: a glyph of another line is drawn anew.
  return (
    <Glyph
      key={field}
      icon={glyphOf(field, given, look)}
      size={size}
      color={faint ? colors["neutral-6"] : colors["neutral-10"]}
    />
  );
}

/** The glyph of the wind that blows offshore at a break: its arrow alone. */
export function OffshoreIcon({ degrees }: { degrees: number }) {
  const { colors } = useTheme();
  return (
    <Glyph
      icon={surf(WindWindowIcon, { bearings: [degrees], window: false })}
      size={GLYPH_SIZE}
      color={colors["neutral-10"]}
    />
  );
}

type WaveSize = NonNullable<Characteristics["waveSizeMeters"]>;

/** The glyph of the size a break works at. */
export function SizeIcon({ size }: { size: WaveSize }) {
  const { colors } = useTheme();
  return (
    <Glyph
      icon={surf(WaveSizeIcon, { largest: size.max })}
      size={GLYPH_SIZE}
      color={colors["neutral-10"]}
    />
  );
}

/**
 * The size a break works at, in the reader's unit: a whole number of feet, as a list gives them,
 * or meters to the tenth.
 */
export function useSizeReading(size: WaveSize | null) {
  const { height } = useUnits();
  if (!size) return null;
  const figure = (meters: number) => heightFigure(meters, height === "ft" ? 0 : 1);
  const unit = heightUnit();
  if (size.min !== null && size.max !== null) {
    return m.break_size_range({ min: figure(size.min), max: figure(size.max), unit });
  }
  if (size.min !== null) return m.break_size_from({ min: figure(size.min), unit });
  return size.max === null ? null : m.break_size_up_to({ max: figure(size.max), unit });
}

/**
 * The words of one characteristic as they read: its points each with its arrow, in the compass's
 * order, or its words. A screen reader hears the same words a line of text would say.
 */
export function WordsReading({
  field,
  given,
  tone,
}: {
  field: ListedField;
  given: readonly string[];
  tone?: "muted";
}) {
  const { colors, space } = useTheme();
  if (isCompassField(field)) {
    return (
      <View
        accessible
        accessibilityLabel={wordsText(field, given)}
        style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.xs, rowGap: space.xxs }}
      >
        {COMPASS.filter((point) => given.includes(point)).map((point) => (
          <Bearing
            key={point}
            degrees={bearingOf(point)}
            color={tone === "muted" ? colors["neutral-7"] : undefined}
          />
        ))}
      </View>
    );
  }
  return (
    <Text size="s" tone={tone}>
      {wordsText(field, given)}
    </Text>
  );
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
  label: string;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: GLYPH_SIZE, height: GLYPH_SIZE }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text size="s" tone="muted">
          {label}
        </Text>
        {typeof children === "string" ? <Text size="s">{children}</Text> : children}
      </View>
    </View>
  );
}

/** A row of a guide that says something and opens nothing. */
export function StillRow({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.m, paddingVertical: space.xs, minHeight: TARGET }}>
      {children}
    </View>
  );
}

/**
 * What is known of a place in the catalogue's words, as rows of a grouped list: each list of
 * words that says something, with its glyph, in the order a guide gives them.
 */
export function listedRows(known: Characteristics): ReactElement[] {
  return CHARACTERISTIC_FIELDS.flatMap(({ key, label }) => {
    const given = known[key];
    return given && given.length > 0
      ? [
          <StillRow key={key}>
            <CharacteristicRow
              icon={<CharacteristicIcon field={key} given={given} />}
              label={label()}
            >
              <WordsReading field={key} given={given} />
            </CharacteristicRow>
          </StillRow>,
        ]
      : [];
  });
}

/**
 * The rows of what is measured of a place: where its wind blows offshore from, and the size it
 * works at, which `size` says as `useSizeReading` reads it.
 */
export function measuredRows(known: Characteristics, size: string | null): ReactElement[] {
  const offshore = known.offshoreDirectionDegrees;
  return [
    ...(offshore == null
      ? []
      : [
          <StillRow key="offshore">
            <CharacteristicRow
              icon={<OffshoreIcon degrees={offshore} />}
              label={m.break_offshore_wind()}
            >
              <Bearing degrees={offshore} />
            </CharacteristicRow>
          </StillRow>,
        ]),
    ...(known.waveSizeMeters && size
      ? [
          <StillRow key="size">
            <CharacteristicRow
              icon={<SizeIcon size={known.waveSizeMeters} />}
              label={m.break_wave_size()}
            >
              {size}
            </CharacteristicRow>
          </StillRow>,
        ]
      : []),
  ];
}

/**
 * What the instance's operator wrote of a break, in the language they wrote it in, whichever the
 * reader's: decision 049.
 */
export function BreakDescription({
  description,
}: {
  description: { text: string; language: string } | null;
}) {
  if (!description) return null;
  return <Text size="s">{description.text}</Text>;
}
