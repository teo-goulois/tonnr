import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { SourcesGuide } from "@/components/landing/landing-sources";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: `${m.landing_nav_sources()} · ${APP_NAME}` },
      { name: "description", content: m.sources_page_more({ name: APP_NAME }) },
    ],
  }),
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
