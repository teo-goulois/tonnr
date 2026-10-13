import { describe, expect, it, vi } from "vitest";
vi.mock("@/env.public", () => ({ ENV: {} }));
import { safeBrowserEvent } from "./analytics";
import { proxyAnalytics } from "./analytics-proxy";

describe("browser analytics privacy", () => {
  it("drops URLs, inputs and names, and blocks automatic captures", () => {
    const event = safeBrowserEvent({
      event: "feature_viewed",
      properties: {
        feature: "map",
        $current_url: "https://example.org/app?shared=private-token",
        $referrer: "private",
        email: "private@example.org",
        name: "private",
        text: "private",
        distinct_id: "opaque",
        surface: "web",
      },
    });
    expect(event?.properties).toEqual({
      feature: "map",
      distinct_id: "opaque",
      surface: "web",
      $ip: null,
      $geoip_disable: true,
    });
    expect(safeBrowserEvent({ event: "$autocapture", properties: {} })).toBeNull();
    expect(safeBrowserEvent({ event: "$exception", properties: {} })).toBeNull();
  });
  it("proxies ingestion to a fixed host without cookies, auth, query or incoming IP headers", async () => {
    const read = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const response = await proxyAnalytics(
      new Request("https://example.org/ingest/i/v0/e/?token=private", {
        method: "POST",
        headers: {
          Cookie: "session=private",
          Authorization: "private",
          "X-Forwarded-For": "private",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      "https://eu.i.posthog.com",
      read,
    );
    expect(response.status).toBe(200);
    expect(read.mock.calls[0]![1]?.redirect).toBe("manual");
    expect(read.mock.calls[0]![0]).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect([...new Headers(read.mock.calls[0]![1]?.headers).keys()]).toEqual(["content-type"]);
    expect(
      (
        await proxyAnalytics(
          new Request("https://example.org/ingest/arbitrary", { method: "POST" }),
          "https://eu.i.posthog.com",
          read,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyAnalytics(
          new Request("https://example.org/ingest/e", { method: "POST" }),
          "https://elsewhere.example",
          read,
        )
      ).status,
    ).toBe(404);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

// Cloudflare Workers rejects redirect:"error". Manual mode must still refuse a redirect
// rather than send the event to whatever location an upstream response names.
it("refuses an ingestion redirect without forwarding its location", async () => {
  const read = vi.fn<typeof fetch>(
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://elsewhere.example/private" },
      }),
  );
  const response = await proxyAnalytics(
    new Request("https://example.org/ingest/e/", { method: "POST", body: "{}" }),
    "https://eu.i.posthog.com",
    read,
  );
  expect(read.mock.calls[0]![1]?.redirect).toBe("manual");
  expect(read).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(502);
  expect(response.headers.has("location")).toBe(false);
});
