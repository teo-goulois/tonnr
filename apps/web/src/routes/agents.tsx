import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { AgentsGuide } from "@/components/landing/landing-agents";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { ENV } from "@/env.public";
import { pageLinks, pageMeta } from "@/lib/public-pages";
import { apiOrigin, siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/agents")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => {
    const site = loaderData?.site ?? "";
    return {
      meta: pageMeta(site, "/agents", {
        title: `${APP_NAME} — ${m.agents_meta_title()}`,
        description: m.agents_meta_description({ name: APP_NAME }),
      }),
      links: pageLinks(site, "/agents"),
    };
  },
  component: Agents,
});

function Agents() {
  const { site } = Route.useLoaderData();
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />
      <main className="flex-1">
        <AgentsGuide api={apiOrigin(ENV.VITE_SERVER_URL)} site={site} />
      </main>
      <LandingFooter />
    </div>
  );
}
