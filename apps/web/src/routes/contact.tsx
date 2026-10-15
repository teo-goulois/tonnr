import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { CONTACT_TOPICS, ContactPage } from "@/components/landing/landing-contact";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { pageLinks, pageMeta } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { z } from "zod";

export const Route = createFileRoute("/contact")({
  // What the message is about, when a link asks for one: `?topic=key` from where a key is asked.
  validateSearch: z.object({ topic: z.enum(CONTACT_TOPICS).optional().catch(undefined) }),
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => {
    const site = loaderData?.site ?? "";
    return {
      meta: pageMeta(site, "/contact", {
        title: `${APP_NAME} — ${m.contact_nav()}`,
        description: m.contact_more(),
      }),
      links: pageLinks(site, "/contact"),
    };
  },
  component: Contact,
});

function Contact() {
  const { topic } = Route.useSearch();
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />
      <main className="flex-1">
        <ContactPage topic={topic} />
      </main>
      <LandingFooter />
    </div>
  );
}
