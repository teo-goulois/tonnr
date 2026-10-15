import { notFound } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { ClosedToVisitors, NoPage } from "@/lib/pages-api";
import { CLOSED_HEADER, pageLinks, pageMeta } from "@/lib/public-pages";
import { type Crumb, breadcrumbJsonLd, jsonLdScript } from "@/lib/spot-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

// What the routes of the public pages share: how a page is loaded from the API, what it answers
// when the API has no page or refuses a visitor, and the head of a hub. Decision 057.

/** What a route loaded: the site, when, and the page, or that the instance is closed to visitors. */
export type Loaded<Data> = { site: string; now: number } & (
  | { closed: true; data: null }
  | { closed: false; data: Data }
);

/**
 * Loads a page from the API as a visitor. No page is a 404. A refusal of visitors is a page of
 * its own, which the Worker answers with a 503. Anything else is an error of the route.
 */
export async function loadPage<Data>(ask: (site: string) => Promise<Data>): Promise<Loaded<Data>> {
  const site = siteOrigin();
  const now = Date.now();
  try {
    return { site, now, closed: false, data: await ask(site) };
  } catch (error) {
    if (error instanceof NoPage) throw notFound();
    if (error instanceof ClosedToVisitors) return { site, now, closed: true, data: null };
    throw error;
  }
}

/** The header that tells the Worker to answer a 503: set while the instance is closed. */
export function closedHeaders(
  loaderData: Loaded<unknown> | undefined,
): Record<string, string> | undefined {
  return loaderData?.closed ? { [CLOSED_HEADER]: "1" } : undefined;
}

/** The head of a page the API did not give: a title, and nothing for a search engine to keep. */
export function closedHead() {
  return {
    meta: [{ title: `${m.page_spots()} — ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  };
}

/** The head of a hub: its title and description, its addresses, and the path over it. */
export function hubHead(
  site: string,
  path: string,
  { title, description, crumbs }: { title: string; description: string; crumbs: Crumb[] },
) {
  return {
    meta: pageMeta(site, path, { title: `${title} — ${APP_NAME}`, description }),
    links: pageLinks(site, path),
    scripts: [jsonLdScript(breadcrumbJsonLd(site, crumbs, { name: title, page: path }))],
  };
}
