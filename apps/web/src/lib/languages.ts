import { baseLocale, getLocale, locales, setLocale } from "@/paraglide/runtime.js";
import type { Locale } from "@/paraglide/runtime.js";

// A language is named in itself, whatever language the screen is read in.
export const LANGUAGES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
};

/** The language after the one the screen is read in, and the first after the last. */
export function nextLocale(): Locale {
  return locales[(locales.indexOf(getLocale()) + 1) % locales.length] ?? baseLocale;
}

/** Reads the screen in the next language. */
export function switchLocale() {
  void setLocale(nextLocale());
}
