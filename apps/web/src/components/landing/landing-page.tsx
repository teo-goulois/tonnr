import { ENV } from "@/env.public";
import { apiOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";

import { LandingAgents } from "./landing-agents";
import { LandingAlert } from "./landing-alert";
import { LandingDemo } from "./landing-demo";
import { LandingFeatures } from "./landing-features";
import { LandingFooter, OpenTheMap } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { LandingNext } from "./landing-next";
import { column } from "./landing-parts";
import { LandingSources } from "./landing-sources";
import { LandingStory } from "./landing-story";

// The top of the page comes in once, a part after the other. Nothing else on the page moves
// unless it is pointed at.
const arrives =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none";

/**
 * The page a visitor lands on: what the product is, what it does, who makes it and what he
 * thinks of next, then where its figures come from and that a program reads it too.
 */
export function LandingPage() {
  const api = apiOrigin(ENV.VITE_SERVER_URL);

  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />

      <main className="flex-1">
        <section
          className={`${column} grid gap-xl pt-xl lg:gap-xxl lg:pt-[calc(var(--space-xxl)*1.5)]`}
        >
          <div className="mx-auto grid max-w-3xl justify-items-center gap-l text-center">
            <h1 className={`${arrives} text-xl font-bold text-balance lg:text-xxl`}>
              {m.landing_hero_title()}
            </h1>
            <p className={`${arrives} max-w-2xl text-neutral-7 delay-100 lg:text-l`}>
              {m.landing_hero_body()}
            </p>
            <div className={`${arrives} grid justify-items-center gap-s delay-200`}>
              <OpenTheMap />
              <p className="text-s text-neutral-7">{m.landing_hero_note()}</p>
            </div>
          </div>
          <div className={`${arrives} delay-300`}>
            <LandingDemo />
          </div>
        </section>

        <LandingAlert />
        <LandingFeatures />
        <LandingStory />
        <LandingNext />
        <LandingSources />
        <LandingAgents api={api} />
      </main>

      <LandingFooter />
    </div>
  );
}
