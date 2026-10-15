import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { PrivacyPage } from "@/components/landing/privacy-page";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: `${m.privacy_title()} · ${APP_NAME}` }] }),
  component: PrivacyPage,
});
