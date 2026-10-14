import { describe, expect, it } from "vitest";

import { authReturnTo, googleErrorURL, googleReturnURL } from "./google-auth";

describe("Google sign-in returns", () => {
  it("keeps the language and map context, including shared and invitation links", () => {
    const url = "https://tonnr.test/fr/app?break=surf-1&tab=guide&shared=list-token&invite=friend";
    expect(googleReturnURL(url)).toBe(url);
    const error = new URL(googleErrorURL(url));
    expect(error.pathname).toBe("/fr/login");
    expect(error.searchParams.get("returnTo")).toBe(new URL(url).pathname + new URL(url).search);
  });

  it("leaves the standalone login for the app in the same language", () => {
    expect(googleReturnURL("https://tonnr.test/login")).toBe("https://tonnr.test/app");
    expect(googleReturnURL("https://tonnr.test/fr/login?error=access_denied")).toBe(
      "https://tonnr.test/fr/app",
    );
  });

  it("returns to assistant consent without sending the signed request through OAuth", () => {
    const current = "https://tonnr.test/fr/connect#client_id=assistant&sig=kept-in-the-browser";
    expect(googleReturnURL(current)).toBe("https://tonnr.test/fr/connect");
    const error = new URL(googleErrorURL(current));
    expect(error.searchParams.get("returnTo")).toBe("/fr/connect");
    expect(authReturnTo("/fr/connect#sig=private")).toBe("/fr/connect");
  });

  it("refuses external and unrelated return destinations", () => {
    for (const url of [
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "/login",
      "/app/../login",
      42,
    ]) {
      expect(authReturnTo(url)).toBeUndefined();
    }
    expect(authReturnTo("/fr/app?break=surf-1")).toBe("/fr/app?break=surf-1");
  });
});
