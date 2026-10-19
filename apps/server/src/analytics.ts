import { createHash } from "node:crypto";
import type { Analytics } from "@repo/api/analytics";
import { privateExceptionList } from "@repo/config/errors";
import { PostHog, type EventMessage } from "posthog-node";

type Settings = {
  NODE_ENV: string;
  POSTHOG_PROJECT_TOKEN?: string | undefined;
  POSTHOG_HOST?: string | undefined;
  POSTHOG_ENVIRONMENT?: string | undefined;
};

// A fault of the API is no one's: its report names no caller, and says only what failed and
// where in the code. Decision 054.
const FAULTS = "api";

/** What leaves of an exception the SDK built: no request, no input, no person. */
export function privateFault(
  event: EventMessage | null,
  environment: string | undefined,
  revision: string | null,
): EventMessage | null {
  if (!event || event.event !== "$exception") return event;
  return {
    event: "$exception",
    distinctId: FAULTS,
    ...(event.uuid && { uuid: event.uuid }),
    ...(event.timestamp && { timestamp: event.timestamp }),
    properties: {
      $exception_list: privateExceptionList(event.properties?.$exception_list),
      service: "api",
      environment,
      app_version: revision ?? "local",
      $process_person_profile: false,
      $geoip_disable: true,
      $ip: null,
    },
  };
}

/** Nothing is constructed in tests, CI, or an instance that did not opt into analytics. */
export function createAnalytics(env: Settings, revision: string | null) {
  if (env.NODE_ENV === "test" || process.env.CI || !env.POSTHOG_PROJECT_TOKEN) return;
  if (!env.POSTHOG_HOST || !env.POSTHOG_ENVIRONMENT) {
    throw new Error("POSTHOG_HOST and POSTHOG_ENVIRONMENT are required with POSTHOG_PROJECT_TOKEN");
  }
  const client = new PostHog(env.POSTHOG_PROJECT_TOKEN, {
    host: env.POSTHOG_HOST,
    disableGeoip: true,
    // A fault the API caught is reported by `report`, and through `privateFault` alone.
    enableExceptionAutocapture: false,
    before_send: (event) => privateFault(event, env.POSTHOG_ENVIRONMENT, revision),
    flushAt: 20,
    flushInterval: 5000,
    requestTimeout: 3000,
    fetchRetryCount: 1,
  });
  // Keep no error contents: upstream responses can contain event identifiers.
  client.on("error", () => {});
  const daily = new Map<string, string>();
  const analytics: Analytics = {
    capture(event, request, account) {
      let uuid: string | undefined;
      let timestamp: Date | undefined;
      const distinctId = account ?? request.distinctId;
      // An anonymous browser must give a device UUID, not another account's opaque ID.
      if (!account && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(distinctId)) return;
      // An app for phones says its platform and its build; the web app is the API's revision.
      const properties: Record<string, unknown> = {
        surface: request.app?.surface ?? "web",
        environment: env.POSTHOG_ENVIRONMENT,
        app_version: request.app?.version ?? revision ?? "local",
        $session_id: request.sessionId,
        $geoip_disable: true,
        $ip: null,
        authenticated: account !== undefined,
        $process_person_profile: account !== undefined,
      };
      if (event === "app_active") {
        const day = new Date().toISOString().slice(0, 10);
        if (daily.get(distinctId) === day) return;
        // PostHog deduplicates retries/restarts by this stable UUID, even across devices.
        const digest = createHash("sha256")
          .update(`${env.POSTHOG_ENVIRONMENT}:${distinctId}:${day}`)
          .digest("hex");
        uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
        timestamp = new Date(`${day}T00:00:00.000Z`);
        if (daily.size >= 10000) daily.clear();
        daily.set(distinctId, day);
      }
      client.capture({ distinctId, event, properties, ...(uuid && { uuid, timestamp }) });
    },
    report(error) {
      client.captureException(error, FAULTS);
    },
  };
  return { ...analytics, stop: () => client.shutdown() };
}
