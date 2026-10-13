import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => {
  let id = "anonymous-device";
  let identified = false;
  let optedOut = true; // A refusal from an earlier visit is persisted by the SDK.
  return {
    init: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    opt_in_capturing: vi.fn(() => {
      optedOut = false;
    }),
    opt_out_capturing: vi.fn(() => {
      optedOut = true;
    }),
    reset: vi.fn(() => {
      id = "anonymous-device";
      identified = false;
    }),
    identify: vi.fn((next: string) => {
      id = next;
      identified = true;
    }),
    get_distinct_id: () => id,
    get_session_id: () => "00000000-0000-4000-8000-000000000001",
    _isIdentified: () => identified,
    optedOut: () => optedOut,
  };
});
vi.mock("@/env.public", () => ({
  ENV: {
    VITE_POSTHOG_PROJECT_TOKEN: "fake-project-token",
    VITE_POSTHOG_HOST: "https://eu.i.posthog.com",
    VITE_POSTHOG_ENVIRONMENT: "development",
  },
}));
vi.mock("posthog-js", () => ({ default: sdk }));
import { analyticsHeaders, identifyAnalytics, startAnalytics, stopAnalytics } from "./analytics";
import { setAnalyticsConsent } from "./analytics-consent";

afterEach(() => {
  vi.unstubAllEnvs();
  setAnalyticsConsent("denied");
  stopAnalytics();
  vi.clearAllMocks();
});
describe("analytics identity and permission lifecycle", () => {
  it("does nothing before permission, and a new grant overrides the SDK's older refusal", async () => {
    vi.stubEnv("MODE", "development");
    setAnalyticsConsent("denied");
    expect(await startAnalytics()).toBeUndefined();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(analyticsHeaders()).toEqual({});
    setAnalyticsConsent("granted");
    await startAnalytics();
    expect(sdk.optedOut()).toBe(false);
    expect(Object.keys(analyticsHeaders())).toHaveLength(3);
  });
  it("resets before identifying another account, and never provides person properties", async () => {
    vi.stubEnv("MODE", "development");
    setAnalyticsConsent("granted");
    await startAnalytics();
    identifyAnalytics("account-one");
    identifyAnalytics("account-two");
    expect(sdk.identify.mock.calls).toEqual([["account-one"], ["account-two"]]);
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.identify.mock.invocationCallOrder[1]!,
    );
    identifyAnalytics(undefined);
    expect(sdk._isIdentified()).toBe(false);
  });
  it("withdraws identity headers and stays opted out after clearing the identity", async () => {
    vi.stubEnv("MODE", "development");
    setAnalyticsConsent("granted");
    await startAnalytics();
    identifyAnalytics("account-one");
    setAnalyticsConsent("denied");
    stopAnalytics();
    expect(sdk.optedOut()).toBe(true);
    expect(analyticsHeaders()).toEqual({});
    expect(sdk._isIdentified()).toBe(false);
  });
});
