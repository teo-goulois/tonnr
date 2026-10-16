import { createFileRoute } from "@tanstack/react-router";

import { GlossaryPage } from "@/components/learn/glossary-page";
import { GLOSSARY_PATH } from "@/lib/learn";
import { siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

import { learnHead } from "./-head";

// Every technical word the guides use, each with where the thing comes from: decision 060.
export const Route = createFileRoute("/learn/glossary")({
  loader: () => ({ site: siteOrigin() }),
  head: ({ loaderData }) =>
    learnHead(loaderData?.site ?? "", GLOSSARY_PATH, {
      title: m.learn_glossary_meta_title(),
      description: m.learn_glossary_lead(),
    }),
  component: GlossaryPage,
});
