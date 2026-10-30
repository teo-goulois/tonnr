import { describe, expect, it } from "vitest";

import { locales } from "@/paraglide/runtime.js";

import {
  PUBLIC_PAGES,
  type SitemapSource,
  isPublicAddress,
  isSitemapPath,
  pageAddress,
  pageLinks,
  searchEngineFile,
  sitemapIndexXml,
  sitemapXml,
  spotsSitemapXml,
} from "./public-pages";

const site = "https://site.example";

// The API as the sitemaps read it: two hubs, and three listed breaks on one page.
const UPDATED = new Date("2026-10-15T08:00:00Z");
const source: SitemapSource = {
  hubs: async () => ({
    hubs: [
      { page: "/spots/spain", updatedAt: UPDATED },
      { page: "/spots/spain/basque-country", updatedAt: UPDATED },
    ],
  }),
  listed: async (page) => ({
    pages: 2,
    breaks:
      page === 0
        ? [
            { page: "/spots/spain/basque-country/mundaka", updatedAt: UPDATED },
            { page: "/spots/spain/basque-country/zarautz", updatedAt: UPDATED },
            { page: "/spots/france/nouvelle-aquitaine/capbreton", updatedAt: UPDATED },
          ]
        : [],
  }),
};
const refusing: SitemapSource = {
  hubs: () => Promise.reject(new Error("down")),
  listed: () => Promise.reject(new Error("down")),
};

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

  it("knows the pages of the surf breaks and their hubs, in each language", () => {
    for (const path of [
      "/spots",
      "/fr/spots",
      "/spots/spain",
      "/es/spots/spain/basque-country",
      "/pt/spots/spain/basque-country/mundaka",
    ]) {
      expect(isPublicAddress(path)).toBe(true);
    }
    expect(isPublicAddress("/spotsy")).toBe(false);
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

  it("adds the hubs after the pages, with when they changed", () => {
    const withHubs = sitemapXml(site, [{ page: "/spots/spain", updatedAt: UPDATED }]);
    expect(withHubs.match(/<url>/g)).toHaveLength((PUBLIC_PAGES.length + 1) * locales.length);
    expect(withHubs).toContain("<loc>https://site.example/fr/spots/spain</loc>");
    expect(withHubs).toContain("<lastmod>2026-10-15T08:00:00.000Z</lastmod>");
    expect(withHubs).toContain(
      '<xhtml:link rel="alternate" hreflang="pt" href="https://site.example/pt/spots/spain"/>',
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

describe("sitemapIndexXml and spotsSitemapXml", () => {
  it("names the sitemap of the pages, then one for each page of listed breaks", () => {
    const index = sitemapIndexXml(site, 2);
    expect(index.match(/<sitemap>/g)).toHaveLength(3);
    expect(index).toContain("<loc>https://site.example/sitemap-pages.xml</loc>");
    expect(index).toContain("<loc>https://site.example/sitemap-spots-0.xml</loc>");
    expect(index).toContain("<loc>https://site.example/sitemap-spots-1.xml</loc>");
  });

  it("lists each break in each language, with its address in the others and when it changed", () => {
    const spots = spotsSitemapXml(site, [
      { page: "/spots/spain/basque-country/mundaka", updatedAt: UPDATED },
    ]);
    expect(spots.match(/<url>/g)).toHaveLength(locales.length);
    expect(spots).toContain("<loc>https://site.example/spots/spain/basque-country/mundaka</loc>");
    expect(spots).toContain(
      "<loc>https://site.example/es/spots/spain/basque-country/mundaka</loc>",
    );
    expect(spots).toContain(
      'hreflang="x-default" href="https://site.example/spots/spain/basque-country/mundaka"',
    );
    expect(spots.match(/<lastmod>2026-10-15T08:00:00.000Z<\/lastmod>/g)).toHaveLength(
      locales.length,
    );
  });
});

describe("isSitemapPath", () => {
  it("knows the index and its sitemaps, and nothing else", () => {
    for (const path of [
      "/sitemap.xml",
      "/sitemap-pages.xml",
      "/sitemap-spots-0.xml",
      "/sitemap-spots-12.xml",
    ]) {
      expect(isSitemapPath(path)).toBe(true);
    }
    for (const path of ["/fr/sitemap.xml", "/sitemap", "/sitemap-spots.xml/x", "/robots.txt"]) {
      expect(isSitemapPath(path)).toBe(false);
    }
  });
});

describe("searchEngineFile", () => {
  const answer = (path: string, indexed: boolean, from: SitemapSource = source) =>
    searchEngineFile(new Request(`https://site.example${path}`), indexed, from);

  it("names the sitemap in robots.txt on a stage that is listed", async () => {
    const robots = await (await answer("/robots.txt", true))?.text();
    expect(robots).toContain("Disallow: /app\nDisallow: /fr/app\n");
    expect(robots).toContain("Sitemap: https://site.example/sitemap.xml");
  });

  it("answers an index, the pages with the hubs, and the breaks by page", async () => {
    const index = await answer("/sitemap.xml", true);
    expect(index?.headers.get("Content-Type")).toContain("application/xml");
    expect(await index?.text()).toContain("<loc>https://site.example/sitemap-spots-1.xml</loc>");

    const pages = await (await answer("/sitemap-pages.xml", true))?.text();
    expect(pages).toContain("<loc>https://site.example/sources</loc>");
    expect(pages).toContain("<loc>https://site.example/fr/spots/spain/basque-country</loc>");

    const spots = await (await answer("/sitemap-spots-0.xml", true))?.text();
    expect(spots?.match(/<url>/g)).toHaveLength(3 * locales.length);
    expect(spots).toContain(
      "<loc>https://site.example/pt/spots/spain/basque-country/zarautz</loc>",
    );
  });

  it("answers 404 for a page of breaks past the last, and 503 when the API does not answer", async () => {
    expect((await answer("/sitemap-spots-1.xml", true))?.status).toBe(404);
    const down = await answer("/sitemap.xml", true, refusing);
    expect(down?.status).toBe(503);
    expect(down?.headers.get("Retry-After")).toBe("600");
    expect((await answer("/sitemap-spots-0.xml", true, refusing))?.status).toBe(503);
  });

  it("lets robots in on a stage that is not listed, but the product, and gives them no sitemap", async () => {
    const robots = await (await answer("/robots.txt", false))?.text();
    expect(robots?.match(/^Disallow: .*$/gm)).toEqual(
      locales.map((locale) => `Disallow: ${locale === "en" ? "" : `/${locale}`}/app`),
    );
    expect(robots).not.toContain("Sitemap");
    expect(await answer("/sitemap.xml", false)).toBeUndefined();
    expect(await answer("/sitemap-spots-0.xml", false)).toBeUndefined();
  });

  it("leaves every other address to the router", async () => {
    expect(await answer("/sources", true)).toBeUndefined();
    expect(await answer("/fr/sitemap.xml", true)).toBeUndefined();
    expect(await answer("/spots/spain", true)).toBeUndefined();
  });
});
