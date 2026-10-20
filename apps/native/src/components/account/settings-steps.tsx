import { APP_NAME } from "@repo/config/app";
import { isLocale, LOCALES, type Locale } from "@repo/config/locales";
import { UNIT_CHOICES } from "@repo/client/units";
import { scaleColor, scaleInk, WAVE_HEIGHT_SCALE, WINDGURU_SCALES } from "@repo/client/sea-scales";
import { reloadAppAsync } from "expo";
import { Stack } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatNumber } from "@/lib/format";
import { chooseLocale } from "@/lib/i18n";
import { THEME_CHOICES } from "@/lib/theme-choice";
import { useTheme } from "@/lib/theme";
import {
  distanceIn,
  heightIn,
  rainDigits,
  rainIn,
  temperatureIn,
  type Units,
  useUnits,
  windIn,
} from "@/lib/units";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { unitName } from "./unit-name";
import { ChoiceList } from "./choice-list";
import {
  DENSITIES,
  type Density,
  densityName,
  PALETTES,
  type Palette,
  setPalette,
  useDensity,
  usePalette,
} from "./display";
import { useSaveDensity, useSaveUnits } from "./kept-settings";
import { LANGUAGES, MEASURES } from "./settings-words";

// The steps one press into the account's tab that each choose one setting among a few: a unit,
// the theme, how much of the forecast a panel shows, the colors of the week's table and the
// language. Each says what it chooses with an example of it, and a press chooses at once.

/** A step of the account's tab: its title in the bar, and what it holds under it, scrolled. */
export function Step({ title, children }: { title: string; children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
        contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.xxl }}
      >
        {children}
      </ScrollView>
    </>
  );
}

// An example of a measurement in each of its units, as the screens write it.
const EXAMPLES: { [Measure in keyof Units]: (unit: Units[Measure]) => string } = {
  windSpeed: (unit) =>
    `${formatNumber(windIn(12, unit), unit === "ms" ? 1 : 0)} ${unitName("windSpeed", unit)}`,
  height: (unit) => `${formatNumber(heightIn(1.8, unit), 1)} ${unitName("height", unit)}`,
  temperature: (unit) =>
    `${formatNumber(temperatureIn(16, unit), 0)} ${unitName("temperature", unit)}`,
  distance: (unit) => `${formatNumber(distanceIn(10, unit), 1)} ${unitName("distance", unit)}`,
  precipitation: (unit) =>
    `${formatNumber(rainIn(2.5, unit), rainDigits(unit))} ${unitName("precipitation", unit)}`,
};

/** The unit one measurement is written in, everywhere at once: decision 033. */
export function UnitStep<Measure extends keyof Units>({ measure }: { measure: Measure }) {
  const units = useUnits();
  const saveUnits = useSaveUnits();
  const label = MEASURES.find((one) => one.measure === measure)?.label() ?? "";
  // Each measure's choices are its own units, which the shared list does not say by its type.
  const offered = UNIT_CHOICES[measure] as unknown as readonly Units[Measure][];
  const choices = offered.map((unit) => ({
    value: unit,
    title: unitName(measure, unit),
    description: m.native_unit_example({ example: EXAMPLES[measure](unit) }),
  }));
  return (
    <Step title={label}>
      <ChoiceList
        choices={choices}
        value={units[measure]}
        onChoose={(unit) => saveUnits({ [measure]: unit } as Partial<Units>)}
        footer={m.native_units_footer()}
      />
    </Step>
  );
}

/** The theme: the system's, light or dark, which the phone keeps (decision 040). */
export function ThemeStep() {
  const { choice, choose } = useTheme();
  const words = {
    system: m.account_theme_system,
    light: m.account_theme_light,
    dark: m.account_theme_dark,
  } as const;
  return (
    <Step title={m.account_theme()}>
      <ChoiceList
        choices={THEME_CHOICES.map((value) => ({
          value,
          title: words[value](),
          description: value === "system" ? m.native_theme_system_hint() : undefined,
        }))}
        value={choice}
        onChoose={choose}
      />
    </Step>
  );
}

