import {
  type AnalyticsConsent,
  CONSENT_KEY,
  consentFrom,
  consentWrites,
  ERRORS_KEY,
  errorReportsOn,
} from "@repo/client/consent";
import { useSyncExternalStore } from "react";

// The person's choice about analytics and error reports, as the phone keeps it: decisions 044 and
// 054. What is written, and for how long, is packages/client's, which the web app reads too.

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const told = () => {
  for (const listener of listeners) listener();
};

// An operator may turn the error reports off for every device, which the API says: on until it
// does, for this run of the app.
let instanceErrorsOff = false;

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
    const { set, remove } = consentWrites(choice, Date.now());
    for (const key of remove) localStorage.removeItem(key);
    for (const [key, value] of set) localStorage.setItem(key, value);
  } catch {
    // A phone that keeps nothing asks again next time.
  }
  told();
}

/** Whether error reports are sent: with the yes, unless the person or the instance turned them off. */
export function readErrorReports() {
  return !instanceErrorsOff && errorReportsOn(readConsent(), stored(ERRORS_KEY));
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

/** What the instance says of the apps' error reports, which no person's choice overrides. */
export function setInstanceErrorReports(on: boolean) {
  if (instanceErrorsOff === !on) return;
  instanceErrorsOff = !on;
  told();
}

const readInstanceErrorReports = () => !instanceErrorsOff;

export function useConsent() {
  return useSyncExternalStore(subscribe, readConsent, readConsent);
}

export function useErrorReports() {
  return useSyncExternalStore(subscribe, readErrorReports, readErrorReports);
}

export function useInstanceErrorReports() {
  return useSyncExternalStore(subscribe, readInstanceErrorReports, readInstanceErrorReports);
}
