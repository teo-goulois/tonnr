import { privateExceptionList } from "@repo/config/errors";

// What the product's analytics send from a browser and from a phone, the same in both: which
// events leave, with which properties, which errors are reported, the day `app_active` is
// remembered for and the screen's categories. Decisions 044, 054 and 069. Each app gives these
// its SDK, its storage and its screens.

// An SDK's defaults include URLs, referrers and person properties. Only these technical fields
// leave an app; no query or hash, place identifier, text, name, email or input is ever forwarded.
const SAFE_PROPERTIES = new Set([
  "token",
  "distinct_id",
  "$anon_distinct_id",
  "$session_id",
  "$window_id",
  "$device_id",
  "$insert_id",
  "$lib",
  "$lib_version",
  "$is_identified",
  "$process_person_profile",
  "surface",
  "environment",
  "app_version",
  "feature",
  "place_kind",
  "tab",
]);

// The only events an app sends itself: every product action is captured by the API.
const CLIENT_EVENTS = new Set(["$identify", "feature_viewed", "$exception"]);

/** The screen an event was sent from, in the categories `feature_viewed` sends. */
export type ScreenCategories = {
  feature?: string;
  tab?: string | undefined;
  place_kind?: string | undefined;
};

type ClientEvent = {
  event: string;
  properties?: Record<string, unknown>;
  $set?: unknown;
  $set_once?: unknown;
  $unset?: unknown;
};

/**
 * What leaves of an event an SDK built, or null for one that does not leave: the allowed
 * properties alone, no person properties, and for an error report its kind, its scrubbed
 * message and its frames with the screen it happened on, and nothing of the page, the console
 * or the phone (decision 054).
 */
export function safeEvent<T extends ClientEvent>(event: T | null, screen: ScreenCategories = {}) {
  if (!event || !CLIENT_EVENTS.has(event.event)) return null;
  const given = event.properties ?? {};
  const properties: Record<string, unknown> = Object.fromEntries(
    Object.entries(given).filter(([key]) => SAFE_PROPERTIES.has(key)),
  );
  if (event.event === "$exception") {
    properties.$exception_list = privateExceptionList(given.$exception_list);
    Object.assign(properties, screen);
  }
  const { $set: _set, $set_once: _once, $unset: _unset, ...safe } = event;
  return { ...safe, properties: { ...properties, $ip: null, $geoip_disable: true } };
}

// An app that fails in a loop sends a few reports, not one per frame.
const REPORTS = 20;

/**
 * Whether an error is reported, which marks it as reported: an error that no code handled, and
 * not a refusal the API answered (a status under 500) nor an aborted request, which are the app
 * working; each once, and twenty at most for a page or a run of the app.
 */
export function shouldReport(error: unknown, reported: Set<string>, limit = REPORTS) {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && status < 500) return false;
  const key = `${error.name}:${error.message}`;
  if (reported.has(key) || reported.size >= limit) return false;
  reported.add(key);
  return true;
}

/** What starts the keys under which a device remembers the days `app_active` was recorded. */
export const ACTIVE_DAY_PREFIX = "analytics-active:";

/** The day of a moment in UTC, `2026-10-22`: `app_active` is one a day for an id. */
export function utcDay(now: number | Date = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * The key a device remembers the last day `app_active` was recorded under, for an environment
 * and an id, an account's or the device's: the API deduplicates it too, and this saves the call.
 */
export function activeDayKey(environment: string | undefined, id: string) {
  return `${ACTIVE_DAY_PREFIX}${environment}:${id}`;
}

/** What `feature_viewed` says of the sign-in. */
export const SIGN_IN_FEATURE = "authentication:sign_in:";

const PANELS = ["saved", "alerts", "account"];
const SETTINGS = ["alerts", "sessions", "friends", "contributions", "delete", "blocked"];
const TABS = ["guide", "sessions", "alerts"];

/**
 * The screen in view in `feature_viewed`'s categories, as `feature:tab:place_kind`, from what
 * the web app's address says of it: the panel or the step of the account's panel, the tab of a
 * place's panel, and the kind of the place open. Anything else is a fixed word, so that no name,
 * no id and no text leaves. The app for phones says its screens in the same words.
 */
export function featureOf(search: Record<string, unknown>) {
  const allowed = (key: string, values: string[], otherwise: string) => {
    const value = search[key];
    return typeof value === "string" && values.includes(value) ? value : otherwise;
  };
  const panel = allowed("panel", PANELS, "map");
  const settings = allowed("settings", SETTINGS, "");
  const tab = allowed("tab", TABS, "conditions");
  const kind = search.station ? "station" : search.break ? "break" : search.spot ? "spot" : "";
  return [settings || panel, tab, kind].join(":");
}
