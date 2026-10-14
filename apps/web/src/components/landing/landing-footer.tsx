import { Link } from "@tanstack/react-router";
import { APP_NAME, FEEDBACK_URL, REPOSITORY_URL } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { ArrowRightIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { ENV } from "@/env.public";
import { apiOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { getLocale, locales, setLocale } from "@/paraglide/runtime.js";

import { SECTIONS, SectionTitle, Tile, apart, column, ruled } from "./landing-parts";
import { AUTHOR } from "./landing-story";

// A language is named in its own words, whatever language the page is in.
const LANGUAGES: Record<(typeof locales)[number], string> = { en: "English", fr: "Français" };

const quiet =
  "focus-ring rounded-xs text-neutral-7 transition-colors duration-(--motion-duration) hover:text-neutral-10";

export function OpenTheMap() {
  return (
    <Link to="/app" className={cn(buttonVariants(), "group/open")}>
      {m.landing_open_map()}
      <ArrowRightIcon
        data-slot="icon"
        aria-hidden
        className="transition-[translate] duration-(--motion-duration) ease-theme group-hover/open:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

function Links({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title} className="grid content-start gap-xs lg:col-span-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </nav>
  );
}

/**
 * The end of the landing and of the pages beside it: the way into the app said once more, where
 * everything is, the language, which the page otherwise takes from the browser, and the name.
 */
export function LandingFooter() {
  const api = apiOrigin(ENV.VITE_SERVER_URL);

  return (
    <footer className={`${column} ${apart} grid gap-xxl pb-l`}>
      <div
        className={`${ruled} flex flex-wrap items-end justify-between gap-l pt-[calc(var(--space-xxl)*1.5)]`}
      >
        <SectionTitle title={m.landing_closing_title()} more={m.landing_closing_more()} />
        <OpenTheMap />
      </div>

      <div className="grid gap-xl text-s sm:grid-cols-3 lg:grid-cols-12">
        <div className="grid content-start gap-xs sm:col-span-3 lg:col-span-6">
          <p className="flex items-center gap-xs text-m font-bold">
            <img src="/favicon.svg" alt="" width={20} height={20} className="size-5" />
            {APP_NAME}
          </p>
          <p className="text-neutral-7">{m.landing_footer_license()}</p>
          <p className="text-neutral-7">
            {m.landing_footer_by()}{" "}
            <a
              href={AUTHOR.url}
              className="group/lively focus-ring rounded-xs font-medium text-neutral-10 underline decoration-neutral-5 underline-offset-4 hover:decoration-neutral-10"
            >
              <Tile className="size-4 translate-y-[0.2em] rounded-full">
                <img src={AUTHOR.portrait} alt="" />
              </Tile>
              {AUTHOR.name}
            </a>
          </p>
        </div>
        <Links title={m.landing_footer_product()}>
          <Link to="/app" className={quiet}>
            {m.landing_open_map()}
          </Link>
          <Link to="/" hash={SECTIONS.features} className={quiet}>
            {m.landing_nav_features()}
          </Link>
          <Link to="/" hash={SECTIONS.next} className={quiet}>
            {m.landing_nav_next()}
          </Link>
        </Links>
        <Links title={m.landing_footer_agents()}>
          <Link to="/agents" className={quiet}>
            {m.landing_agents_all()}
          </Link>
          <a href={`${api}/v1/docs`} className={quiet}>
            {m.landing_nav_api()}
          </a>
          <a href="/llms.txt" className={quiet}>
            llms.txt
          </a>
        </Links>
        <Links title={m.landing_footer_project()}>
          <a href={REPOSITORY_URL} className={quiet}>
            {m.landing_nav_source()}
          </a>
          <a href={FEEDBACK_URL} className={quiet}>
            {m.landing_footer_feedback()}
          </a>
          <Link to="/terms" className={quiet}>
            {m.terms_title()}
          </Link>
        </Links>
      </div>

      <div className="grid gap-l">
        <div
          role="group"
          aria-label={m.landing_footer_language()}
          className="flex items-center gap-m text-s"
        >
          {locales.map((locale) => (
            <button
              key={locale}
              type="button"
              lang={locale}
              aria-current={locale === getLocale() ? "true" : undefined}
              onClick={() => setLocale(locale)}
              className={cn(quiet, "cursor-pointer aria-[current]:text-neutral-10")}
            >
              {LANGUAGES[locale]}
            </button>
          ))}
        </div>
        {/* The name, as wide as the page: a drawing, which no reader of the page is told of. */}
        <svg
          aria-hidden
          viewBox="0 0 100 27"
          className="w-full fill-neutral-3 font-bold select-none"
        >
          <text x="0" y="25" fontSize="34" textLength="100" lengthAdjust="spacingAndGlyphs">
            {APP_NAME}
          </text>
        </svg>
      </div>
    </footer>
  );
}
