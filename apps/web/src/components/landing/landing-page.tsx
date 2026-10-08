import { Link } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { ArrowRightIcon } from "@repo/ui/icon";

import { m } from "@/paraglide/messages.js";

import { LandingHeader } from "./landing-header";
import { PhoneFrame } from "./phone-frame";
import { SpotPreview } from "./spot-preview";

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <li className="grid content-start gap-xs rounded-m bg-neutral-2 p-l">
      <h3 className="text-l font-medium">{title}</h3>
      <p className="text-neutral-7">{body}</p>
    </li>
  );
}

export function LandingPage({ apiDocsUrl }: { apiDocsUrl: string }) {
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader apiDocsUrl={apiDocsUrl} />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-xxl px-m pb-xxl">
        <section className="grid items-center gap-xl py-xl lg:grid-cols-[1fr_auto] lg:py-xxl">
          <div className="grid max-w-(--container-xl) gap-l">
            <h1 className="text-xl font-bold sm:text-xxl">{m.landing_hero_title()}</h1>
            <p className="text-neutral-7 sm:text-l">{m.landing_hero_body()}</p>
            <div className="flex flex-wrap gap-xs">
              <Link to="/app" className={buttonVariants()}>
                {m.landing_open_app()}
                <ArrowRightIcon data-slot="icon" aria-hidden />
              </Link>
              <a href={apiDocsUrl} className={buttonVariants({ variant: "outline" })}>
                {m.landing_read_api()}
              </a>
            </div>
          </div>
          <figure className="grid justify-items-center gap-s">
            <PhoneFrame>
              <SpotPreview />
            </PhoneFrame>
            <figcaption className="text-s text-neutral-6">{m.landing_preview_caption()}</figcaption>
          </figure>
        </section>

        <section aria-labelledby="features" className="grid gap-l">
          <h2 id="features" className="sr-only">
            {m.landing_features_title()}
          </h2>
          <ul className="grid gap-m sm:grid-cols-2">
            <Feature title={m.landing_spots_title()} body={m.landing_spots_body()} />
            <Feature title={m.landing_alerts_title()} body={m.landing_alerts_body()} />
            <Feature title={m.landing_data_title()} body={m.landing_data_body()} />
            <Feature title={m.landing_open_title()} body={m.landing_open_body()} />
          </ul>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-s px-m py-l text-s text-neutral-7">
        <p>
          {APP_NAME}. {m.landing_footer_license()}
        </p>
        <nav className="flex gap-m">
          <a href={apiDocsUrl} className="focus-ring rounded-xs hover:text-neutral-10">
            {m.landing_nav_api()}
          </a>
          <a href={REPOSITORY_URL} className="focus-ring rounded-xs hover:text-neutral-10">
            {m.landing_nav_source()}
          </a>
        </nav>
      </footer>
    </div>
  );
}
