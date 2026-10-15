import { afterEach, describe, expect, it, vi } from "vitest";
const sink = vi.hoisted(() => ({
  capture: vi.fn<(event: { uuid?: string; properties: Record<string, unknown> }) => void>(),
  captureException: vi.fn(),
  shutdown: vi.fn(),
  on: vi.fn(),
}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = sink.capture;
    captureException = sink.captureException;
    shutdown = sink.shutdown;
    on = sink.on;
  },
}));
import { createAnalytics, privateFault } from "./analytics";

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
  it("reports a fault under the API's name, never a caller's", () => {
    vi.stubEnv("CI", "");
    const fault = new Error("boom");
    createAnalytics(env, null)!.report!(fault);
    expect(sink.captureException).toHaveBeenCalledWith(fault, "api");
  });
});
describe("a fault's report", () => {
  it("keeps what failed and where, and nothing of the request or the person", () => {
    const event = privateFault(
      {
        event: "$exception",
        distinctId: "someone",
        uuid: "00000000-0000-4000-8000-000000000003",
        properties: {
          $exception_list: [
            {
              type: "DrizzleQueryError",
              value:
                'Failed query: insert into "push_subscription" ("endpoint") values ($1)\n' +
                "params: https://fcm.googleapis.com/fcm/send/private-token",
              mechanism: { type: "generic", handled: true },
              stacktrace: {
                type: "raw",
                frames: [
                  {
                    filename: "/app/dist/index.mjs",
                    function: "subscribe",
                    lineno: 10,
                    colno: 2,
                    in_app: true,
                    context_line: "await db.insert(pushSubscription)",
                  },
                ],
              },
            },
          ],
          url: "https://api.example.org/rpc/push/subscribe?private=1",
          headers: { cookie: "private" },
          $exception_personURL: "https://eu.posthog.com/person/someone",
        },
      },
      "production",
      "b".repeat(40),
    );
    expect(event).toEqual({
      event: "$exception",
      distinctId: "api",
      uuid: "00000000-0000-4000-8000-000000000003",
      properties: {
        $exception_list: [
          {
            type: "DrizzleQueryError",
            value:
              'Failed query: insert into "push_subscription" ("endpoint") values ($1)\n[params]',
            mechanism: { type: "generic", handled: true },
            stacktrace: {
              type: "raw",
              frames: [
                {
                  filename: "/app/dist/index.mjs",
                  function: "subscribe",
                  lineno: 10,
                  colno: 2,
                  in_app: true,
                  context_line: "await db.insert(pushSubscription)",
                },
              ],
            },
          },
        ],
        service: "api",
        environment: "production",
        app_version: "b".repeat(40),
        $process_person_profile: false,
        $geoip_disable: true,
        $ip: null,
      },
    });
    const action = { event: "app_active", distinctId: "x", properties: {} };
    expect(privateFault(action, "production", null)).toBe(action);
  });
});
