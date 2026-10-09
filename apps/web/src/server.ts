import handler from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "./paraglide/server.js";

// What Cloudflare gives the Worker of a deployed stage. Nothing gives it in development.
type Bindings = { WEB_INDEXED?: string };

export default {
  async fetch(request: Request, bindings?: Bindings): Promise<Response> {
    const response = await paraglideMiddleware(request, () => handler.fetch(request));
    if (bindings?.WEB_INDEXED === "true") return response;

    // A page stays out of search engines unless its stage asks to be listed. The header says
    // so, and `robots.txt` lets them come and read it: decision 021.
    const unlisted = new Response(response.body, response);
    unlisted.headers.set("X-Robots-Tag", "noindex");
    return unlisted;
  },
};
