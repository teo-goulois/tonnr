import { Link } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { m } from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

export function LandingHeader({ apiDocsUrl }: { apiDocsUrl: string }) {
  const otherLocale = getLocale() === "fr" ? "en" : "fr";

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-m px-m py-m">
      <Link to="/" className="focus-ring rounded-xs text-l font-bold">
        {APP_NAME}
      </Link>
      <nav className="flex items-center gap-xxs">
        <a
          href={apiDocsUrl}
          className={buttonVariants({ variant: "ghost", className: "max-sm:hidden" })}
        >
          {m.landing_nav_api()}
        </a>
        <a
          href={REPOSITORY_URL}
          className={buttonVariants({ variant: "ghost", className: "max-sm:hidden" })}
        >
          {m.landing_nav_source()}
        </a>
        <Button variant="ghost" lang={otherLocale} onClick={() => setLocale(otherLocale)}>
          {m.landing_switch_locale()}
        </Button>
        <ThemeToggle label={m.landing_toggle_theme()} />
      </nav>
    </header>
  );
}
