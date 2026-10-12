import { Button } from "@repo/ui/components/ui/button";
import {
  BellFillIcon,
  BellIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  type IconProps,
  MapFillIcon,
  MapIcon,
  PersonFillIcon,
  PersonIcon,
  PlusIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { openCreateMenu } from "@/lib/create-menu";
import { type PhoneTab, tabOf, tabSearch } from "@/lib/phone-nav";
import { m } from "@/paraglide/messages.js";

import { useUnreadAlerts } from "./use-unread-alerts";

// A tab is drawn as a line, and filled while it is the tab in view.
const TABS: {
  tab: PhoneTab;
  label: () => string;
  line: ComponentType<IconProps>;
  fill: ComponentType<IconProps>;
}[] = [
  { tab: "map", label: m.nav_map, line: MapIcon, fill: MapFillIcon },
  { tab: "saved", label: m.saved_title, line: BookmarkIcon, fill: BookmarkFillIcon },
  { tab: "alerts", label: m.alerts_title, line: BellIcon, fill: BellFillIcon },
  { tab: "account", label: m.account_menu, line: PersonIcon, fill: PersonFillIcon },
];

// The two arts of a tab stand on each other, and one gives way to the other.
const art = "size-full transition-opacity duration-(--motion-duration) ease-theme";

/**
 * The bar at the bottom of a phone: the map and the three screens beside it, one press away
 * under the thumb, and beside them the "+" that adds a spot or an alert. It floats over the
 * screen as the map's own buttons do, and what stands at the bottom of a screen keeps clear of
 * it by `--bottom-nav-lift`. A wide screen has the header in its place. Decision 040.
 */
export function BottomNav({ className }: { className?: string }) {
  const tab = useLocation({ select: (location) => tabOf(location.search) });
  const unread = useUnreadAlerts();

  return (
    <nav
      aria-label={m.nav_label()}
      className={cn(
        // structure & layout: what is under the bar is still pressed around it
        "pointer-events-none flex items-center gap-xs",
        // sizing & spacing: clear of what the phone draws at the bottom of its screen
        "px-s pb-[max(var(--spacing-s),env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <div
        className={cn(
          // structure & layout
          "pointer-events-auto flex h-15 min-w-0 flex-1 gap-0.5 p-1",
          // border & background: the surface of what floats on the map
          "edge rounded-full bg-neutral-1 [--edge-color:var(--neutral-10-transparent)]",
        )}
      >
        {TABS.map(({ tab: target, label, line: Line, fill: Fill }) => {
          const isCurrent = target === tab;
          const count = target === "alerts" ? unread : 0;
          return (
            <Link
              key={target}
              to="/app"
              search={(previous) => tabSearch(target, previous)}
              // The router marks a link as the page in view when the address holds what the link
              // asks for, which the map's link asks of every address. Only the address a tab leads
              // to marks it here, and `tabOf` says which tab an address shows.
              activeOptions={{ exact: true }}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={count > 0 ? m.alerts_title_unread({ count }) : undefined}
              className={cn(
                // structure & layout: the tabs are as wide as each other, until the narrowest
                // phone, where the longest name keeps its room
                "group flex min-w-min flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-full",
                // typography
                "text-xs font-medium text-neutral-7",
                // motion
                "transition-colors duration-(--motion-duration) ease-theme",
                // focus, and no veil of the phone's own over a tab that is pressed
                "focus-ring outline-none [-webkit-tap-highlight-color:transparent]",
                // state: the tab in view
                "aria-[current=page]:bg-neutral-3 aria-[current=page]:text-neutral-10",
              )}
            >
              <span
                className={cn(
                  "relative grid size-5.5 place-items-center",
                  // A press is felt before the screen changes.
                  "motion-safe:transition-transform motion-safe:duration-(--motion-duration) motion-safe:ease-theme",
                  "motion-safe:group-active:scale-90",
                )}
              >
                {/* The tab in view is told by more than its color: its art is filled. */}
                <Line aria-hidden className={cn(art, "group-aria-[current=page]:opacity-0")} />
                <Fill
                  aria-hidden
                  className={cn(
                    art,
                    "absolute inset-0 opacity-0 group-aria-[current=page]:opacity-100",
                  )}
                />
                {count > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -top-1 left-1/2 ml-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1",
                      "bg-color-1 text-xxs font-medium text-neutral-1 tabular-nums",
                      // A line of the color under it parts the count from the art.
                      "shadow-[0_0_0_1.5px_var(--neutral-1)] group-aria-[current=page]:shadow-[0_0_0_1.5px_var(--neutral-3)]",
                    )}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-0.5">{label()}</span>
            </Link>
          );
        })}
      </div>
      {/* What is added is asked in a sheet, which the viewer draws: it is no tab. */}
      <Button
        size="icon-xl"
        className="pointer-events-auto size-15 shrink-0"
        aria-label={m.nav_add()}
        onClick={openCreateMenu}
      >
        <PlusIcon data-slot="icon" aria-hidden />
      </Button>
    </nav>
  );
}
