import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { analyticsRequest, appClientOf, captureAction } from "./analytics";
import type { Context } from "./context";
import { protectedProcedure } from "./index";

const request = {
  distinctId: "device_opaque_id",
  sessionId: "00000000-0000-4000-8000-000000000000",
};

describe("product action analytics", () => {
  it("takes explicit consent and technical identifiers only", () => {
    const headers = new Headers({
      "X-PostHog-Distinct-Id": request.distinctId,
      "X-PostHog-Session-Id": request.sessionId,
      Authorization: "never read this",
    });
    expect(analyticsRequest(headers)).toBeUndefined();
    headers.set("X-Analytics-Consent", "granted");
    expect(analyticsRequest(headers)).toEqual(request);
    headers.set("X-PostHog-Session-Id", "a token or free text");
    expect(analyticsRequest(headers)).toBeUndefined();
  });
  it("reads an app for phones only when it says its platform and its build", () => {
    const headers = new Headers({
      "X-Analytics-Consent": "granted",
      "X-PostHog-Distinct-Id": request.distinctId,
      "X-PostHog-Session-Id": request.sessionId,
    });
    expect(analyticsRequest(headers, "app")).toBeUndefined();
    headers.set("X-App", "ios 1.2.0 34");
    expect(analyticsRequest(headers, "app")).toEqual({
      ...request,
      app: { surface: "ios", version: "1.2.0+34" },
    });
    // The web app's requests are the web's, whatever they say: no page may send the header.
    expect(analyticsRequest(headers, "web")).toEqual(request);
  });
  it.each([
    "ios",
    "ios 1.2.0",
    "web 1.2.0 3",
    "android 1.2 3",
    "android 1.2.0 3 extra",
    "ios 1.2.0 x",
  ])("reads nothing of an app from %j", (header) => {
    expect(appClientOf(header)).toBeNull();
  });
  it("captures one successful procedure with its authenticated ID, never its input/output", async () => {
    const capture = vi.fn();
    const context = {
      session: { user: { id: "account-one" } },
      authorization: null,
      usage: { count: vi.fn() },
      analytics: { capture },
      analyticsRequest: request,
    } as unknown as Context;
    const action = protectedProcedure
      .meta({ analytics: "example_saved" })
      .handler(() => ({ secret: "private words" }));
    await expect(call(action, undefined, { context })).resolves.toEqual({
      secret: "private words",
    });
    expect(capture).toHaveBeenCalledExactlyOnceWith("example_saved", request, "account-one");
    const refused = protectedProcedure.meta({ analytics: "example_deleted" }).handler(() => {
      throw new Error("private words");
    });
    await expect(call(refused, undefined, { context })).rejects.toThrow("private words");
    expect(capture).toHaveBeenCalledTimes(1);
  });
  it("does not capture without consent, and a transport failure cannot refuse a successful action", () => {
    const capture = vi.fn(() => {
      throw new Error("transport unavailable");
    });
    captureAction({ capture }, undefined, "example_saved");
    expect(capture).not.toHaveBeenCalled();
    expect(() => captureAction({ capture }, request, "example_saved")).not.toThrow();
  });
});
