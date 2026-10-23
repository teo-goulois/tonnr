import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The app's analytics against a stand-in for posthog-react-native, which records how it was made
// and what it was asked: nothing is sent, and the phone's storage is a map.

type Options = Record<string, unknown> & {
  before_send: (event: {
    uuid?: string;
    event: string;
    properties?: Record<string, unknown>;
  }) => { properties: Record<string, unknown> } | null;
};

const sdk = vi.hoisted(() => {
  const made: Array<{ token: string; options: Options; calls: string[] }> = [];
  class StandIn {
    calls: string[] = [];
    optedOut = false;
    distinct = "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f00";
    anonymous = this.distinct;
    constructor(
      public token: string,
      public options: Options,
    ) {
      made.push(this);
    }
    ready = () => Promise.resolve();
    getDistinctId = () => this.distinct;
    getAnonymousId = () => this.anonymous;
    getSessionId = () => "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f01";
    identify = (id: string) => {
      this.calls.push(`identify ${id}`);
      this.distinct = id;
    };
    reset = (kept?: unknown[]) => {
      this.calls.push(`reset ${JSON.stringify(kept)}`);
      this.optedOut = false;
      this.distinct = this.anonymous = "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f02";
    };
    optOut = () => {
      this.calls.push("optOut");
      this.optedOut = true;
      return Promise.resolve();
    };
    optIn = () => {
      this.calls.push("optIn");
      this.optedOut = false;
      return Promise.resolve();
    };
    setPersistedProperty = (key: string, value: unknown) =>
      this.calls.push(`persist ${key} ${String(value)}`);
    capture = (event: string) => this.calls.push(`capture ${event}`);
  }
  return { made, StandIn };
});

vi.mock("posthog-react-native", () => ({
  default: sdk.StandIn,
  PostHog: sdk.StandIn,
  PostHogPersistedProperty: { Queue: "queue" },
}));
vi.mock("expo-application", () => ({
  nativeApplicationVersion: "1.2.0",
  nativeBuildVersion: "34",
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/env", () => ({
  ENV: {
    EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
    EXPO_PUBLIC_POSTHOG_ENVIRONMENT: "production",
    EXPO_PUBLIC_SITE_URL: "https://site.example/",
  },
}));

const kept = new Map<string, string>();
const phone = {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => void kept.set(key, value),
  removeItem: (key: string) => void kept.delete(key),
  key: (at: number) => [...kept.keys()][at] ?? null,
  get length() {
    return kept.size;
  },
};

let analytics: typeof import("./analytics");
let consent: typeof import("@/components/account/use-consent");

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("localStorage", phone);
  // The module sends nothing under a test's NODE_ENV: these tests stand for a build.
  vi.stubEnv("NODE_ENV", "production");
  kept.clear();
  sdk.made.length = 0;
  analytics = await import("./analytics");
  consent = await import("@/components/account/use-consent");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the app's analytics before a yes", () => {
  it("starts no SDK and gives the API no header, unasked or refused", async () => {
    expect(await analytics.startAnalytics()).toBeUndefined();
    consent.setConsent("denied");
    expect(await analytics.startAnalytics()).toBeUndefined();
    expect(sdk.made).toHaveLength(0);
    expect(analytics.analyticsHeaders()).toEqual({});
  });

  it("sends nothing in a test, whatever was said", async () => {
    vi.stubEnv("NODE_ENV", "test");
    consent.setConsent("granted");
    expect(await analytics.startAnalytics()).toBeUndefined();
    expect(sdk.made).toHaveLength(0);
  });
});

