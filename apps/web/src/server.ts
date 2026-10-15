import handler from "@tanstack/react-start/server-entry";

import { isPublicAddress, searchEngineFile } from "./lib/public-pages";
import { permanentWhenSamePage } from "./lib/redirects";
import { paraglideMiddleware } from "./paraglide/server.js";

// What Cloudflare gives the Worker of a deployed stage. Nothing gives it in development.
type Bindings = { WEB_INDEXED?: string; WEB_DOMAIN?: string; WEB_REDIRECTS?: string };

export default {
  async fetch(request: Request, bindings?: Bindings): Promise<Response> {
    const moved = movedHost(request, bindings);
    if (moved !== undefined) return moved;

    const indexed = bindings?.WEB_INDEXED === "true";
    const file = searchEngineFile(request, indexed);
    if (file !== undefined) return file;

    const answered = permanentWhenSamePage(
      request,
      await paraglideMiddleware(request, () => handler.fetch(request)),
    );
    const response = new Response(answered.body, answered);
    // No other site frames a page of the app, where an account allows an assistant or signs in.
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Frame-Options", "DENY");
    if (indexed && isPublicAddress(new URL(request.url).pathname)) return response;

    // A page stays out of search engines unless its stage asks to be listed and it is a public
    // page. The header says so, and `robots.txt` lets them come and read it: decision 021.
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
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
