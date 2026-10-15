import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { TermsPage } from "@/components/landing/terms-page";
import { pageLinks, pageMeta } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/terms")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => ({
    meta: pageMeta(loaderData?.site ?? "", "/terms", {
      title: `${m.terms_title()} · ${APP_NAME}`,
      description: m.terms_meta_description({ name: APP_NAME }),
    }),
    links: pageLinks(loaderData?.site ?? "", "/terms"),
  }),
  component: TermsPage,
});
