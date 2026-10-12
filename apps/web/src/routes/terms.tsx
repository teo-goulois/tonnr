import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { TermsPage } from "@/components/landing/terms-page";
import { ENV } from "@/env.public";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: `${m.terms_title()} · ${APP_NAME}` }] }),
  component: Terms,
});

function Terms() {
  return <TermsPage apiDocsUrl={`${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/v1/docs`} />;
}
