import {
  type AnalyticsConsent,
  CONSENT_KEY,
  consentFrom,
  consentRecord,
  ERRORS_KEY,
  errorReportsOn,
} from "@repo/client/consent";
import { useSyncExternalStore } from "react";

// The person's choice about analytics and error reports, as the phone keeps it: decision 044.

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const told = () => {
  for (const listener of listeners) listener();
};

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The choice in force: yes, no, or none yet. */
export function readConsent(): AnalyticsConsent {
  return consentFrom(stored(CONSENT_KEY), Date.now());
}

/** Keeps a choice for 180 days. Saying yes answers the one question, so error reports are on. */
export function setConsent(choice: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_KEY, consentRecord(choice, Date.now()));
    if (choice === "granted") localStorage.removeItem(ERRORS_KEY);
  } catch {
    // A phone that keeps nothing asks again next time.
  }
  told();
}

/** Whether error reports are sent. */
export function readErrorReports() {
  return errorReportsOn(readConsent(), stored(ERRORS_KEY));
}

export function setErrorReports(on: boolean) {
  try {
    if (on) localStorage.removeItem(ERRORS_KEY);
    else localStorage.setItem(ERRORS_KEY, "off");
  } catch {
    // Kept until the app is closed, as the rest.
  }
  told();
}

export function useConsent() {
  return useSyncExternalStore(subscribe, readConsent, readConsent);
}

export function useErrorReports() {
  return useSyncExternalStore(subscribe, readErrorReports, readErrorReports);
}
