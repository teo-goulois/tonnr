import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { LandingPage } from "@/components/landing/landing-page";
import { ENV } from "@/env.public";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME}: ${m.landing_hero_title()}` },
      { name: "description", content: m.landing_meta_description() },
    ],
  }),
  component: Landing,
});

function Landing() {
  return <LandingPage apiDocsUrl={`${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/v1/docs`} />;
}
