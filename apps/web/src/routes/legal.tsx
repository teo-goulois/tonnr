import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { LegalNoticePage } from "@/components/landing/legal-notice-page";
import { pageLinks } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/legal")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${m.legal_title()} · ${APP_NAME}` }],
    links: pageLinks(loaderData?.site ?? "", "/legal"),
  }),
  component: LegalNoticePage,
});
