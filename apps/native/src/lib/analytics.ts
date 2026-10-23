import {
  ACTIVE_DAY_PREFIX,
  safeEvent,
  type ScreenCategories,
  shouldReport,
} from "@repo/client/analytics";
import type { privateExceptionList } from "@repo/config/errors";
import * as Application from "expo-application";
import type { PostHog, PostHogPersistedProperty } from "posthog-react-native";
import { Platform } from "react-native";

import { readConsent, readErrorReports } from "@/components/account/use-consent";
import { ENV } from "@/env";

// The product's analytics from the app, as decision 044 has them for the web and decision 069
// for a phone: off until the person says yes, and off for good in a build that names no project.
// The SDK starts only then, sends `feature_viewed`, `$identify` and the error reports of
// decision 054 alone, through the web app's `/ingest`, which keeps the phone's address from
// PostHog, and gives every call to the API the ids its headers carry, so that the API captures
// the actions. What leaves of an event is packages/client's, as the browser's is.

/** Whether this build sends analytics at all: its stage named a project of PostHog. */
export const analyticsConfigured = Boolean(ENV.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN);

/** The environment its events say: `development`, `dev` or `production`. */
export const analyticsEnvironment = ENV.EXPO_PUBLIC_POSTHOG_ENVIRONMENT ?? "development";

let client: PostHog | undefined;
let creating: Promise<PostHog> | undefined;

// The key under which the SDK keeps the events it has not sent yet, which a refusal empties: the
// SDK itself sends what it holds even once it is opted out.
let queueKey: PostHogPersistedProperty | undefined;

// What every event says of the app, as the web's say theirs: its platform, the environment, and
// the version and the build of the binary, as `X-App` says them to the API (decision 069). They
// are written as an event leaves rather than registered, since a reset forgets what is registered.
let appProperties: Record<string, string> = {};

// The screen an error happened on, in the categories `feature_viewed` sends.
let screen: ScreenCategories = {};

// Hermes names the file of a frame by its path on the phone, which on an iPhone holds the id of
// the app's container, made as it was installed: a report says no id, as its message says none.
const ID = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;
type Report = ReturnType<typeof privateExceptionList>;

/** An error report's `$exception_list`, as `privateExceptionList` kept it, with no id in a path. */
function withoutIds<List>(list: List): List {
  if (!Array.isArray(list)) return list;
  return (list as Report).map((entry) => ({
    ...entry,
    stacktrace: {
      ...entry.stacktrace,
      frames: entry.stacktrace.frames.map((frame) => {
        const kept: Record<string, unknown> = { ...frame };
        for (const key of ["filename", "abs_path"]) {
          const path = kept[key];
          if (typeof path === "string") kept[key] = path.replace(ID, "[id]");
        }
        return kept;
      }),
    },
  })) as List;
}

// The SDK keeps its ids and the events it has not sent yet where the app keeps the rest, in the
// `localStorage` expo-sqlite gives it, under keys of its own, so that a refusal forgets them even
// in a run of the app that did not start the SDK.
const SDK_KEYS = "posthog:";
const storage = {
  getItem: (key: string) => localStorage.getItem(`${SDK_KEYS}${key}`),
  setItem: (key: string, value: string) => localStorage.setItem(`${SDK_KEYS}${key}`, value),
};

// The SDK is read only once it starts, as the browser downloads its own: an app that was never
// said yes, or that names no project, runs none of it.
async function create() {
  const { default: SDK, PostHogPersistedProperty: Persisted } =
    await import("posthog-react-native");
  queueKey = Persisted.Queue;
  appProperties = {
    surface: Platform.OS,
    environment: analyticsEnvironment,
    app_version: `${Application.nativeApplicationVersion ?? "0.0.0"}+${Application.nativeBuildVersion ?? "0"}`,
  };
  const posthog = new SDK(ENV.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
    host: `${ENV.EXPO_PUBLIC_SITE_URL.replace(/\/+$/, "")}/ingest`,
    customStorage: storage,
    // The SDK reads nothing of the phone, its name, its system, its language or its time zone,
    // which the allowlist would drop all the same.
    customAppProperties: {},
    // Nothing is captured by itself: no lifecycle, no screens, no touches, no replay, no push,
    // no flags and no surveys. The remote config the SDK asks for at its start, which no option
    // turns off in @posthog/core 1.59.3, is a GET that the web's proxy never forwards, and it goes
    // on without it.
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableSurveys: true,
    setDefaultPersonProperties: false,
    personProfiles: "identified_only",
    disableGeoip: true,
    // Errors are sent by `watchErrors` alone, by the web's rules: the SDK's own capture would
    // send every one, the console's too.
    errorTracking: {
      autocapture: { uncaughtExceptions: false, unhandledRejections: false, console: false },
      exceptionSteps: { enabled: false },
    },
    before_send: (event) => {
      if (readConsent() !== "granted") return null;
      if (event.event === "$exception" && !readErrorReports()) return null;
      const safe = safeEvent(event, screen);
      if (!safe) return null;
      const properties = { ...safe.properties, ...appProperties };
      if ("$exception_list" in properties) {
        properties.$exception_list = withoutIds(properties.$exception_list);
      }
      return { uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties };
    },
  });
  await posthog.ready();
  client = posthog;
  return posthog;
}

