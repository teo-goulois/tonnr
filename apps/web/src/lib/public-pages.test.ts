import { describe, expect, it } from "vitest";

import { PUBLIC_PAGES, pageAddress, pageLinks } from "./public-pages";

const site = "https://site.example";

describe("pageAddress", () => {
  it("writes each page as the router answers it, with no redirect to follow", () => {
    expect(pageAddress(site, "/", "en")).toBe("https://site.example/");
    expect(pageAddress(site, "/", "fr")).toBe("https://site.example/fr/");
    expect(pageAddress(site, "/sources", "en")).toBe("https://site.example/sources");
    expect(pageAddress(site, "/sources", "fr")).toBe("https://site.example/fr/sources");
  });
});

describe("pageLinks", () => {
  it("names the page itself, then the page in each language", () => {
    expect(pageLinks(site, "/terms")).toEqual([
      { rel: "canonical", href: "https://site.example/terms" },
      { rel: "alternate", hrefLang: "en", href: "https://site.example/terms" },
      { rel: "alternate", hrefLang: "fr", href: "https://site.example/fr/terms" },
    ]);
  });
});

describe("PUBLIC_PAGES", () => {
  it("leaves out what a search engine must not list", () => {
    for (const page of ["/app", "/login", "/connect", "/verified", "/mail-off", "/design-system"]) {
      expect(PUBLIC_PAGES).not.toContain(page);
    }
  });
});
