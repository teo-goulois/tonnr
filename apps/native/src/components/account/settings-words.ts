import type { Locale } from "@repo/config/locales";
import type { Units } from "@repo/client/units";

import type { ThemeChoice } from "@/lib/theme-choice";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// What the settings of the account's tab are called, in the web's words: a module that imports
// nothing of React Native, so that a test reads it.

/** A language is named in itself, whatever language the screen is read in. */
export const LANGUAGES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
};

export const THEME_WORDS: Record<ThemeChoice, () => string> = {
  system: m.account_theme_system,
  light: m.account_theme_light,
  dark: m.account_theme_dark,
};

/** Each measurement that has a choice, with what it is called, in the order the web lists them. */
export const MEASURES: { measure: keyof Units; label: () => string }[] = [
  { measure: "windSpeed", label: m.units_wind_speed },
  { measure: "height", label: m.units_height },
  { measure: "temperature", label: m.units_temperature },
  { measure: "distance", label: m.units_distance },
  { measure: "precipitation", label: m.units_precipitation },
];

/** "12 points", or "1 point", by the plural rules of the app's language. */
export function points(count: number) {
  return new Intl.PluralRules(getLocale()).select(count) === "one"
    ? m.contributions_point_one({ count })
    : m.contributions_points({ count });
}

/** How many friends an account has, as its row says it; the hint while it has none. */
export function friendsWords(count: number | undefined) {
  if (!count) return m.friends_hint();
  return count === 1 ? m.friends_count_one() : m.friends_count({ count });
}

/** How many accounts it blocked, as its row says it; the hint while it blocked none. */
export function blocksWords(count: number | undefined) {
  if (!count) return m.blocks_hint();
  return count === 1 ? m.blocks_count_one() : m.blocks_count({ count });
}
