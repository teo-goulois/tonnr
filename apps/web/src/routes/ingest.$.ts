import { createFileRoute } from "@tanstack/react-router";
import { ENV } from "@/env.public";
import { proxyAnalytics } from "@/lib/analytics-proxy";

export const Route = createFileRoute("/ingest/$")({
  server: {
    handlers: {
      POST: ({ request }) =>
        ENV.VITE_POSTHOG_PROJECT_TOKEN
          ? proxyAnalytics(request, ENV.VITE_POSTHOG_HOST)
          : new Response(null, { status: 404 }),
    },
  },
});
