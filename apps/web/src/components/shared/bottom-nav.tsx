import { Button } from "@repo/ui/components/ui/button";
import {
  BellFillIcon,
  BellIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  CompassFillIcon,
  CompassIcon,
  type IconProps,
  MapFillIcon,
  MapIcon,
  PersonFillIcon,
  PersonHairFillIcon,
  PersonHairIcon,
  PersonIcon,
  PlusIcon,
  StarBoldIcon,
  StarIcon,
  StarLineIcon,
  UserIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { openCreateMenu } from "@/lib/create-menu";
import {
  NAV_ART,
  NAV_LOOKS,
  type NavArt,
  type NavLook,
  setNavPrototype,
  useNavPrototype,
} from "@/lib/nav-prototype";
import { type PhoneTab, tabOf, tabSearch } from "@/lib/phone-nav";
import { m } from "@/paraglide/messages.js";

import { useUnreadAlerts } from "./use-unread-alerts";

type Art = ComponentType<IconProps>;

const TABS: { tab: PhoneTab; label: () => string }[] = [
  { tab: "map", label: m.nav_map },
  { tab: "saved", label: m.saved_title },
  { tab: "alerts", label: m.alerts_title },
  { tab: "account", label: m.account_menu },
];

// PROTOTYPE: the bar as it is on `main`, kept to compare with.
const CURRENT_ART: Record<PhoneTab, Art> = {
  map: MapIcon,
  saved: StarIcon,
  alerts: BellIcon,
  account: UserIcon,
};

// PROTOTYPE: a tab is drawn as a line, and filled while it is the tab in view.
const ART: Record<NavArt, Record<PhoneTab, { line: Art; fill: Art }>> = {
  a: {
    map: { line: MapIcon, fill: MapFillIcon },
    saved: { line: StarLineIcon, fill: StarBoldIcon },
    alerts: { line: BellIcon, fill: BellFillIcon },
    account: { line: PersonIcon, fill: PersonFillIcon },
  },
  b: {
    map: { line: CompassIcon, fill: CompassFillIcon },
    saved: { line: BookmarkIcon, fill: BookmarkFillIcon },
    alerts: { line: BellIcon, fill: BellFillIcon },
    account: { line: PersonHairIcon, fill: PersonHairFillIcon },
  },
};

// Where a tab stands in the bar, whose middle is the "+".
const COLUMN: Record<PhoneTab, number> = { map: 0, saved: 1, alerts: 3, account: 4 };

/**
 * The bar at the bottom of a phone: the map and the three screens beside it, one press away
 * under the thumb, and in its middle the "+" that adds a spot or an alert. A wide screen has
 * the header in its place. Decision 040.
 */
export function BottomNav({
  className,
  sample,
}: {
  className?: string;
  // PROTOTYPE: a bar drawn to be looked at, in a look, an art and a tab that are given.
  sample?: { look: NavLook; art: NavArt; tab: PhoneTab; unread?: number };
}) {
  const shown = useLocation({ select: (location) => tabOf(location.search) });
  const told = useUnreadAlerts();
  const chosen = useNavPrototype();
  const { look, art } = sample ?? chosen;
  const tab = sample?.tab ?? shown;
  const unread = sample?.unread ?? told;
  const isFloating = look === "floating";

  const tabs = TABS.map(({ tab: target, label }) => {
    const isCurrent = target === tab;
    const count = target === "alerts" ? unread : 0;
    const Line = ART[art][target].line;
    const Fill = ART[art][target].fill;
    const Current = CURRENT_ART[target];
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
          // structure & layout
          "group relative flex min-w-0 flex-col items-center justify-center gap-0.5",
          // typography
          "text-xs text-neutral-7",
          // focus
          "focus-ring outline-none",
          // state: the tab in view
          "aria-[current=page]:text-neutral-10",
          look === "current"
            ? "min-h-14 rounded-(--radius-xs) aria-[current=page]:font-medium"
            : "font-medium [-webkit-tap-highlight-color:transparent]",
          (look === "fill" || look === "line") && "min-h-14 rounded-(--radius-xs)",
          look === "bare" && "min-h-13 rounded-(--radius-xs)",
          isFloating && [
            "rounded-full",
            "transition-colors duration-(--motion-duration) ease-theme",
            "aria-[current=page]:bg-neutral-3",
          ],
        )}
      >
        {look === "current" ? (
          <span
            className={cn(
              "relative grid h-7 w-14 place-items-center rounded-full",
              "transition-colors duration-(--motion-duration) ease-theme",
              // The tab in view is told by more than its color.
              "group-aria-[current=page]:bg-neutral-3",
            )}
          >
            <Current aria-hidden className="size-5" />
            {count > 0 && (
              <span
                aria-hidden
                className="absolute -top-0.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-color-1 px-1 text-xxs font-medium text-neutral-1 tabular-nums"
              >
                {count > 9 ? "9+" : count}
              </span>
            )}
          </span>
        ) : (
          <span
            className={cn(
              "relative grid place-items-center",
              look === "bare" ? "size-6.5" : isFloating ? "size-5.5" : "size-6",
              // A press is felt before the screen changes.
              "motion-safe:transition-transform motion-safe:duration-(--motion-duration) motion-safe:ease-theme",
              "motion-safe:group-active:scale-90",
            )}
          >
            {/* The tab in view is told by more than its color: its art is filled. */}
            <Line
              aria-hidden
              className={cn(
                "size-full",
                "transition-opacity duration-(--motion-duration) ease-theme",
                "group-aria-[current=page]:opacity-0",
              )}
            />
            <Fill
              aria-hidden
              className={cn(
                "absolute inset-0 size-full opacity-0",
                "transition-opacity duration-(--motion-duration) ease-theme",
                "group-aria-[current=page]:opacity-100",
              )}
            />
            {count > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute -top-1 left-1/2 ml-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1",
                  "bg-color-1 text-xxs font-medium text-neutral-1 tabular-nums",
                  // A line of the bar's own color parts the count from the art under it.
                  "shadow-[0_0_0_1.5px_var(--neutral-1)]",
                  isFloating && "group-aria-[current=page]:shadow-[0_0_0_1.5px_var(--neutral-3)]",
                )}
              >
                {count > 9 ? "9+" : count}
              </span>
            )}
          </span>
        )}
        <span className={cn("max-w-full truncate px-xxs", look === "bare" && "sr-only")}>
          {label()}
        </span>
        {look === "bare" && (
          <span
            aria-hidden
            className={cn(
              "absolute bottom-1 size-1 rounded-full bg-neutral-10",
              "scale-0 transition-transform duration-(--motion-duration) ease-theme",
              "group-aria-[current=page]:scale-100",
            )}
          />
        )}
      </Link>
    );
  });

  // What is added is asked in a sheet, which the viewer draws: it is no tab.
  const plus = (
    <Button
      size="icon-lg"
      className={cn(
        // The press reaches past what is drawn, which is smaller than a thumb asks for.
        look !== "current" && !isFloating && "relative size-10 before:absolute before:-inset-1",
        isFloating && "pointer-events-auto size-15 shrink-0 [&_svg:not([class*='size-'])]:size-5",
      )}
      aria-label={m.nav_add()}
      onClick={openCreateMenu}
    >
      <PlusIcon data-slot="icon" aria-hidden />
    </Button>
  );

  if (isFloating) {
    return (
      <nav
        aria-label={m.nav_label()}
        className={cn(
          // structure & layout: the bar floats over what is under it, which is still pressed
          // around it
          "pointer-events-none flex items-center gap-xs",
          // sizing & spacing
          "px-s pb-[max(var(--spacing-s),env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <div
          className={cn(
            "pointer-events-auto grid h-15 min-w-0 flex-1 auto-cols-fr grid-flow-col gap-0.5 p-1",
            "edge rounded-full bg-neutral-1 [--edge-color:var(--neutral-10-transparent)]",
          )}
        >
          {tabs}
        </div>
        {plus}
      </nav>
    );
  }

  return (
    <nav
      aria-label={m.nav_label()}
      className={cn(
        // sizing & spacing: the bar reaches the bottom of the screen, under what the phone draws there
        "px-xs pb-[env(safe-area-inset-bottom)]",
        // border & background
        "bg-neutral-1 shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]",
        className,
      )}
    >
      <div className="relative grid auto-cols-fr grid-flow-col">
        {tabs.slice(0, TABS.length / 2)}
        <div className="grid place-items-center">{plus}</div>
        {tabs.slice(TABS.length / 2)}
        {look === "line" && (
          // A short line at the top of the bar goes from one tab to the next.
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 left-0 flex w-1/5 justify-center",
              "motion-safe:transition-transform motion-safe:duration-(--motion-large-duration) motion-safe:ease-theme-large",
            )}
            style={{ transform: `translateX(${COLUMN[tab] * 100}%)` }}
          >
            <span className="h-0.5 w-7 rounded-full bg-neutral-10" />
          </span>
        )}
      </div>
    </nav>
  );
}

/**
 * PROTOTYPE, not for main: two small buttons at the left of a phone that go to the next look of
 * the bar and to the other art of its tabs.
 */
export function NavPrototypeSwitch({ className }: { className?: string }) {
  const { look, art } = useNavPrototype();
  const index = NAV_LOOKS.indexOf(look);
  const button =
    "grid size-7 cursor-pointer place-items-center rounded-full bg-neutral-10 text-xs font-medium text-neutral-1 tabular-nums opacity-85 [-webkit-tap-highlight-color:transparent]";

  return (
    <div className={cn("flex gap-1", className)}>
      <button
        type="button"
        className={button}
        aria-label={`Style ${index} : passer au suivant`}
        onClick={() => setNavPrototype({ look: NAV_LOOKS[(index + 1) % NAV_LOOKS.length] })}
      >
        {index}
      </button>
      <button
        type="button"
        className={button}
        aria-label={`Icônes ${art.toUpperCase()} : passer aux autres`}
        onClick={() =>
          setNavPrototype({ art: NAV_ART[(NAV_ART.indexOf(art) + 1) % NAV_ART.length] })
        }
      >
        {art.toUpperCase()}
      </button>
    </div>
  );
}
