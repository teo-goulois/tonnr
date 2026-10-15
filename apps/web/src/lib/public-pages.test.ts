import { describe, expect, it } from "vitest";

import { locales } from "@/paraglide/runtime.js";

import {
  PUBLIC_PAGES,
  isPublicAddress,
  pageAddress,
  pageLinks,
  searchEngineFile,
  sitemapXml,
} from "./public-pages";

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
      { rel: "alternate", hrefLang: "es", href: "https://site.example/es/terms" },
      { rel: "alternate", hrefLang: "pt", href: "https://site.example/pt/terms" },
      { rel: "alternate", hrefLang: "x-default", href: "https://site.example/terms" },
    ]);
  });
});

describe("isPublicAddress", () => {
  it("knows a public page in each language, and nothing else", () => {
    for (const path of ["/", "/fr/", "/sources", "/pt/privacy"]) {
      expect(isPublicAddress(path)).toBe(true);
    }
    for (const path of ["/app", "/fr/app", "/login", "/connect", "/l/abc", "/fr", "/sources/"]) {
      expect(isPublicAddress(path)).toBe(false);
    }
  });
});

describe("PUBLIC_PAGES", () => {
  it("leaves out what a search engine must not list", () => {
    for (const page of [
      "/app",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/connect",
      "/verified",
      "/mail-off",
      "/design-system",
    ]) {
      expect(PUBLIC_PAGES).not.toContain(page);
    }
  });
});

describe("sitemapXml", () => {
  const sitemap = sitemapXml(site);

  it("lists each public page in each language, with its address in the others", () => {
    expect(sitemap.match(/<url>/g)).toHaveLength(PUBLIC_PAGES.length * locales.length);
    expect(sitemap).toContain("<loc>https://site.example/fr/</loc>");
    expect(sitemap).toContain("<loc>https://site.example/fr/sources</loc>");
    expect(sitemap).toContain(
      '<xhtml:link rel="alternate" hreflang="fr" href="https://site.example/fr/terms"/>',
    );
  });

  it("names no page in a form the router redirects", () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
    // The landings end with a slash, and no other page does.
    expect(locs.filter((loc) => loc.endsWith("/"))).toEqual([
      "https://site.example/",
      "https://site.example/fr/",
      "https://site.example/es/",
      "https://site.example/pt/",
    ]);
  });
});

describe("searchEngineFile", () => {
  const answer = (path: string, indexed: boolean) =>
    searchEngineFile(new Request(`https://site.example${path}`), indexed);

  it("names the sitemap in robots.txt on a stage that is listed", async () => {
    const robots = await answer("/robots.txt", true)?.text();
    expect(robots).toContain("Disallow:\n");
    expect(robots).toContain("Sitemap: https://site.example/sitemap.xml");
    expect(answer("/sitemap.xml", true)?.headers.get("Content-Type")).toContain("application/xml");
  });

  it("lets robots in on a stage that is not listed, and gives them no sitemap", async () => {
    const robots = await answer("/robots.txt", false)?.text();
    expect(robots).toContain("Disallow:\n");
    expect(robots).not.toContain("Sitemap");
    expect(answer("/sitemap.xml", false)).toBeUndefined();
  });

  it("leaves every other address to the router", () => {
    expect(answer("/sources", true)).toBeUndefined();
    expect(answer("/fr/sitemap.xml", true)).toBeUndefined();
  });
});
