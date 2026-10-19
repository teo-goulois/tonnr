import { describe, expect, it } from "vitest";

import { siteAddress } from "./site-pages";

describe("a page of the site the app opens", () => {
  it("is in the app's language, under the prefix the web gives each but English", () => {
    expect(siteAddress("https://tonnr.app", "en", "learn")).toBe("https://tonnr.app/learn");
    expect(siteAddress("https://tonnr.app/", "fr", "terms")).toBe("https://tonnr.app/fr/terms");
    expect(siteAddress("https://tonnr.app", "pt", "deletion")).toBe(
      "https://tonnr.app/pt/privacy#delete",
    );
  });

  it("is a language's prefix alone for the home page", () => {
    expect(siteAddress("https://tonnr.app", "en", "home")).toBe("https://tonnr.app/");
    expect(siteAddress("https://tonnr.app", "es", "home")).toBe("https://tonnr.app/es");
  });
});
