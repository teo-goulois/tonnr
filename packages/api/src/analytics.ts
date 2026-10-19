import type { Tool } from "./mcp";

/** Product analytics is optional. The server supplies the transport; tests supply none. */
export type Analytics = {
  capture: (event: string, request: AnalyticsRequest, account?: string) => void;
  // A fault of the API, reported with nothing of the request that met it: decision 054.
  report?: (error: unknown) => void;
};

// The app a request comes from: the web app, or an app for phones on its platform.
export type Surface = "web" | "ios" | "android";

// These fields have their own headers, never a request's body, URL, or authorization.
// `app` is what an app for phones says of itself; the web app says nothing.
export type AnalyticsRequest = {
  distinctId: string;
  sessionId: string;
  app?: AppClient;
};

/** An app for phones as it names itself in `X-App`: its platform, its version and its build. */
export type AppClient = { surface: Exclude<Surface, "web">; version: string };

/**
 * What an app for phones says of itself in `X-App`, such as `ios 1.2.0 34`: its platform, then
 * the version and the build of the binary. Null for anything else. Decision 069.
 */
export function appClientOf(header: string | null | undefined): AppClient | null {
  const said = /^(ios|android) (\d{1,4}\.\d{1,4}\.\d{1,4}) (\d{1,9})$/.exec(header ?? "");
  if (!said) return null;
  return { surface: said[1] as AppClient["surface"], version: `${said[2]}+${said[3]}` };
}

// What a procedure declares of itself: the event a success of it is, for the product's
// analytics, and the tool it is for an agent, on the MCP server (decision 045).
export type ProcedureMeta = { analytics?: string; mcp?: Tool };

/**
 * Consent and SDK IDs from one of the instance's own apps. An account ID always comes from
 * authentication. `from` says which app the request came from, as the server judged it by its
 * site: an app for phones must also say its platform, or nothing is read.
 */
export function analyticsRequest(
  headers: Headers,
  from: "web" | "app" = "web",
): AnalyticsRequest | undefined {
  if (headers.get("X-Analytics-Consent") !== "granted") return;
  const distinctId = headers.get("X-PostHog-Distinct-Id") ?? "";
  const sessionId = headers.get("X-PostHog-Session-Id") ?? "";
  // SDK device IDs are UUIDs. Identified IDs may be Better Auth's opaque IDs.
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(distinctId)) return;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) return;
  if (from === "web") return { distinctId, sessionId };
  const app = appClientOf(headers.get("X-App"));
  return app ? { distinctId, sessionId, app } : undefined;
}

/** Analytics must never change whether a procedure succeeded. */
export function captureAction(
  analytics: Analytics | undefined,
  request: AnalyticsRequest | undefined,
  event: string | undefined,
  account?: string,
) {
  if (!request || !event) return;
  try {
    analytics?.capture(event, request, account);
  } catch {
    /* The product still worked. */
  }
}