/** The SDK, started once the person said yes in a build that names a project; none otherwise. */
export async function startAnalytics() {
  if (!analyticsConfigured || process.env.NODE_ENV === "test" || readConsent() !== "granted")
    return undefined;
  try {
    const posthog = client ?? (await (creating ??= create()));
    // The choice may have changed while it started: what it made is forgotten at once.
    if (readConsent() !== "granted") {
      stopAnalytics();
      return undefined;
    }
    // A refusal the SDK kept from before: the yes given since wins.
    if (posthog.optedOut) await posthog.optIn();
    return posthog;
  } catch {
    creating = undefined;
    return undefined;
  }
}

/**
 * Forgets every id the SDK made: the distinct and anonymous ids, the session, and the device id
 * that its own reset keeps, which the app never sends. A reset also forgets that the SDK was
 * opted out, so that a phone that said no is opted out again.
 */
function forgetIds(posthog: PostHog) {
  posthog.reset([]);
  if (readConsent() !== "granted") void posthog.optOut();
}

/** Says who uses the app by the account's id alone, and starts again as no one when it leaves. */
export function identifyAnalytics(account: string | undefined) {
  if (!client || readConsent() !== "granted") return;
  const identified = client.getDistinctId() !== client.getAnonymousId();
  if (account) {
    if (client.getDistinctId() === account) return;
    if (identified) forgetIds(client);
    client.identify(account);
  } else if (identified) forgetIds(client);
}

/** New ids for whoever comes next: an account signed out, or left this phone. Decision 070. */
export function resetAnalytics() {
  if (client) forgetIds(client);
}

/**
 * Stops everything after a refusal, or a choice too old: the SDK is opted out, the events it had
 * not sent yet are dropped, and the ids, the days remembered and, when the SDK did not start in
 * this run, all it kept on the phone are forgotten.
 */
export function stopAnalytics() {
  screen = {};
  if (client) {
    if (queueKey) client.setPersistedProperty(queueKey, null);
    forgetIds(client);
  }
  try {
    const keys: string[] = [];
    for (let at = 0; at < localStorage.length; at++) {
      const key = localStorage.key(at);
      if (key?.startsWith(ACTIVE_DAY_PREFIX) || (!client && key?.startsWith(SDK_KEYS))) {
        keys.push(key);
      }
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // A storage that cannot be read keeps nothing to forget.
  }
}

/** The consent and the ids that a call to the API carries, so that it captures the action. */
export function analyticsHeaders(): Record<string, string> {
  if (!client || readConsent() !== "granted") return {};
  const distinctId = client.getDistinctId();
  const sessionId = client.getSessionId();
  if (!distinctId || !sessionId) return {};
  return {
    "X-Analytics-Consent": "granted",
    "X-PostHog-Distinct-Id": distinctId,
    "X-PostHog-Session-Id": sessionId,
  };
}

/** Sends the screen in view, once each time it changes: a sheet over it and closed sends nothing. */
export function trackFeature(feature: string, tab?: string, placeKind?: string) {
  if (!client || readConsent() !== "granted") return;
  if (screen.feature === feature && screen.tab === tab && screen.place_kind === placeKind) return;
  screen = { feature, tab, place_kind: placeKind };
  client.capture("feature_viewed", {
    feature,
    ...(tab !== undefined && { tab }),
    ...(placeKind !== undefined && { place_kind: placeKind }),
  });
}

const reported = new Set<string>();
let watching = false;
let listening = false;

// How long a report of an error that ends the app is given to leave before it does.
const LAST_REPORT_MS = 2000;

/**
 * Sends an error that the app did not handle, by the web's rules, with the yes and unless turned
 * off; whether it was sent. The root error boundary calls it after the screens that watched the
 * errors are gone, so it asks nothing of `watchErrors`.
 */
export function reportError(error: unknown) {
  if (!client || !readErrorReports()) return false;
  if (!shouldReport(error, reported)) return false;
  try {
    client.captureException(error);
    return true;
  } catch {
    return false;
  }
}

/** What Hermes gives to be told of a promise rejected with no handler. */
type Hermes = {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
};

/**
 * Listens for what no code caught: an error thrown, whose handler before it still runs, after
 * the report has had a moment to leave when the error ends the app, and in a build for the
 * stores a promise rejected with no handler. In development React Native shows such a promise
 * itself, which this would replace. Listens once; `watchErrors` says whether it reports.
 */
function listen() {
  if (listening) return;
  listening = true;
  const before = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    const sent = watching && reportError(error);
    if (!isFatal || !sent || !client) return before(error, isFatal);
    const waited = new Promise((resolve) => setTimeout(resolve, LAST_REPORT_MS));
    void Promise.race([client.flush(), waited])
      .catch(() => undefined)
      .finally(() => before(error, isFatal));
  });
  if (!__DEV__) {
    // Read from the global object, which names it only under Hermes.
    const hermes = (globalThis as { HermesInternal?: Hermes | null }).HermesInternal;
    hermes?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => void (watching && reportError(rejection)),
      onHandled: () => {},
    });
  }
}

/** Reports the errors the app did not handle while it is on: with the yes, unless turned off. */
export function watchErrors() {
  listen();
  watching = true;
  return () => {
    watching = false;
  };
}
