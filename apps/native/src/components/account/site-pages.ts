import { type Locale, localePrefix } from "@repo/config/locales";

// The pages beside the app, which it opens in a browser inside itself (decision 069): the home
// page, the guides to reading a forecast, the sources, the legal texts and the contact page, in
// the app's language, under the prefix the web gives each language but English. A module that
// imports nothing of React Native, so that a test reads it.

export const SITE_PAGES = {
  home: "/",
  learn: "/learn",
  sources: "/sources",
  terms: "/terms",
  privacy: "/privacy",
  // The paragraph of the policy that says how an account is deleted (decision 071).
  deletion: "/privacy#delete",
  legal: "/legal",
  contact: "/contact",
} as const;

export type SitePage = keyof typeof SITE_PAGES;

/** The address of a page of the site, in a language: `https://tonnr.app/fr/learn`. */
export function siteAddress(site: string, locale: Locale, page: SitePage) {
  const base = site.replace(/\/+$/, "");
  const path = SITE_PAGES[page];
  const prefix = localePrefix(locale);
  // The home page of a language is its prefix alone.
  if (path === "/") return `${base}${prefix || "/"}`;
  return `${base}${prefix}${path}`;
}
