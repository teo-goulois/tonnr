import { Link } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { m } from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

import { SECTIONS } from "./landing-parts";

export function LandingHeader() {
  const otherLocale = getLocale() === "fr" ? "en" : "fr";
  const quiet = buttonVariants({ variant: "ghost", size: "sm" });

  return (
    <header className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-m px-m py-m sm:px-l lg:grid-cols-[1fr_auto_1fr]">
      <Link to="/" className="focus-ring justify-self-start rounded-xs font-bold">
        {APP_NAME}
      </Link>
      <nav aria-label={m.landing_nav_label()} className="flex items-center gap-xxs max-lg:hidden">
        <Link to="/" hash={SECTIONS.features} className={quiet}>
          {m.landing_nav_features()}
        </Link>
        <Link to="/" hash={SECTIONS.agents} className={quiet}>
          {m.landing_nav_agents()}
        </Link>
        <Link to="/" hash={SECTIONS.story} className={quiet}>
          {m.landing_nav_story()}
        </Link>
        <a href={REPOSITORY_URL} className={quiet}>
          {m.landing_nav_source()}
        </a>
      </nav>
      <div className="flex items-center gap-xxs justify-self-end">
        <Button variant="ghost" size="sm" lang={otherLocale} onClick={() => setLocale(otherLocale)}>
          {m.landing_switch_locale()}
        </Button>
        <ThemeToggle label={m.landing_toggle_theme()} />
        <Link to="/app" className={buttonVariants({ size: "sm", className: "max-sm:hidden" })}>
          {m.landing_open_map()}
        </Link>
      </div>
    </header>
  );
}
