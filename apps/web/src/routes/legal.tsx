import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { LegalNoticePage } from "@/components/landing/legal-notice-page";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/legal")({
  head: () => ({ meta: [{ title: `${m.legal_title()} · ${APP_NAME}` }] }),
  component: LegalNoticePage,
});
