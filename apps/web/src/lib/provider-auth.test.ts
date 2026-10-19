import { describe, expect, it } from "vitest";

import { authReturnTo, providerErrorURL, providerReturnURL } from "./provider-auth";

describe("returns from a provider's sign-in", () => {
  it("keeps the language and map context, including shared and invitation links", () => {
    const url = "https://tonnr.test/fr/app?break=surf-1&tab=guide&shared=list-token&invite=friend";
    expect(providerReturnURL(url)).toBe(url);
    const error = new URL(providerErrorURL(url, "google"));
    expect(error.pathname).toBe("/fr/login");
    expect(error.searchParams.get("returnTo")).toBe(new URL(url).pathname + new URL(url).search);
    expect(error.searchParams.get("with")).toBe("google");
  });

  it("leaves the standalone login for the app in the same language", () => {
    expect(providerReturnURL("https://tonnr.test/login")).toBe("https://tonnr.test/app");
    expect(providerReturnURL("https://tonnr.test/fr/login?error=access_denied")).toBe(
      "https://tonnr.test/fr/app",
    );
  });

  it("returns to assistant consent without sending the signed request through OAuth", () => {
    const current = "https://tonnr.test/fr/connect#client_id=assistant&sig=kept-in-the-browser";
    expect(providerReturnURL(current)).toBe("https://tonnr.test/fr/connect");
    const error = new URL(providerErrorURL(current, "apple"));
    expect(error.searchParams.get("returnTo")).toBe("/fr/connect");
    expect(error.searchParams.get("with")).toBe("apple");
    expect(authReturnTo("/fr/connect#sig=private")).toBe("/fr/connect");
  });

  it("does the same in every language", () => {
    for (const prefix of ["/es", "/pt"]) {
      expect(providerReturnURL(`https://tonnr.test${prefix}/login`)).toBe(
        `https://tonnr.test${prefix}/app`,
      );
      const error = new URL(
        providerErrorURL(`https://tonnr.test${prefix}/app?spot=north`, "google"),
      );
      expect(error.pathname).toBe(`${prefix}/login`);
      expect(error.searchParams.get("returnTo")).toBe(`${prefix}/app?spot=north`);
      expect(authReturnTo(`${prefix}/app?spot=north`)).toBe(`${prefix}/app?spot=north`);
      expect(authReturnTo(`${prefix}/connect#sig=private`)).toBe(`${prefix}/connect`);
      expect(providerReturnURL(`https://tonnr.test${prefix}/connect#sig=private`)).toBe(
        `https://tonnr.test${prefix}/connect`,
      );
    }
  });

  it("refuses external and unrelated return destinations", () => {
    for (const url of [
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "/login",
      "/app/../login",
      "/de/app",
      "/es/login",
      42,
    ]) {
      expect(authReturnTo(url)).toBeUndefined();
    }
    expect(authReturnTo("/fr/app?break=surf-1")).toBe("/fr/app?break=surf-1");
  });
});
