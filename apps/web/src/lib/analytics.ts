import {
  ACTIVE_DAY_PREFIX,
  safeEvent,
  type ScreenCategories,
  shouldReport,
} from "@repo/client/analytics";
import type { PostHog } from "posthog-js";
import { ENV } from "@/env.public";
import { readAnalyticsConsent, readErrorReports } from "./analytics-consent";

let client: PostHog | undefined;
let loading: Promise<PostHog | undefined> | undefined;
export const analyticsConfigured = Boolean(ENV.VITE_POSTHOG_PROJECT_TOKEN && ENV.VITE_POSTHOG_HOST);

// The screen an error happened on, in the categories `feature_viewed` sends.
let screen: ScreenCategories = {};

// What leaves of an event, and which errors are reported, are packages/client's, which the app
// for phones reads too: decisions 044, 054 and 069.
export function safeBrowserEvent(
  event: {
    event: string;
    properties: Record<string, unknown>;
    $set?: unknown;
    $set_once?: unknown;
    $unset?: unknown;
  } | null,
) {
  return safeEvent(event, screen);
}

const reported = new Set<string>();
let watching = false;

/** Sends an error that the app did not handle, while the product's pages are open. */
export function reportError(error: unknown) {
  if (!watching || !client || !readErrorReports()) return;
  if (!shouldReport(error, reported)) return;
  client.captureException(error);
}

/** Listens for errors while it is mounted. The landing mounts none. */
export function watchErrors() {
  const thrown = (event: ErrorEvent) => reportError(event.error);
  const rejected = (event: PromiseRejectionEvent) => reportError(event.reason);
  window.addEventListener("error", thrown);
  window.addEventListener("unhandledrejection", rejected);
  watching = true;
  return () => {
    watching = false;
    window.removeEventListener("error", thrown);
    window.removeEventListener("unhandledrejection", rejected);
  };
}

export async function startAnalytics() {
  if (
    !analyticsConfigured ||
    import.meta.env.MODE === "test" ||
    readAnalyticsConsent() !== "granted"
  )
    return;
  if (client) {
    client.opt_in_capturing({ captureEventName: false });
    return client;
  }
  return (loading ??= import("posthog-js")
    .then(({ default: posthog }) => {
      // The choice may have changed while the SDK downloaded.
      if (readAnalyticsConsent() !== "granted") {
        loading = undefined;
        return;
      }
      posthog.init(ENV.VITE_POSTHOG_PROJECT_TOKEN!, {
        api_host: `${window.location.origin}/ingest`,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        rageclick: false,
        disable_session_recording: true,
        // Errors are sent by `watchErrors` alone: the SDK's own capture reads the console and
        // loads a script from PostHog's servers.
        capture_exceptions: false,
        capture_performance: false,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        persistence: "localStorage",
        person_profiles: "identified_only",
        save_referrer: false,
        store_google: false,
        custom_campaign_params: [],
        before_send: (event) => {
          if (readAnalyticsConsent() !== "granted") return null;
          if (event?.event === "$exception" && !readErrorReports()) return null;
          const safe = safeBrowserEvent(event);
          return safe
            ? {
                uuid: event!.uuid,
                event: event!.event,
                timestamp: event!.timestamp,
                properties: safe.properties,
              }
            : null;
        },
      });
      // A previous refusal may still be persisted by the SDK. The current explicit grant wins.
      posthog.opt_in_capturing({ captureEventName: false });
      posthog.register({
        surface: "web",
        environment: ENV.VITE_POSTHOG_ENVIRONMENT ?? "development",
        app_version: import.meta.env.VITE_RELEASE ?? "local",
      });
      client = posthog;
      return client;
    })
    .catch(() => {
      loading = undefined;
      return undefined;
    }));
}

export function identifyAnalytics(account: string | undefined) {
  if (!client || readAnalyticsConsent() !== "granted") return;
  if (account) {
    if (client.get_distinct_id() !== account) {
      if (client._isIdentified()) client.reset();
      client.identify(account);
    }
  } else if (client._isIdentified()) client.reset();
}

export function resetAnalytics() {
  client?.reset();
}
export function stopAnalytics() {
  client?.reset();
  client?.opt_out_capturing();
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(ACTIVE_DAY_PREFIX)) localStorage.removeItem(key);
  } catch {
    /* The browser may refuse storage. */
  }
}

export function analyticsHeaders(): Record<string, string> {
  if (!client || readAnalyticsConsent() !== "granted") return {};
  return {
    "X-Analytics-Consent": "granted",
    "X-PostHog-Distinct-Id": client.get_distinct_id(),
    "X-PostHog-Session-Id": client.get_session_id(),
  };
}

export function trackFeature(feature: string, tab?: string, placeKind?: string) {
  if (readAnalyticsConsent() !== "granted") return;
  screen = { feature, tab, place_kind: placeKind };
  client?.capture("feature_viewed", { feature, tab, place_kind: placeKind });
}