describe("the app's analytics after a yes", () => {
  it("starts the SDK once, through the web's proxy, with nothing captured by itself", async () => {
    consent.setConsent("granted");
    await analytics.startAnalytics();
    await analytics.startAnalytics();
    expect(sdk.made).toHaveLength(1);
    expect(sdk.made[0]!.token).toBe("phc_test");
    expect(sdk.made[0]!.options).toMatchObject({
      host: "https://site.example/ingest",
      customAppProperties: {},
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true,
      disableSurveys: true,
      setDefaultPersonProperties: false,
      disableGeoip: true,
    });
    expect(analytics.analyticsHeaders()).toEqual({
      "X-Analytics-Consent": "granted",
      "X-PostHog-Distinct-Id": "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f00",
      "X-PostHog-Session-Id": "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f01",
    });
  });

  it("lets an event leave with the allowed properties and the app's own, and no other", async () => {
    consent.setConsent("granted");
    await analytics.startAnalytics();
    const leaving = sdk.made[0]!.options.before_send;
    const sent = leaving({
      uuid: "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f03",
      event: "feature_viewed",
      properties: {
        feature: "map",
        $lib: "posthog-react-native",
        $session_id: "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f01",
        $screen_width: 390,
        $device_name: "iPhone 15",
        $locale: "fr-FR",
        $set: { email: "private@example.org" },
      },
    });
    expect(sent?.properties).toEqual({
      feature: "map",
      $lib: "posthog-react-native",
      $session_id: "0192b1c4-7c3e-7a1b-9f00-2d4b6c8e1f01",
      $ip: null,
      $geoip_disable: true,
      surface: "ios",
      environment: "production",
      app_version: "1.2.0+34",
    });
    expect(leaving({ event: "$screen", properties: {} })).toBeNull();

    consent.setErrorReports(false);
    expect(leaving({ event: "$exception", properties: {} })).toBeNull();
    consent.setConsent("denied");
    expect(leaving({ event: "feature_viewed", properties: { feature: "map" } })).toBeNull();
  });

  it("reports an error with its frames' files named without the container's id", async () => {
    consent.setConsent("granted");
    await analytics.startAnalytics();
    const container =
      "/private/var/containers/Bundle/Application/5C1D2E3F-4A5B-6C7D-8E9F-0A1B2C3D4E5F";
    const sent = sdk.made[0]!.options.before_send({
      event: "$exception",
      properties: {
        $exception_list: [
          {
            type: "TypeError",
            value: "undefined is not a function",
            stacktrace: {
              type: "raw",
              frames: [{ filename: `${container}/Tonnr.app/main.jsbundle`, lineno: 1, colno: 42 }],
            },
          },
        ],
        $app_state: "active",
      },
    });
    expect(sent?.properties.$exception_list).toEqual([
      {
        type: "TypeError",
        value: "undefined is not a function",
        mechanism: undefined,
        stacktrace: {
          type: "raw",
          frames: [
            {
              filename: "/private/var/containers/Bundle/Application/[id]/Tonnr.app/main.jsbundle",
              lineno: 1,
              colno: 42,
            },
          ],
        },
      },
    ]);
    expect(sent?.properties).not.toHaveProperty("$app_state");
  });

  it("identifies by the account's id alone, and starts again as no one at a sign-out", async () => {
    consent.setConsent("granted");
    await analytics.startAnalytics();
    analytics.identifyAnalytics("account-1");
    analytics.resetAnalytics();
    expect(sdk.made[0]!.calls).toEqual(["identify account-1", "reset []"]);
  });
});

describe("a refusal after a yes", () => {
  it("drops what was not sent, forgets the ids and opts the SDK out", async () => {
    consent.setConsent("granted");
    await analytics.startAnalytics();
    kept.set("analytics-active:production:account-1", "2026-10-23");
    consent.setConsent("denied");
    analytics.stopAnalytics();
    expect(sdk.made[0]!.calls).toEqual(["persist queue null", "reset []", "optOut"]);
    expect(analytics.analyticsHeaders()).toEqual({});
    expect(kept.has("analytics-active:production:account-1")).toBe(false);
  });

  it("forgets what the SDK kept in an earlier run, when it did not start in this one", () => {
    kept.set("posthog:.posthog-rn.json", "{}");
    kept.set("analytics-consent", "kept");
    analytics.stopAnalytics();
    expect([...kept.keys()]).toEqual(["analytics-consent"]);
  });
});
