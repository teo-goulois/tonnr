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

export function NavLink({
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

type ShellProps = {
  account: { name: string; email: string };
  // Where the name of the app leads: the first screen of whoever reads.
  home: "/" | "/console";
  // The pages of the bar. Without any, the bar has no row of pages.
  nav?: ReactNode;
  // What the keyboard reaches: the palette and the shortcuts of whoever reads.
  commands: ReactNode;
  children: ReactNode;
};

/**
 * The bar above every screen, and the column the screen sits in. An operator and a member of a
 * developer account have the same bar, with the pages and the commands of each.
 */
export function Shell({ account, home, nav, commands, children }: ShellProps) {
  const bindings = useShortcuts();

  return (
    <div className="grid min-h-svh grid-cols-1 grid-rows-[auto_1fr]">
      <header className="flex min-h-14 flex-wrap items-center gap-x-m px-m shadow-[inset_0_calc(var(--border-s)*-1)_0_var(--neutral-4)]">
        <Link
          to={home}
          className="focus-ring flex h-14 items-center rounded-(--radius-xs) text-m font-medium outline-none"
        >
          {m.app_title({ name: APP_NAME })}
        </Link>
        {/* On a phone the pages take a row of their own, which scrolls sideways if it must. */}
        {nav && (
          <nav
            aria-label={m.nav_label()}
            className="order-last flex w-full items-center gap-xxs overflow-x-auto pb-xs sm:order-none sm:w-auto sm:pb-0"
          >
            {nav}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-xxs">
          {/* Every page and action, by its name. The keys are shown to whoever has a
              keyboard. */}
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
      {commands}
      {/* One column that takes the room it has: a wide table scrolls in its own box. */}
      <main className="mx-auto grid grid-cols-1 w-full max-w-(--container-6xl) content-start gap-l px-m py-l">
        {children}
      </main>
    </div>
  );
}

type AdminShellProps = Pick<ShellProps, "account" | "children">;

/** The admin of an operator: every page that runs the instance, and its commands. */
export function AdminShell({ account, children }: AdminShellProps) {
  return (
    <Shell
      account={account}
      home="/"
      nav={
        <>
          <NavLink to="/" exact>
            {m.nav_overview()}
          </NavLink>
          <NavLink to="/developers">{m.nav_developers()}</NavLink>
          <NavLink to="/activity">{m.nav_activity()}</NavLink>
          <NavLink to="/accounts">{m.nav_accounts()}</NavLink>
          <NavLink to="/instance">{m.nav_instance()}</NavLink>
        </>
      }
      commands={
        <>
          <AdminHotkeys />
          <CommandPalette />
          <ShortcutSettings />
        </>
      }
    >
      {children}
    </Shell>
  );
}
