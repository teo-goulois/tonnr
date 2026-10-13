import { useSyncExternalStore } from "react";

export type AnalyticsConsent = "granted" | "denied" | null;
const KEY = "analytics-consent";
const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const listeners = new Set<() => void>();
let memory: { choice: AnalyticsConsent; at: number } | null = null;
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
  try {
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
    if (event.key === KEY || event.key === null) {
      memory = null;
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
