import {
  type AnalyticsConsent,
  CONSENT_KEY,
  CONSENT_LIFETIME_MS,
  consentFrom,
  consentRecord,
  ERRORS_KEY,
} from "@repo/client/consent";
import { useSyncExternalStore } from "react";

// How the choice is kept, and for how long, is packages/client's, which the app for phones reads
// too: decision 044.
export type { AnalyticsConsent } from "@repo/client/consent";
const listeners = new Set<() => void>();
let memory: { choice: AnalyticsConsent; at: number } | null = null;
// Someone who accepted may stop the error reports alone, in the account tab: decision 054.
let errorsOff: boolean | null = null;
// An operator may turn them off for every browser, which the API says: on until it does.
let instanceErrorsOff = false;
const fallback = () =>
  memory && Date.now() - memory.at < CONSENT_LIFETIME_MS ? memory.choice : null;

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;
  try {
    return consentFrom(localStorage.getItem(CONSENT_KEY), Date.now()) ?? fallback();
  } catch {
    return fallback();
  }
}

export function setAnalyticsConsent(choice: AnalyticsConsent) {
  memory = { choice, at: Date.now() };
  // Accepting answers the one question, which names the error reports too: they are on again.
  if (choice === "granted") errorsOff = false;
  try {
    if (choice === "granted") localStorage.removeItem(ERRORS_KEY);
    if (choice === null) localStorage.removeItem(CONSENT_KEY);
    else localStorage.setItem(CONSENT_KEY, consentRecord(choice, Date.now()));
  } catch {
    /* A browser that cannot store remembers the choice for this page alone. */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY || event.key === ERRORS_KEY || event.key === null) {
      memory = null;
      errorsOff = null;
      listener();
    }
  };
  window.addEventListener("storage", changed);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", changed);
  };
}

export function useAnalyticsConsent() {
  return useSyncExternalStore(subscribe, readAnalyticsConsent, () => null);
}

/** Whether error reports are sent: with the consent, unless they were turned off since. */
export function readErrorReports() {
  if (instanceErrorsOff || readAnalyticsConsent() !== "granted") return false;
  if (errorsOff === null) {
    try {
      errorsOff = localStorage.getItem(ERRORS_KEY) === "off";
    } catch {
      errorsOff = false;
    }
  }
  return !errorsOff;
}

export function setErrorReports(on: boolean) {
  errorsOff = !on;
  try {
    if (on) localStorage.removeItem(ERRORS_KEY);
    else localStorage.setItem(ERRORS_KEY, "off");
  } catch {
    /* Remembered for this page alone. */
  }
  for (const listener of listeners) listener();
}

export function useErrorReports() {
  return useSyncExternalStore(subscribe, readErrorReports, () => false);
}

/** What the instance says of the web app's error reports, which no person's choice overrides. */
export function setInstanceErrorReports(on: boolean) {
  if (instanceErrorsOff === !on) return;
  instanceErrorsOff = !on;
  for (const listener of listeners) listener();
}

const readInstanceErrorReports = () => !instanceErrorsOff;

export function useInstanceErrorReports() {
  return useSyncExternalStore(subscribe, readInstanceErrorReports, () => true);
}
