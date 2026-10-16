import { createFileRoute } from "@tanstack/react-router";

import { IntermediateGuide } from "@/components/learn/intermediate-guide";
import { guidePath } from "@/lib/learn";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

import { learnHead } from "./-head";

// The guide for a reader who surfs and wants to choose their day: decision 060.
export const Route = createFileRoute("/learn/intermediate")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) =>
    learnHead(loaderData?.site ?? "", guidePath("intermediate"), {
      title: m.learn_intermediate_meta_title(),
      description: m.learn_intermediate_meta_description(),
      article: true,
    }),
  component: IntermediateGuide,
});
