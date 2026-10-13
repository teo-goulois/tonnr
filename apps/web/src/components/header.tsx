import { APP_NAME } from "@repo/config/app";
import { Button } from "@repo/ui/components/ui/button";
import {
  BellFillIcon,
  BellIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  type IconProps,
  PersonFillIcon,
  PersonIcon,
  SearchIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { useAuthPrompt } from "@/components/auth/auth-prompt";
import { openCommandPalette } from "@/components/shared/command-palette";
import { ShortcutKeys } from "@/components/shared/shortcut-keys";
import { useUnreadAlerts } from "@/components/shared/use-unread-alerts";
import { authClient } from "@/lib/auth-client";
import { isTabPanel, type TabPanel, tabSearch } from "@/lib/phone-nav";
import { useShortcuts } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages.js";

// The panels a wide screen opens beside the map: the tabs of a phone's bar, less the map, which
// is always in view here.
const PANELS: {
  panel: TabPanel;
  label: () => string;
  line: ComponentType<IconProps>;
  fill: ComponentType<IconProps>;
}[] = [
  { panel: "saved", label: m.saved_title, line: BookmarkIcon, fill: BookmarkFillIcon },
  { panel: "alerts", label: m.alerts_title, line: BellIcon, fill: BellFillIcon },
  { panel: "account", label: m.account_menu, line: PersonIcon, fill: PersonFillIcon },
];

// The surface of what floats on the map, as its buttons and a phone's bar have it.
const floating = "edge h-10 rounded-full bg-neutral-1 [--edge-color:var(--neutral-10-transparent)]";

type HeaderProps = {
  // False where there is nowhere to go: the bar is then a line over the page, with the name.
  nav?: boolean;
  className?: string;
};

/**
 * What stands at the top of a wide screen. It floats over the map as the map's own buttons do:
 * the name with the search, which opens the command palette, and the three panels of the map.
 * What stands at the top of the map keeps clear of it by `--app-header-lift`, which `index.css`
 * sets. A phone has the bar of tabs at its bottom in its place: decision 040.
 */
export default function Header({ nav = true, className }: HeaderProps) {
  const { data: session, isPending } = authClient.useSession();
  const promptAuth = useAuthPrompt();
  const unreadCount = useUnreadAlerts();
  const hotkey = useShortcuts()["command-palette"];
  const opened = useLocation({
    select: (location) => (location.search as { panel?: string }).panel,
  });

  const name = (
    <Link
      to="/app"
      className="focus-ring flex h-full items-center rounded-full px-s font-medium outline-none"
    >
      {APP_NAME}
    </Link>
  );

  if (!nav) {
    return <header className={cn("flex h-14 items-center px-xs", className)}>{name}</header>;
  }

  return (
    <header
      data-app-header=""
      className={cn(
        // What is under the bar is still pressed around its two parts.
        "pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-s p-s",
        className,
      )}
    >
      <div className={cn(floating, "pointer-events-auto flex min-w-0 items-center p-1")}>
        {name}
        <button
          type="button"
          aria-label={m.search_open()}
          aria-keyshortcuts={hotkey || undefined}
          onClick={openCommandPalette}
          className={cn(
            // structure & layout
            "flex h-full w-72 min-w-0 items-center gap-xs rounded-full pr-xs pl-s",
            // typography & background: a field, which the name stands beside
            "bg-neutral-3 text-s text-neutral-7",
            // motion & state
            "transition-colors duration-(--motion-duration) ease-theme hover:text-neutral-10",
            "focus-ring cursor-pointer outline-none",
          )}
        >
          <SearchIcon aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-start">{m.search_placeholder()}</span>
          <ShortcutKeys hotkey={hotkey} className="shrink-0" />
        </button>
      </div>

      <nav
        aria-label={m.nav_label()}
        className={cn(floating, "pointer-events-auto flex shrink-0 items-center gap-0.5 p-1")}
      >
        {PANELS.map(({ panel, label, line: Line, fill: Fill }) => {
          const isCurrent = isTabPanel(opened) && opened === panel;
          const count = panel === "alerts" ? unreadCount : 0;
          return (
            <Link
              key={panel}
              to="/app"
              // A panel opens over what is selected, on its first screen, and the link of the
              // panel in view closes it.
              search={(previous) =>
                isCurrent
                  ? tabSearch("map", previous)
                  : { ...previous, panel, alerts: undefined, settings: undefined }
              }
              // The router marks a link by what its address holds: only the panel in view is
              // marked here.
              activeOptions={{ exact: true }}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={count > 0 ? m.alerts_title_unread({ count }) : undefined}
              className={cn(
                // structure & layout
                "group flex h-full items-center gap-xs rounded-full px-s",
                // typography
                "text-s font-medium text-neutral-7",
                // motion
                "transition-colors duration-(--motion-duration) ease-theme",
                // state: the panel in view
                "hover:text-neutral-10 aria-[current=page]:bg-neutral-3 aria-[current=page]:text-neutral-10",
                "focus-ring outline-none",
              )}
            >
              <span className="relative grid size-4 place-items-center">
                {/* The panel in view is told by more than its color: its art is filled. */}
                {isCurrent ? (
                  <Fill aria-hidden className="size-full" />
                ) : (
                  <Line aria-hidden className="size-full" />
                )}
                {count > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -top-1.5 left-1/2 ml-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full px-1",
                      "bg-color-1 text-xxs font-medium text-neutral-1 tabular-nums",
                      // A line of the color under it parts the count from the art.
                      "shadow-[0_0_0_1.5px_var(--neutral-1)] group-aria-[current=page]:shadow-[0_0_0_1.5px_var(--neutral-3)]",
                    )}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              {label()}
            </Link>
          );
        })}
        {/* A visitor is asked for an account here. Nothing stands for it while who opens the
            app is not known: an account is the usual answer, and has no button. */}
        {!isPending && !session && (
          <Button size="sm" className="ml-xxs rounded-full" onClick={() => promptAuth()}>
            {m.auth_sign_in()}
          </Button>
        )}
      </nav>
    </header>
  );
}
