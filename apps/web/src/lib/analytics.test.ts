import { describe, expect, it, vi } from "vitest";
vi.mock("@/env.public", () => ({ ENV: {} }));
import { scrubMessage } from "@repo/config/errors";
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
    expect(safeBrowserEvent({ event: "$console_log", properties: {} })).toBeNull();
  });
  it("sends an error's kind, scrubbed message and frames, and nothing of the page", () => {
    const event = safeBrowserEvent({
      event: "$exception",
      properties: {
        distinct_id: "opaque",
        $current_url: "https://example.org/app?break=private",
        $pathname: "/app",
        $exception_steps: [{ $message: "private" }],
        $exception_personURL: "https://eu.posthog.com/person/opaque",
        $exception_list: [
          {
            type: "TypeError",
            value: "Failed query: select 1\nparams: private@example.org, 47.12345, -2.98765",
            mechanism: { type: "onerror", handled: false, synthetic: false, private: "x" },
            stacktrace: {
              type: "raw",
              frames: [
                {
                  platform: "web:javascript",
                  filename: "https://example.org/assets/app.js?v=private",
                  function: "draw",
                  lineno: 3,
                  colno: 9,
                  in_app: true,
                  vars: { private: "x" },
                },
              ],
            },
          },
        ],
      },
    });
    expect(event?.properties).toEqual({
      distinct_id: "opaque",
      $exception_list: [
        {
          type: "TypeError",
          value: "Failed query: select 1\n[params]",
          mechanism: { type: "onerror", handled: false, synthetic: false },
          stacktrace: {
            type: "raw",
            frames: [
              {
                platform: "web:javascript",
                filename: "https://example.org/assets/app.js",
                function: "draw",
                lineno: 3,
                colno: 9,
                in_app: true,
              },
            ],
          },
        },
      ],
      $ip: null,
      $geoip_disable: true,
    });
  });
  it("takes out of a message what could name someone", () => {
    expect(
      scrubMessage(
        "Push to https://user:secret@fcm.googleapis.com/fcm/send/abc?x=1 failed for " +
          "someone@example.org on 0b9f2c3e-8f4a-4c55-9e0a-2d4b6c8e1f00 at 47.2184, -1.5536 " +
          "with eyJhbGciOiJIUzI1NiJ9abcdefghijk",
      ),
    ).toBe(
      "Push to https://fcm.googleapis.com/[…] failed for [email] on [id] at [number], " +
        "[number] with [token]",
    );
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
