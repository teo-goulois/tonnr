import type { Locale } from "@repo/config/locales";
import { reloadAppAsync } from "expo";
import { router } from "expo-router";
import { useEffect } from "react";

import { chooseLocale } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

// A language chosen in the account's tab starts the app again in it, as a phone does when an
// app's language is changed in its settings, and the app comes back to that tab, as the web's
// page loads again at the same address in the new language. Where to come back is kept once, in
// the localStorage that expo-sqlite gives the app, and forgotten as soon as it is read.

const COME_BACK = "restart-to";
const ACCOUNT_TAB = "/account";

/** Keeps the language, then starts the app again in it, on the account's tab. */
export function restartInLanguage(locale: Locale) {
  chooseLocale(locale);
  try {
    localStorage.setItem(COME_BACK, ACCOUNT_TAB);
  } catch {
    // A phone that keeps nothing starts again on the map.
  }
  void reloadAppAsync(m.account_language());
}

/** Goes back to the account's tab once, after the app started again in another language. */
export function useComeBackAfterRestart() {
  useEffect(() => {
    let back: string | null;
    try {
      back = localStorage.getItem(COME_BACK);
      localStorage.removeItem(COME_BACK);
    } catch {
      return;
    }
    if (back === ACCOUNT_TAB) router.navigate(ACCOUNT_TAB);
  }, []);
}
