import { createFileRoute } from "@tanstack/react-router";

import { LearnHub } from "@/components/learn/learn-hub";
import { LEARN_ROOT } from "@/lib/learn";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

import { learnHead } from "./-head";

// Where a reader picks a guide, and a search engine finds the general question. Decision 060.
export const Route = createFileRoute("/learn/")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) =>
    learnHead(loaderData?.site ?? "", LEARN_ROOT, {
      title: m.learn_meta_title(),
      description: m.learn_meta_description(),
      crumbs: [],
    }),
  component: LearnHub,
});
