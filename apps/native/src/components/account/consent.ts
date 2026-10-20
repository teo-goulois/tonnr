// Whether the person lets the app send what it uses and what breaks, as the web asks it:
// optional, off until said yes, refused as easily as taken, and kept on the phone 180 days, after
// which it is asked again. The error reports go with the same yes, and may be turned off alone.
// Decisions 044, 054 and 069. Nothing is sent yet: the app's analytics read this choice once they
// are built. A module that imports nothing of React Native, so that a test reads it.

export type AnalyticsConsent = "granted" | "denied" | null;

/** Where the phone keeps the choice, as the web's browser keeps it. */
export const CONSENT_KEY = "analytics-consent";
export const ERRORS_KEY = "error-reports";

/** How long a choice is kept: 180 days, as decision 044 has it. */
export const CONSENT_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

/** The choice kept, while it is younger than its lifetime; null for none, or one too old. */
export function consentFrom(stored: string | null, now: number): AnalyticsConsent {
  try {
    const read = JSON.parse(stored ?? "null") as { choice?: unknown; at?: unknown } | null;
    if (!read || typeof read.at !== "number" || now - read.at >= CONSENT_LIFETIME_MS) return null;
    return read.choice === "granted" || read.choice === "denied" ? read.choice : null;
  } catch {
    return null;
  }
}

/** What the phone keeps of a choice made now. */
export function consentRecord(choice: "granted" | "denied", now: number) {
  return JSON.stringify({ choice, at: now });
}

/** Whether error reports are sent: with the yes, unless they were turned off since. */
export function errorReportsOn(consent: AnalyticsConsent, errorsStored: string | null) {
  return consent === "granted" && errorsStored !== "off";
}
