import handler from "@tanstack/react-start/server-entry";

import { fetchHubs, fetchListed } from "./lib/pages-api";
import {
  CLOSED_HEADER,
  RETRY_AFTER_SECONDS,
  SPOTS_ROOT,
  isPublicAddress,
  isSitemapPath,
  searchEngineFile,
} from "./lib/public-pages";
import { permanentWhenSamePage } from "./lib/redirects";
import { locales, localizeHref } from "./paraglide/runtime.js";
import { paraglideMiddleware } from "./paraglide/server.js";

// What Cloudflare gives the Worker of a deployed stage. Nothing gives it in development.
type Bindings = { WEB_INDEXED?: string; WEB_DOMAIN?: string; WEB_REDIRECTS?: string };
// What Cloudflare gives the Worker of the request: a way to finish work after the answer is sent.
type Context = { waitUntil(promise: Promise<unknown>): void };

const HOUR = 3600;
const DAY = 24 * HOUR;

export default {
  async fetch(request: Request, bindings?: Bindings, context?: Context): Promise<Response> {
    const moved = movedHost(request, bindings);
    if (moved !== undefined) return moved;

    // A page of a surf break, a hub or a sitemap is served from the cache of the data center
    // while it lasts, and rendered again after: decision 057.
    const cached = await fromCache(request);
    if (cached !== undefined) return cached;

    const indexed = bindings?.WEB_INDEXED === "true";
    const site = new URL(request.url).origin;
    const file = await searchEngineFile(request, indexed, {
      hubs: () => fetchHubs(site),
      listed: (page) => fetchListed(page, site),
    });
    if (file !== undefined) return keep(request, file, context);

    const answered = permanentWhenSamePage(
      request,
      await paraglideMiddleware(request, () => handler.fetch(request)),
    );
    const response = new Response(answered.body, answered);
    // No other site frames a page of the app, where an account allows an assistant or signs in.
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Frame-Options", "DENY");

    // A page that the API refused as a visitor, while the instance is closed to them: a 503 that
    // says when to come back, which the renderer cannot answer itself. Nothing keeps it.
    if (response.headers.has(CLOSED_HEADER)) {
      response.headers.delete(CLOSED_HEADER);
      response.headers.set("Retry-After", String(RETRY_AFTER_SECONDS));
      response.headers.set("Cache-Control", "no-store");
      return new Response(response.body, { status: 503, headers: response.headers });
    }

    if (!indexed || !isPublicAddress(new URL(request.url).pathname)) {
      // A page stays out of search engines unless its stage asks to be listed and it is a public
      // page. The header says so, and `robots.txt` lets them come and read it: decision 021.
      response.headers.set("X-Robots-Tag", "noindex");
    }
    return keep(request, response, context);
  },
};

/**
 * A host of the stage other than its domain, such as `www.` before it, sends every request on to
 * the same page at the domain, for good: decision 021.
 */
function movedHost(request: Request, bindings?: Bindings): Response | undefined {
  const domain = bindings?.WEB_DOMAIN;
  if (!domain) return undefined;
  const url = new URL(request.url);
  const others = (bindings?.WEB_REDIRECTS ?? "").split(",").filter((host) => host !== "");
  if (!others.includes(url.hostname)) return undefined;
  url.hostname = domain;
  return Response.redirect(url.toString(), 301);
}

/**
 * How long the cache keeps an answer at this address, in seconds: a day for a sitemap, an hour
 * for a page of a surf break or a hub, in any language, and nothing for every other address.
 * Nothing of an account is read on these pages, so nothing personal is kept: decision 057.
 */
export function cacheSeconds(pathname: string) {
  if (isSitemapPath(pathname)) return DAY;
  const spots = locales.some((locale) => {
    const root = localizeHref(SPOTS_ROOT, { locale });
    return pathname === root || pathname.startsWith(`${root}/`);
  });
  return spots ? HOUR : 0;
}

// Cloudflare's cache of the data center. Development has none.
function cacheOf(): Cache | undefined {
  if (typeof caches === "undefined") return undefined;
  return (caches as unknown as { default?: Cache }).default;
}

async function fromCache(request: Request) {
  if (request.method !== "GET") return undefined;
  if (cacheSeconds(new URL(request.url).pathname) === 0) return undefined;
  return cacheOf()?.match(request);
}

/**
 * Keeps an answer for the next reader of its address, when the address is one that is kept and
 * the answer is a page or a move, and says so to the browser and to the cache in `Cache-Control`.
 */
function keep(request: Request, response: Response, context?: Context) {
  const seconds = cacheSeconds(new URL(request.url).pathname);
  if (seconds === 0 || request.method !== "GET") return response;
  if (response.status !== 200 && response.status !== 301) return response;
  response.headers.set("Cache-Control", `public, max-age=600, s-maxage=${seconds}`);
  const cache = cacheOf();
  if (cache) {
    const put = cache.put(request, response.clone());
    if (context) context.waitUntil(put);
  }
  return response;
}
