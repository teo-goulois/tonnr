import { APP_NAME } from "@repo/config/app";

import { m } from "@/paraglide/messages.js";
import { baseLocale, getLocale, locales, localizeHref } from "@/paraglide/runtime.js";
import type { Locale } from "@/paraglide/runtime.js";
import type { FileRoutesByTo } from "@/routeTree.gen";

/**
 * The pages a search engine may list, each in every language: the sitemap names these and no
 * other. A new public page is added here, and its route gives `pageLinks` to its head. The
 * product, the sign-in, and the pages a link or a mail leads to are left out: the Worker says
 * `noindex` of every address that is not one of these, through `isPublicAddress`.
 */
export const PUBLIC_PAGES = [
  "/",
  "/sources",
  "/agents",
  "/contact",
  "/terms",
  "/privacy",
  "/legal",
] as const satisfies readonly (keyof FileRoutesByTo)[];

export type PublicPage = (typeof PUBLIC_PAGES)[number];

/** A page's full address in one language, as the router writes it: `/fr/` for the French root. */
export function pageAddress(site: string, page: PublicPage, locale: Locale) {
  return `${site}${localizeHref(page, { locale })}`;
}

/** Whether a path is a public page in one of its languages, as `pageAddress` writes it. */
export function isPublicAddress(pathname: string) {
  return PUBLIC_PAGES.some((page) =>
    locales.some((locale) => localizeHref(page, { locale }) === pathname),
  );
}

/**
 * What a public page declares in its head: its own address, then the page in each language, and
 * the base language's for a reader whose language the site does not have.
 */
export function pageLinks(site: string, page: PublicPage) {
  return [
    { rel: "canonical", href: pageAddress(site, page, getLocale()) },
    ...alternates(site, page).map(({ hrefLang, href }) => ({ rel: "alternate", hrefLang, href })),
  ];
}

function alternates(site: string, page: PublicPage) {
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
 * The picture a surf break or a station is shown with when it is sent, in the language it was
 * sent in: what the link opens, over the landing's map, which `scripts/landing-shots.mjs` takes
 * from `/og/place` for each language.
 */
export function placePicturePath(locale: Locale) {
  return `/landing/og-place-${locale}.jpg`;
}

/**
 * What a public page says of itself in its head: its title and description, and what a link to it
 * is shown with where it is shared.
 */
export function pageMeta(
  site: string,
  page: PublicPage,
  { title, description }: { title: string; description: string },
) {
  const locale = getLocale();
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: APP_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: pageAddress(site, page, locale) },
    { property: "og:image", content: `${site}${sharedPicturePath(locale)}` },
    { property: "og:image:width", content: String(SHARED_PICTURE.width) },
    { property: "og:image:height", content: String(SHARED_PICTURE.height) },
    { property: "og:image:alt", content: m.landing_shot_alt({ name: APP_NAME }) },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/**
 * The sitemap: every public page in every language, each with its address in the others, as the
 * pages declare them.
 */
export function sitemapXml(site: string) {
  const urls = PUBLIC_PAGES.flatMap((page) =>
    locales.map((locale) => {
      const links = alternates(site, page).map(
        ({ hrefLang, href }) =>
          `    <xhtml:link rel="alternate" hreflang="${hrefLang}" href="${xml(href)}"/>`,
      );
      return [
        "  <url>",
        `    <loc>${xml(pageAddress(site, page, locale))}</loc>`,
        ...links,
        "  </url>",
      ].join("\n");
    }),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
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

/**
 * What the Worker answers at `/robots.txt` and `/sitemap.xml`, before the router: only it knows
 * whether its stage is listed. A stage that is not has no sitemap, since every page it would name
 * says `noindex`. The address is the request's, which Cloudflare gives as the reader typed it.
 */
export function searchEngineFile(request: Request, indexed: boolean): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const url = new URL(request.url);
  if (url.pathname === "/robots.txt") {
    return text(robotsTxt(url.origin, indexed), "text/plain; charset=utf-8");
  }
  if (url.pathname === "/sitemap.xml" && indexed) {
    return text(sitemapXml(url.origin), "application/xml; charset=utf-8");
  }
  return undefined;
}

function text(body: string, type: string) {
  return new Response(body, { headers: { "Content-Type": type } });
}

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}
