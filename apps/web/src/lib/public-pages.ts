import { getLocale, locales, localizeHref } from "@/paraglide/runtime.js";
import type { Locale } from "@/paraglide/runtime.js";
import type { FileRoutesByTo } from "@/routeTree.gen";

/**
 * The pages a search engine may list, each in every language. A new public page is added here,
 * and its route gives `pageLinks` to its head. The product, the sign-in, and the pages a link or a
 * mail leads to are left out: they say `noindex`, or only redirect.
 */
export const PUBLIC_PAGES = [
  "/",
  "/sources",
  "/agents",
  "/terms",
  "/privacy",
  "/legal",
] as const satisfies readonly (keyof FileRoutesByTo)[];

export type PublicPage = (typeof PUBLIC_PAGES)[number];

/** A page's full address in one language, as the router writes it: `/fr/` for the French root. */
export function pageAddress(site: string, page: PublicPage, locale: Locale) {
  return `${site}${localizeHref(page, { locale })}`;
}

/** What a public page declares in its head: its own address, then the page in each language. */
export function pageLinks(site: string, page: PublicPage) {
  return [
    { rel: "canonical", href: pageAddress(site, page, getLocale()) },
    ...locales.map((locale) => ({
      rel: "alternate",
      hrefLang: locale,
      href: pageAddress(site, page, locale),
    })),
  ];
}
