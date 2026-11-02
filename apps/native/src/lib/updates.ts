// What the app does of an update of its JavaScript while it runs: decision 075, "Updates of the
// JavaScript". At each start `expo-updates` asks the instance's server and downloads in the
// background. An app kept in memory for days would never start again, so the app also asks when
// it comes back to the screen, once an hour at most, and runs a downloaded update as it comes
// back after a quarter of an hour away, before its person reads anything: never while it is in
// use. Rules apart from React, so that a test reads them.

const MINUTE_MS = 60 * 1000;

/** How long the app is away before it may load what it downloaded as it comes back. */
export const AWAY_MS = 15 * MINUTE_MS;
/** How often the app asks for an update as it comes back, at most. */
export const ASK_EVERY_MS = 60 * MINUTE_MS;

/** What the app does as it comes back to the screen. */
export type OnReturn = "reload" | "ask" | "nothing";

export function onReturn({
  now,
  leftAt,
  askedAt,
  pending,
}: {
  now: number;
  // When the app went to the background, or null when it never did since it was last on screen.
  leftAt: number | null;
  // When the app last asked for an update, its start included.
  askedAt: number;
  // Whether an update is downloaded and waits for the next start.
  pending: boolean;
}): OnReturn {
  if (pending && leftAt !== null && now - leftAt >= AWAY_MS) return "reload";
  if (now - askedAt >= ASK_EVERY_MS) return "ask";
  return "nothing";
}

/** The few characters that name an update, as `release:js` prints them. */
export function updateName(updateId: string | null) {
  return updateId ? updateId.slice(0, 8) : null;
}
