import { createFileRoute } from "@tanstack/react-router";

import { BeginnerGuide } from "@/components/learn/beginner-guide";
import { guidePath } from "@/lib/learn";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

import { learnHead } from "./-head";

// The guide to read before a first session: decision 060.
export const Route = createFileRoute("/learn/beginner")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) =>
    learnHead(loaderData?.site ?? "", guidePath("beginner"), {
      title: m.learn_beginner_meta_title(),
      description: m.learn_beginner_meta_description(),
      article: true,
    }),
  component: BeginnerGuide,
});
