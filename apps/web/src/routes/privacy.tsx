import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { PrivacyPage } from "@/components/landing/privacy-page";
import { pageLinks, pageMeta } from "@/lib/public-pages";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/privacy")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) => ({
    meta: pageMeta(loaderData?.site ?? "", "/privacy", {
      title: `${m.privacy_title()} · ${APP_NAME}`,
      description: m.privacy_meta_description({ name: APP_NAME }),
    }),
    links: pageLinks(loaderData?.site ?? "", "/privacy"),
  }),
  component: PrivacyPage,
});
