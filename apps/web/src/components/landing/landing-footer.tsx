import { Link } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";
import { Badge } from "@repo/ui/components/ui/badge";
import { buttonVariants } from "@repo/ui/components/ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
import {
  AppsFillDuoIcon,
  ArrowRightIcon,
  ChevronsUpDownIcon,
  GlobalIcon,
  HeartFillDuoIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { EmailMenu } from "@/components/shared/email-menu";
import { ENV } from "@/env.public";
import { WAVE_HEIGHT_SCALE, scaleColor } from "@/lib/sea-scales";
import { LANGUAGES } from "@/lib/languages";
import { apiOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { getLocale, locales, setLocale } from "@/paraglide/runtime.js";

import {
  Card,
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  arrive,
  column,
  order,
  ruled,
  useArriving,
} from "./landing-parts";
import { AUTHOR } from "./landing-story";

// The apps for a phone, which are not out yet: an address put here turns its store into a link.
const STORES: { name: string; url: string | null }[] = [
  { name: "iPhone", url: null },
  { name: "Android", url: null },
];

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

/** The apps for a phone: said to come, each store a link once its app is out. */
function MobileApps() {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-m sm:gap-l">
      <div className="grid max-w-[36rem] gap-xs">
        <h3 className="text-l font-bold text-balance max-sm:text-[1.25rem] max-sm:leading-[1.3]">
          <Woven
            say={m.landing_apps_title}
            words={{
              pocket: (
                <>
                  <Tile color={scaleColor(WAVE_HEIGHT_SCALE, 2)} className="mr-[0.2em]">
                    <AppsFillDuoIcon />
                  </Tile>
                  {m.landing_apps_word()}
                </>
              ),
            }}
          />
        </h3>
        <p className="text-neutral-7">{m.landing_apps_more()}</p>
      </div>
      <ul className="flex flex-wrap gap-xs sm:gap-s">
        {STORES.map((store) => (
          <li key={store.name}>
            {store.url ? (
              <a
                href={store.url}
                className={cn(buttonVariants(), "h-10 rounded-full px-m sm:h-11 sm:px-l")}
              >
                {store.name}
              </a>
            ) : (
              <span className="edge inline-flex h-10 items-center gap-s rounded-full bg-neutral-1 pr-xs pl-m font-medium sm:h-11 sm:pr-s sm:pl-l">
                {store.name}
                <Badge>{m.landing_apps_soon()}</Badge>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The language of the page, chosen in a list that names each in its own words. */
function LanguagePicker() {
  return (
    <Menu>
      <MenuTrigger
        aria-label={m.landing_footer_language()}
        className={cn(quiet, "flex cursor-pointer items-center gap-xs justify-self-start text-s")}
      >
        <GlobalIcon aria-hidden className="size-4" />
        {LANGUAGES[getLocale()]}
        <ChevronsUpDownIcon aria-hidden className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="start" side="top">
        <MenuRadioGroup
          value={getLocale()}
          onValueChange={(locale: (typeof locales)[number]) => setLocale(locale)}
        >
          {locales.map((locale) => (
            <MenuRadioItem key={locale} value={locale} lang={locale}>
              {LANGUAGES[locale]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/**
 * The end of the landing and of the pages beside it: the apps for a phone, the way into the app
 * said once more, where everything is with the address to write to, the language, which the page
 * otherwise takes from the browser, beside the legal pages, and the name.
 */
export function LandingFooter() {
  const api = apiOrigin(ENV.VITE_SERVER_URL);
  // What closes the page arrives as a part of it does; the links under it are there already.
  const arriving = useArriving<HTMLDivElement>();

  return (
    <footer className={`${column} ${apart} grid gap-xl sm:gap-xxl`}>
      <div
        {...arriving}
        className={`${ruled} group/arrival grid gap-xl pt-xxl sm:gap-xxl sm:pt-[calc(var(--space-xxl)*1.5)]`}
      >
        <div className={arrive}>
          <MobileApps />
        </div>
        <div
          style={order(1)}
          className={cn(arrive, "flex flex-wrap items-end justify-between gap-l")}
        >
          <SectionTitle
            title={m.landing_closing_title()}
            more={m.landing_closing_more()}
            className="max-w-2xl"
          />
          <OpenTheMap />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-m gap-y-l text-s sm:grid-cols-3 sm:gap-xl lg:grid-cols-12">
        <div className="col-span-2 grid content-start gap-xs sm:col-span-3 lg:col-span-6">
          <p className="flex items-center gap-xs text-m font-bold">
            <img src="/favicon.svg" alt="" width={20} height={20} className="size-5" />
            {APP_NAME}
          </p>
          <p className="text-neutral-7">{m.landing_footer_license()}</p>
          <p className="text-neutral-7">
            <Woven
              say={m.landing_footer_by}
              words={{
                heart: (
                  <>
                    <HeartFillDuoIcon
                      aria-hidden
                      className="inline size-[1.1em] align-[-0.2em] text-error [&_[data-color=color-2]]:opacity-70 [&_[data-color=color-2]]:[fill-opacity:1] transition-[scale] duration-200 ease-out group-hover/lively:scale-125 motion-reduce:transition-none"
                    />
                    <span className="sr-only">{m.landing_footer_love()}</span>
                  </>
                ),
              }}
            />{" "}
            <a
              href={AUTHOR.url}
              className="group/lively focus-ring rounded-xs font-medium text-neutral-10 underline decoration-neutral-5 underline-offset-4 hover:decoration-neutral-10"
            >
              <Tile className="rounded-full [--tile:--spacing(4)]">
                <img src={AUTHOR.portrait} alt="" />
              </Tile>
              {AUTHOR.name}
            </a>
          </p>
          <p>
            <EmailMenu className="text-neutral-7 hover:text-neutral-10" />
          </p>
        </div>
        <Links title={m.landing_footer_product()}>
          <Link to="/app" className={quiet}>
            {m.landing_open_map()}
          </Link>
          <Link to="/spots" className={quiet}>
            {m.page_spots()}
          </Link>
          <Link to="/" hash={SECTIONS.features} className={quiet}>
            {m.landing_nav_features()}
          </Link>
          <Link to="/" hash={SECTIONS.next} className={quiet}>
            {m.landing_nav_next()}
          </Link>
          <Link to="/sources" className={quiet}>
            {m.landing_nav_sources()}
          </Link>
        </Links>
        <Links title={m.landing_footer_agents()}>
          <Link to="/agents" className={quiet}>
            {m.landing_agents_all()}
          </Link>
          <Link to="/contact" search={{ topic: "key" }} className={quiet}>
            {m.landing_agents_dev_key()}
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
          <Link to="/contact" className={quiet}>
            {m.contact_nav()}
          </Link>
        </Links>
      </div>

      <div className="grid gap-l">
        {/* The language, then what the law asks for, on one quiet line. */}
        <div className="flex flex-wrap items-center gap-x-l gap-y-xs text-s">
          <LanguagePicker />
          <Link to="/terms" className={quiet}>
            {m.terms_title()}
          </Link>
          <Link to="/privacy" className={quiet}>
            {m.privacy_title()}
          </Link>
          <Link to="/legal" className={quiet}>
            {m.legal_title()}
          </Link>
        </div>
        {/* The name, as wide as the page: a drawing, which no reader of the page is told of. */}
        {/* The page ends across its letters, a fifth of them below the edge. */}
        <div aria-hidden className="aspect-[100/21.6] overflow-hidden">
          <svg viewBox="0 0 100 27" className="w-full fill-neutral-3 font-bold select-none">
            <text x="0" y="25" fontSize="34" textLength="100" lengthAdjust="spacingAndGlyphs">
              {APP_NAME}
            </text>
          </svg>
        </div>
      </div>
    </footer>
  );
}
