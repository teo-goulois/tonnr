import { createFileRoute } from "@tanstack/react-router";

import { AdvancedGuide } from "@/components/learn/advanced-guide";
import { guidePath } from "@/lib/learn";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

import { learnHead } from "./-head";

// The guide for a reader who wants to know what the figures are made of: decision 060.
export const Route = createFileRoute("/learn/advanced")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) =>
    learnHead(loaderData?.site ?? "", guidePath("advanced"), {
      title: m.learn_advanced_meta_title(),
      description: m.learn_advanced_meta_description(),
      article: true,
    }),
  component: AdvancedGuide,
});
