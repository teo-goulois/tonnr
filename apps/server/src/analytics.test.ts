import { afterEach, describe, expect, it, vi } from "vitest";
const sink = vi.hoisted(() => ({
  capture: vi.fn<(event: { uuid?: string; properties: Record<string, unknown> }) => void>(),
  shutdown: vi.fn(),
  on: vi.fn(),
}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = sink.capture;
    shutdown = sink.shutdown;
    on = sink.on;
  },
}));
import { createAnalytics } from "./analytics";

const env = {
  NODE_ENV: "development",
  POSTHOG_PROJECT_TOKEN: "fake-project-token",
  POSTHOG_HOST: "https://eu.i.posthog.com",
  POSTHOG_ENVIRONMENT: "development",
};
const request = {
  distinctId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("the optional analytics transport", () => {
  it("constructs no client in tests, CI, or an instance without a token", () => {
    expect(createAnalytics({ ...env, NODE_ENV: "test" }, null)).toBeUndefined();
    vi.stubEnv("CI", "true");
    expect(createAnalytics(env, null)).toBeUndefined();
    vi.stubEnv("CI", "");
    expect(createAnalytics({ NODE_ENV: "production" }, null)).toBeUndefined();
  });
  it("deduplicates a UTC day across devices and restarts with the same timestamp and UUID", () => {
    vi.stubEnv("CI", "");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const first = createAnalytics(env, "a".repeat(40))!;
    first.capture("app_active", request, "account-one");
    first.capture("app_active", { ...request, distinctId: "another-device" }, "account-one");
    expect(sink.capture).toHaveBeenCalledTimes(1);
    const event = sink.capture.mock.calls[0]![0];
    createAnalytics(env, "a".repeat(40))!.capture("app_active", request, "account-one");
    expect(sink.capture.mock.calls[1]![0]).toEqual(event);
    expect(event.properties).toEqual({
      surface: "web",
      environment: "development",
      app_version: "a".repeat(40),
      $session_id: request.sessionId,
      $geoip_disable: true,
      $ip: null,
      authenticated: true,
      $process_person_profile: true,
    });
    vi.setSystemTime(new Date("2026-01-02T00:01:00Z"));
    first.capture("app_active", request, "account-one");
    expect(sink.capture.mock.calls[2]![0].uuid).not.toBe(event.uuid);
  });
  it("refuses an anonymous request claiming an opaque account ID", () => {
    vi.stubEnv("CI", "");
    createAnalytics(env, null)!.capture("app_active", { ...request, distinctId: "account-one" });
    expect(sink.capture).not.toHaveBeenCalled();
  });
});
