import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { SourcesGuide } from "@/components/landing/landing-sources";
import { pageLinks, pageMeta } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/sources")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => {
    const site = loaderData?.site ?? "";
    return {
      meta: pageMeta(site, "/sources", {
        title: `${APP_NAME} — ${m.sources_meta_title()}`,
        description: m.sources_page_more({ name: APP_NAME }),
      }),
      links: pageLinks(site, "/sources"),
    };
  },
  component: Sources,
});

function Sources() {
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />
      <main className="flex-1">
        <SourcesGuide />
      </main>
      <LandingFooter />
    </div>
  );
}