/**
 * A sketch of the panel at a density: a sentence for the simple one, three tiles for the
 * classic one, four and a table for the complete one, in the colors of the sea's scales.
 */
function DensityPreview({ density }: { density: Density }) {
  const { colors, space, radius } = useTheme();
  const tiles = density === "essentials" ? 0 : density === "details" ? 3 : 4;
  const tile = (index: number) => (
    <View
      key={index}
      style={{
        flex: 1,
        height: 28,
        borderRadius: radius.xs / 2,
        backgroundColor: scaleColor(WAVE_HEIGHT_SCALE, [1.2, 1.8, 2.4, 3][index] ?? 1),
      }}
    />
  );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        gap: space.xxs,
        padding: space.xs,
        marginTop: space.xxs,
        borderRadius: radius.xs / 2,
        backgroundColor: colors["neutral-3"],
      }}
    >
      {density === "essentials" ? (
        <>
          <Skeleton height={8} width="90%" />
          <Skeleton height={8} width="60%" />
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: space.xxs }}>
          {Array.from({ length: tiles }, (_, index) => tile(index))}
        </View>
      )}
      {density === "everything" ? <Skeleton height={8} width="75%" /> : null}
    </View>
  );
}

const DENSITY_HINTS: Record<Density, () => string> = {
  essentials: m.native_density_essentials_hint,
  details: m.native_density_details_hint,
  everything: m.native_density_everything_hint,
};

/** How much of the forecast a panel shows, kept in the account and on the phone: decision 061. */
export function DensityStep() {
  const density = useDensity();
  const saveDensity = useSaveDensity();
  return (
    <Step title={m.account_density()}>
      <ChoiceList
        choices={DENSITIES.map((value) => ({
          value,
          title: densityName(value),
          description: DENSITY_HINTS[value](),
          preview: <DensityPreview density={value} />,
        }))}
        value={density}
        onChoose={saveDensity}
        footer={m.native_density_footer()}
      />
    </Step>
  );
}

// The heights a strip of the week's table shows, in metres, from flat to big.
const STRIP = [0.4, 1, 1.6, 2.4, 3.4, 5];

/** A row of the week's table in a palette, with its heights written on it. */
function PaletteStrip({ palette }: { palette: Palette }) {
  const { space, radius } = useTheme();
  const scale = palette === "windguru" ? WINDGURU_SCALES.height : WAVE_HEIGHT_SCALE;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: "row",
        marginTop: space.xxs,
        borderRadius: radius.xs / 2,
        overflow: "hidden",
      }}
    >
      {STRIP.map((meters) => (
        <View
          key={meters}
          style={{
            flex: 1,
            paddingVertical: space.xxs,
            alignItems: "center",
            backgroundColor: scaleColor(scale, meters),
          }}
        >
          <Text size="xs" numeric dense style={{ color: scaleInk(scale, meters) }}>
            {formatNumber(heightIn(meters), 1)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The colors the week's table of a panel is read in, which the phone keeps. */
export function PaletteStep() {
  const palette = usePalette();
  useUnits();
  return (
    <Step title={m.account_palette()}>
      <ChoiceList
        choices={PALETTES.map((value) => ({
          value,
          title: value === "windguru" ? "Windguru" : APP_NAME,
          description:
            value === "windguru" ? m.native_palette_windguru_hint() : m.native_palette_own_hint(),
          preview: <PaletteStrip palette={value} />,
        }))}
        value={palette}
        onChoose={setPalette}
        footer={m.native_palette_footer()}
      />
    </Step>
  );
}

/**
 * The app's own language, among the four the product speaks: the phone keeps it, and the app
 * starts again in it, as a phone does when an app's language is changed in its settings.
 */
export function LanguageStep() {
  const current = getLocale();
  return (
    <Step title={m.account_language()}>
      <ChoiceList
        choices={LOCALES.map((value) => ({ value, title: LANGUAGES[value] }))}
        value={current}
        onChoose={(next: Locale) => {
          if (!isLocale(next) || next === current) return;
          chooseLocale(next);
          void reloadAppAsync(m.account_language());
        }}
        footer={m.native_language_footer()}
      />
    </Step>
  );
}
