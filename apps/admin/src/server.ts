import handler from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "./paraglide/server.js";

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await paraglideMiddleware(request, () => handler.fetch(request));

    // Nothing here is for a search engine. The header says so on every answer, and
    // `robots.txt` lets them come and read it: decision 021 says why that pair, for the web app.
    const unlisted = new Response(response.body, response);
    unlisted.headers.set("X-Robots-Tag", "noindex");
    return unlisted;
  },
};
