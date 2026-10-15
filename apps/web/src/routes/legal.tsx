import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { LegalNoticePage } from "@/components/landing/legal-notice-page";
import { pageLinks, pageMeta } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/legal")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => ({
    meta: pageMeta(loaderData?.site ?? "", "/legal", {
      title: `${m.legal_title()} · ${APP_NAME}`,
      description: m.legal_meta_description({ name: APP_NAME }),
    }),
    links: pageLinks(loaderData?.site ?? "", "/legal"),
  }),
  component: LegalNoticePage,
});
