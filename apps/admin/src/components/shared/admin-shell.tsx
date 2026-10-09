import { APP_NAME } from "@repo/config/app";
import { Button } from "@repo/ui/components/ui/button";
import { SearchIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useShortcuts } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";

import { AccountMenu } from "./account-menu";
import { AdminHotkeys } from "./admin-hotkeys";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { ShortcutKeys } from "./shortcut-keys";
import { ShortcutSettings } from "./shortcut-settings";
import { ThemeToggle } from "./theme-toggle";

function NavLink({
  to,
  exact,
  children,
}: {
  to: LinkProps["to"];
  exact?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      // A page is the same page whatever span of time or search its address holds.
      activeOptions={{ exact, includeSearch: false }}
      className={cn(
        // structure & layout
        "flex h-9 shrink-0 items-center rounded-(--radius-xs) px-s",
        // typography
        "text-s font-medium whitespace-nowrap text-neutral-7",
        // focus
        "focus-ring outline-none",
        // transitions
        "transition-colors duration-(--motion-duration) ease-theme",
        // state: hover and the page shown
        "hover:text-neutral-10 data-[status=active]:bg-neutral-3 data-[status=active]:text-neutral-10",
      )}
    >
      {children}
    </Link>
  );
}

type AdminShellProps = {
  account: { name: string; email: string };
  children: ReactNode;
};

/** The bar above every screen of the admin, and the column the screen sits in. */
export function AdminShell({ account, children }: AdminShellProps) {
  const bindings = useShortcuts();

  return (
    <div className="grid min-h-svh grid-cols-1 grid-rows-[auto_1fr]">
      <header className="flex min-h-14 flex-wrap items-center gap-x-m px-m shadow-[inset_0_calc(var(--border-s)*-1)_0_var(--neutral-4)]">
        <Link
          to="/"
          className="focus-ring flex h-14 items-center rounded-(--radius-xs) text-m font-medium outline-none"
        >
          {m.app_title({ name: APP_NAME })}
        </Link>
        {/* On a phone the pages take a row of their own, which scrolls sideways if it must. */}
        <nav
          aria-label={m.nav_label()}
          className="order-last flex w-full items-center gap-xxs overflow-x-auto pb-xs sm:order-none sm:w-auto sm:pb-0"
        >
          <NavLink to="/" exact>
            {m.nav_overview()}
          </NavLink>
          <NavLink to="/developers">{m.nav_developers()}</NavLink>
          <NavLink to="/activity">{m.nav_activity()}</NavLink>
          <NavLink to="/accounts">{m.nav_accounts()}</NavLink>
          <NavLink to="/instance">{m.nav_instance()}</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-xxs">
          {/* Every page, action and developer account, by its name. The keys are shown to
              whoever has a keyboard. */}
          <Button
            variant="ghost"
            aria-keyshortcuts={bindings["command-palette"] || undefined}
            onClick={openCommandPalette}
          >
            <SearchIcon data-slot="icon" aria-hidden />
            <span className="max-md:sr-only">{m.command_palette_hint()}</span>
            <ShortcutKeys hotkey={bindings["command-palette"]} className="max-md:hidden" />
          </Button>
          <ThemeToggle />
          <AccountMenu name={account.name} email={account.email} />
        </div>
      </header>
      {/* One column that takes the room it has: a wide table scrolls in its own box. */}
      <AdminHotkeys />
      <CommandPalette />
      <ShortcutSettings />
      <main className="mx-auto grid grid-cols-1 w-full max-w-(--container-6xl) content-start gap-l px-m py-l">
        {children}
      </main>
    </div>
  );
}
