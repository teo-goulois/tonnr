import handler from "@tanstack/react-start/server-entry";

import { searchEngineFile } from "./lib/public-pages";
import { permanentWhenSamePage } from "./lib/redirects";
import { paraglideMiddleware } from "./paraglide/server.js";

// What Cloudflare gives the Worker of a deployed stage. Nothing gives it in development.
type Bindings = { WEB_INDEXED?: string };

export default {
  async fetch(request: Request, bindings?: Bindings): Promise<Response> {
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
    if (indexed) return response;

    // A page stays out of search engines unless its stage asks to be listed. The header says
    // so, and `robots.txt` lets them come and read it: decision 021.
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  },
};
