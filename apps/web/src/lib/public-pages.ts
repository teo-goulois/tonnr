import { APP_NAME } from "@repo/config/app";

import { m } from "@/paraglide/messages.js";
import { baseLocale, getLocale, locales, localizeHref } from "@/paraglide/runtime.js";
import type { Locale } from "@/paraglide/runtime.js";
import type { FileRoutesByTo } from "@/routeTree.gen";

/**
 * The pages a search engine may list, each in every language: the sitemap names these and no
 * other, with the pages of the surf breaks and their hubs, which come from the API (decision 057).
 * A new public page is added here, and its route gives `pageLinks` to its head. The product, the
 * sign-in, and the pages a link or a mail leads to are left out: the Worker says `noindex` of
 * every address that is not one of these, through `isPublicAddress`.
 */
export const PUBLIC_PAGES = [
  "/",
  "/sources",
  "/agents",
  "/contact",
  "/terms",
  "/privacy",
  "/legal",
  "/spots",
  "/learn",
  "/learn/beginner",
  "/learn/intermediate",
  "/learn/advanced",
  "/learn/glossary",
] as const satisfies readonly (keyof FileRoutesByTo)[];

export type PublicPage = (typeof PUBLIC_PAGES)[number];

/** Where the pages of the surf breaks and their hubs stand: `/spots/<country>/<region>/<slug>`. */
export const SPOTS_ROOT = "/spots";

/** A page's full address in one language, as the router writes it: `/fr/` for the French root. */
export function pageAddress(site: string, page: string, locale: Locale) {
  return `${site}${localizeHref(page, { locale })}`;
}

/**
 * Whether a path is a public page in one of its languages, as `pageAddress` writes it: one of
 * `PUBLIC_PAGES`, or a page of a surf break or of a hub under `/spots`. A break that is not
 * listed says `noindex` in its own head.
 */
export function isPublicAddress(pathname: string) {
  return locales.some(
    (locale) =>
      PUBLIC_PAGES.some((page) => localizeHref(page, { locale }) === pathname) ||
      pathname.startsWith(`${localizeHref(SPOTS_ROOT, { locale })}/`),
  );
}

/**
 * What a public page declares in its head: its own address, then the page in each language, and
 * the base language's for a reader whose language the site does not have.
 */
export function pageLinks(site: string, page: string) {
  return [
    { rel: "canonical", href: pageAddress(site, page, getLocale()) },
    ...alternates(site, page).map(({ hrefLang, href }) => ({ rel: "alternate", hrefLang, href })),
  ];
}

function alternates(site: string, page: string) {
  return [
    ...locales.map((locale) => ({ hrefLang: locale, href: pageAddress(site, page, locale) })),
    { hrefLang: "x-default", href: pageAddress(site, page, baseLocale) },
  ];
}

/**
 * The picture a link to the site is shown with, in the reader's language: the top of the landing,
 * which `scripts/landing-shots.mjs` takes for each language.
 */
export const SHARED_PICTURE = { width: 1200, height: 630 };

export function sharedPicturePath(locale: Locale) {
  return `/landing/og-${locale}.jpg`;
}

/**
 * The picture an account's link is shown with, in the language it was sent in: an invitation over
 * the landing's map, which `scripts/landing-shots.mjs` takes from `/og/invite` for each language.
 */
export function invitePicturePath(locale: Locale) {
  return `/landing/og-invite-${locale}.jpg`;
}

/**
 * The picture a shared list is shown with, in the language it was sent in: a list over the
 * landing's map, which `scripts/landing-shots.mjs` takes from `/og/list` for each language.
 */
export function listPicturePath(locale: Locale) {
  return `/landing/og-list-${locale}.jpg`;
}

/**
 * The picture a surf break or a station is shown with when it is sent, in the language it was
 * sent in: what the link opens, over the landing's map, which `scripts/landing-shots.mjs` takes
 * from `/og/place` for each language. The page of a surf break is sent with it too.
 */
export function placePicturePath(locale: Locale) {
  return `/landing/og-place-${locale}.jpg`;
}

/**
 * What a public page says of itself in its head: its title and description, and what a link to it
 * is shown with where it is shared. The picture is the landing's unless the page names another.
 */
export function pageMeta(
  site: string,
  page: string,
  {
    title,
    description,
    picture,
  }: { title: string; description: string; picture?: { path: string; alt: string } },
) {
  const locale = getLocale();
  const shown = picture ?? {
    path: sharedPicturePath(locale),
    alt: m.landing_shot_alt({ name: APP_NAME }),
  };
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: APP_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: pageAddress(site, page, locale) },
    { property: "og:image", content: `${site}${shown.path}` },
    { property: "og:image:width", content: String(SHARED_PICTURE.width) },
    { property: "og:image:height", content: String(SHARED_PICTURE.height) },
    { property: "og:image:alt", content: shown.alt },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** A page a sitemap names, with when it last changed where that is known. */
export type SitemapPage = { page: string; updatedAt?: Date };

