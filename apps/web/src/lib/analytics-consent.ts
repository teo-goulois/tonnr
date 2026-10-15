import { useSyncExternalStore } from "react";

export type AnalyticsConsent = "granted" | "denied" | null;
const KEY = "analytics-consent";
const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const listeners = new Set<() => void>();
let memory: { choice: AnalyticsConsent; at: number } | null = null;
// Someone who accepted may stop the error reports alone, in the account tab: decision 054.
const ERRORS_KEY = "error-reports";
let errorsOff: boolean | null = null;
const fallback = () => (memory && Date.now() - memory.at < LIFETIME_MS ? memory.choice : null);

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      choice?: unknown;
      at?: unknown;
    } | null;
    if (
      stored &&
      typeof stored.at === "number" &&
      Date.now() - stored.at < LIFETIME_MS &&
      (stored.choice === "granted" || stored.choice === "denied")
    )
      return stored.choice;
    return fallback();
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
    if (choice === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ choice, at: Date.now() }));
  } catch {
    /* A browser that cannot store remembers the choice for this page alone. */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key === KEY || event.key === ERRORS_KEY || event.key === null) {
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
  if (readAnalyticsConsent() !== "granted") return false;
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
