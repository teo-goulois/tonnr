import { createFileRoute } from "@tanstack/react-router";

import { ENV } from "@/env.public";
import { llmsText } from "@/lib/llms";
import { apiOrigin, siteOrigin } from "@/lib/site";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(llmsText({ site: siteOrigin(), api: apiOrigin(ENV.VITE_SERVER_URL) }), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
