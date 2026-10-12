import { Button } from "@repo/ui/components/ui/button";
import { BellIcon, type IconProps, MapIcon, PlusIcon, StarIcon, UserIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { type ComponentType, Fragment } from "react";

import { openCreateMenu } from "@/lib/create-menu";
import { type PhoneTab, tabOf, tabSearch } from "@/lib/phone-nav";
import { m } from "@/paraglide/messages.js";

import { useUnreadAlerts } from "./use-unread-alerts";

const TABS: { tab: PhoneTab; label: () => string; icon: ComponentType<IconProps> }[] = [
  { tab: "map", label: m.nav_map, icon: MapIcon },
  { tab: "saved", label: m.saved_title, icon: StarIcon },
  { tab: "alerts", label: m.alerts_title, icon: BellIcon },
  { tab: "account", label: m.account_menu, icon: UserIcon },
];

/**
 * The bar at the bottom of a phone: the map and the three screens beside it, one press away
 * under the thumb, and in its middle the "+" that adds a spot or an alert. A wide screen has
 * the header in its place. Decision 040.
 */
export function BottomNav({ className }: { className?: string }) {
  const tab = useLocation({ select: (location) => tabOf(location.search) });
  const unread = useUnreadAlerts();

  return (
    <nav
      aria-label={m.nav_label()}
      className={cn(
        // structure & layout
        "grid auto-cols-fr grid-flow-col",
        // sizing & spacing: the bar reaches the bottom of the screen, under what the phone draws there
        "px-xs pb-[env(safe-area-inset-bottom)]",
        // border & background
        "bg-neutral-1 shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]",
        className,
      )}
    >
      {TABS.map(({ tab: target, label, icon: TabIcon }, index) => {
        const isCurrent = target === tab;
        const count = target === "alerts" ? unread : 0;
        return (
          <Fragment key={target}>
            {/* What is added is asked in a sheet, which the viewer draws: it is no tab. */}
            {index === TABS.length / 2 && (
              <div className="grid place-items-center">
                <Button size="icon-lg" aria-label={m.nav_add()} onClick={openCreateMenu}>
                  <PlusIcon data-slot="icon" aria-hidden />
                </Button>
              </div>
            )}
            <Link
              to="/app"
              search={(previous) => tabSearch(target, previous)}
              // The router marks a link as the page in view when the address holds what the link
              // asks for, which the map's link asks of every address. Only the address a tab leads
              // to marks it here, and `tabOf` says which tab an address shows.
              activeOptions={{ exact: true }}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={count > 0 ? m.alerts_title_unread({ count }) : undefined}
              className={cn(
                // structure & layout
                "group flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5",
                // typography
                "text-xs text-neutral-7",
                // focus
                "focus-ring rounded-(--radius-xs) outline-none",
                // state: the tab in view
                "aria-[current=page]:font-medium aria-[current=page]:text-neutral-10",
              )}
            >
              <span
                className={cn(
                  "relative grid h-7 w-14 place-items-center rounded-full",
                  "transition-colors duration-(--motion-duration) ease-theme",
                  // The tab in view is told by more than its color.
                  "group-aria-[current=page]:bg-neutral-3",
                )}
              >
                <TabIcon aria-hidden className="size-5" />
                {count > 0 && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-color-1 px-1 text-xxs font-medium text-neutral-1 tabular-nums"
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-xxs">{label()}</span>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