// A page in each language, each with its address in the others, as the pages declare them.
function urlEntries(site: string, { page, updatedAt }: SitemapPage) {
  const links = alternates(site, page).map(
    ({ hrefLang, href }) =>
      `    <xhtml:link rel="alternate" hreflang="${hrefLang}" href="${xml(href)}"/>`,
  );
  return locales.map((locale) =>
    [
      "  <url>",
      `    <loc>${xml(pageAddress(site, page, locale))}</loc>`,
      ...(updatedAt ? [`    <lastmod>${updatedAt.toISOString()}</lastmod>`] : []),
      ...links,
      "  </url>",
    ].join("\n"),
  );
}

function urlset(urls: string[]) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** How many sitemaps of surf breaks there are, and the path of each: `/sitemap-spots-<n>.xml`. */
export function spotsSitemapPath(index: number) {
  return `/sitemap-spots-${index}.xml`;
}

export const PAGES_SITEMAP_PATH = "/sitemap-pages.xml";

/**
 * The index of the sitemaps: the one of the pages and the hubs, then one for each two thousand
 * listed surf breaks, as the API counts them (decision 057).
 */
export function sitemapIndexXml(site: string, spotsSitemaps: number) {
  const paths = [
    PAGES_SITEMAP_PATH,
    ...Array.from({ length: spotsSitemaps }, (_, index) => spotsSitemapPath(index)),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <sitemap>\n    <loc>${xml(`${site}${path}`)}</loc>\n  </sitemap>`),
    "</sitemapindex>",
    "",
  ].join("\n");
}

/**
 * The sitemap of the pages: every public page in every language, each with its address in the
 * others, then the hubs of the countries and the regions that hold a listed break.
 */
export function sitemapXml(site: string, hubs: SitemapPage[] = []) {
  return urlset(
    [...PUBLIC_PAGES.map((page) => ({ page })), ...hubs].flatMap((page) => urlEntries(site, page)),
  );
}

/** One sitemap of surf breaks: each in every language, with when it last changed. */
export function spotsSitemapXml(site: string, breaks: SitemapPage[]) {
  return urlset(breaks.flatMap((page) => urlEntries(site, page)));
}

/**
 * `robots.txt` lets every robot read every page, listed or not: a page that a stage keeps out of
 * search engines says so in a header, which a robot reads only if it may come (decision 021). A
 * stage that is listed names its sitemap.
 */
export function robotsTxt(site: string, indexed: boolean) {
  const lines = ["# https://www.robotstxt.org/robotstxt.html", "User-agent: *", "Disallow:"];
  if (indexed) lines.push("", `Sitemap: ${site}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

/** What the sitemaps read of the API: the hubs, and the listed breaks by pages. */
export type SitemapSource = {
  hubs: () => Promise<{ hubs: SitemapPage[] }>;
  listed: (page: number) => Promise<{ breaks: SitemapPage[]; pages: number }>;
};

/**
 * What the Worker answers at `/robots.txt` and the sitemaps, before the router: only it knows
 * whether its stage is listed. A stage that is not has no sitemap, since every page it would name
 * says `noindex`. The address is the request's, which Cloudflare gives as the reader typed it.
 * A sitemap that the API does not answer for is a 503: a search engine comes back.
 */
export async function searchEngineFile(
  request: Request,
  indexed: boolean,
  source: SitemapSource,
): Promise<Response | undefined> {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const url = new URL(request.url);
  if (url.pathname === "/robots.txt") {
    return text(robotsTxt(url.origin, indexed), "text/plain; charset=utf-8");
  }
  if (!indexed) return undefined;
  if (url.pathname === "/sitemap.xml") {
    const counted = await source.listed(0).catch(() => null);
    if (!counted) return unavailable();
    return text(sitemapIndexXml(url.origin, counted.pages), XML);
  }
  if (url.pathname === PAGES_SITEMAP_PATH) {
    const hubs = await source.hubs().catch(() => null);
    if (!hubs) return unavailable();
    return text(sitemapXml(url.origin, hubs.hubs), XML);
  }
  const spots = /^\/sitemap-spots-(\d+)\.xml$/.exec(url.pathname);
  if (spots) {
    const listed = await source.listed(Number(spots[1])).catch(() => null);
    if (!listed) return unavailable();
    if (listed.breaks.length === 0) return new Response("Not Found", { status: 404 });
    return text(spotsSitemapXml(url.origin, listed.breaks), XML);
  }
  return undefined;
}

/** Whether a path is one of the files `searchEngineFile` answers, or a sitemap of theirs. */
export function isSitemapPath(pathname: string) {
  return pathname === "/sitemap.xml" || /^\/sitemap-[a-z]+(-\d+)?\.xml$/.test(pathname);
}

/**
 * The header a page sets when the API refused it as a visitor, for the Worker to turn the
 * answer into a 503 with `Retry-After`: the renderer itself answers a page with 200 whatever its
 * loader learnt. A search engine then comes back later, and a cached copy serves while it lasts.
 */
export const CLOSED_HEADER = "X-Closed-To-Visitors";
export const RETRY_AFTER_SECONDS = 600;

const XML = "application/xml; charset=utf-8";

function unavailable() {
  return new Response("Service Unavailable", {
    status: 503,
    headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
  });
}

function text(body: string, type: string) {
  return new Response(body, { headers: { "Content-Type": type } });
}

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}
