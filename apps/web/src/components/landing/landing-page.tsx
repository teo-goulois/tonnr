import { Link } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { ArrowRightIcon } from "@repo/ui/icon";

import { m } from "@/paraglide/messages.js";

import { LandingAgents } from "./landing-agents";
import { LandingAlert } from "./landing-alert";
import { LandingFeatures } from "./landing-features";
import { LandingHeader } from "./landing-header";
import { SECTIONS, SectionTitle, apart, column, ruled } from "./landing-parts";
import { LandingShot } from "./landing-shot";
import { LandingStory } from "./landing-story";

function OpenTheMap() {
  return (
    <Link to="/app" className={buttonVariants()}>
      {m.landing_open_map()}
      <ArrowRightIcon data-slot="icon" aria-hidden />
    </Link>
  );
}

/**
 * The page a visitor lands on: what the product is, everything it does, how a program reads it,
 * and who makes it. `api` and `site` are the two addresses its links and its examples name.
 */
export function LandingPage({ api, site }: { api: string; site: string }) {
  const quiet = "focus-ring rounded-xs hover:text-neutral-10";

  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />

      <main className="flex-1">
        <section className={`${column} grid gap-xl pt-xl lg:gap-xxl lg:pt-xxl`}>
          <div className="grid max-w-2xl gap-l">
            <div className="grid gap-m">
              <h1 className="text-xl font-bold text-balance lg:text-xxl">
                {m.landing_hero_title()}
              </h1>
              <p className="text-neutral-7 lg:text-l">{m.landing_hero_body()}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-m gap-y-s">
              <div className="flex flex-wrap gap-xs">
                <OpenTheMap />
                <Link
                  to="/"
                  hash={SECTIONS.agents}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {m.landing_hero_agents()}
                </Link>
              </div>
              <p className="text-s text-neutral-7">{m.landing_hero_note()}</p>
            </div>
          </div>
          <LandingShot />
        </section>

        <LandingAlert />
        <LandingFeatures />
        <LandingAgents api={api} site={site} />
        <LandingStory />

        <section className={`${column} ${apart}`}>
          <div
            className={`${ruled} flex flex-wrap items-end justify-between gap-l pt-[calc(var(--space-xxl)*1.5)]`}
          >
            <SectionTitle title={m.landing_closing_title()} more={m.landing_closing_more()} />
            <OpenTheMap />
          </div>
        </section>
      </main>

      <footer
        className={`${column} flex flex-wrap items-center justify-between gap-s py-xl text-s text-neutral-7 lg:pt-[calc(var(--space-xxl)*1.5)]`}
      >
        <p>
          {APP_NAME}. {m.landing_footer_license()}
        </p>
        <nav className="flex flex-wrap gap-m">
          <Link to="/terms" className={quiet}>
            {m.terms_title()}
          </Link>
          <a href={`${api}/v1/docs`} className={quiet}>
            {m.landing_nav_api()}
          </a>
          <a href="/llms.txt" className={quiet}>
            llms.txt
          </a>
          <a href={REPOSITORY_URL} className={quiet}>
            {m.landing_nav_source()}
          </a>
        </nav>
      </footer>
    </div>
  );
}
