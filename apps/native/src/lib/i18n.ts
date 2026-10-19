import { isLocale, LOCALES, type Locale } from "@repo/config/locales";
import { getLocales } from "expo-localization";
import { getItem, setItem } from "expo-secure-store";

import { setLocale } from "@/paraglide/runtime";

const CHOSEN = "locale";

/** The language the app was set to, else the first of the phone's that the product speaks. */
export function startingLocale(): Locale {
  const chosen = getItem(CHOSEN);
  if (chosen && isLocale(chosen)) return chosen;
  for (const { languageCode } of getLocales()) {
    if (languageCode && isLocale(languageCode)) return languageCode;
  }
  return LOCALES[0];
}

/** Sets the app's language, keeps it on the phone, and says it to whatever reads the messages. */
export function chooseLocale(locale: Locale) {
  setItem(CHOSEN, locale);
  void setLocale(locale, { reload: false });
}

void setLocale(startingLocale(), { reload: false });
