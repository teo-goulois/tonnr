import { ENV } from "@/env.public";
import { apiOrigin } from "@/lib/site";

import { LandingAgents } from "./landing-agents";
import { LandingAlert } from "./landing-alert";
import { LandingFeatures } from "./landing-features";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingNext } from "./landing-next";
import { LandingSources } from "./landing-sources";
import { LandingStory } from "./landing-story";
import { LandingTrust } from "./landing-trust";

/**
 * The page a visitor lands on: what the product is, what it does, what it keeps of a spot and who
 * reads it, who makes it and what he thinks of next, then where its figures come from and that a
 * program reads it too.
 */
export function LandingPage() {
  const api = apiOrigin(ENV.VITE_SERVER_URL);

  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader wayInBelow />

      <main className="flex-1">
        <LandingHero />

        <LandingAlert />
        <LandingFeatures />
        <LandingTrust />
        <LandingStory />
        <LandingNext />
        <LandingSources />
        <LandingAgents api={api} />
      </main>

      <LandingFooter />
    </div>
  );
}
