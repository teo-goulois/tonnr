import type { Tool } from "./mcp";

/** Product analytics is optional. The server supplies the transport; tests supply none. */
export type Analytics = {
  capture: (event: string, request: AnalyticsRequest, account?: string) => void;
};

// These fields have their own headers, never a request's body, URL, or authorization.
export type AnalyticsRequest = {
  distinctId: string;
  sessionId: string;
};

// What a procedure declares of itself: the event a success of it is, for the product's
// analytics, and the tool it is for an agent, on the MCP server (decision 045).
export type ProcedureMeta = { analytics?: string; mcp?: Tool };

/** Consent and SDK IDs from the web app. An account ID always comes from authentication. */
export function analyticsRequest(headers: Headers): AnalyticsRequest | undefined {
  if (headers.get("X-Analytics-Consent") !== "granted") return;
  const distinctId = headers.get("X-PostHog-Distinct-Id") ?? "";
  const sessionId = headers.get("X-PostHog-Session-Id") ?? "";
  // SDK device IDs are UUIDs. Identified IDs may be Better Auth's opaque IDs.
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(distinctId)) return;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) return;
  return { distinctId, sessionId };
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
