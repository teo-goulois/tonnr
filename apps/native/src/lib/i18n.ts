import { isLocale, LOCALES, type Locale } from "@repo/config/locales";
import { getLocales } from "expo-localization";

import { setLocale } from "@/paraglide/runtime";

import { secureStorage } from "./secure-storage";

const CHOSEN = "locale";

// The language is kept in the keychain as the session is, readable once the phone was unlocked
// after it started: the system wakes the app for the widgets' task while the phone is locked,
// and this module is read as the bundle loads (decision 074). A language kept before took the
// keychain's default, readable only while the phone is unlocked: it is written again as the app
// starts, which gives it the session's access. A keychain that cannot be read leaves the phone's
// own languages to choose from.

/** The language the app was set to, else the first of the phone's that the product speaks. */
export function startingLocale(): Locale {
  const chosen = keptLocale();
  if (chosen) return chosen;
  for (const { languageCode } of getLocales()) {
    if (languageCode && isLocale(languageCode)) return languageCode;
  }
  return LOCALES[0];
}

function keptLocale(): Locale | undefined {
  let chosen: string | null;
  try {
    chosen = secureStorage.getItem(CHOSEN);
  } catch {
    return undefined;
  }
  if (!chosen || !isLocale(chosen)) return undefined;
  secureStorage.setItemAsync(CHOSEN, chosen).catch(() => {
    // Written again at the next start.
  });
  return chosen;
}

/** Sets the app's language, keeps it on the phone, and says it to whatever reads the messages. */
export function chooseLocale(locale: Locale) {
  secureStorage.setItem(CHOSEN, locale);
  void setLocale(locale, { reload: false });
}

void setLocale(startingLocale(), { reload: false });
