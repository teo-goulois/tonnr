import { APP_NAME } from "@repo/config/app";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { BellIcon, StarIcon } from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useAuthPrompt } from "@/components/auth/auth-prompt";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import UserMenu from "./user-menu";

const MINUTE_MS = 60 * 1000;

// The bar above every screen of the app: the map's two panels, the theme and the account.
export default function Header() {
  const { data: session, isPending } = authClient.useSession();
  const promptAuth = useAuthPrompt();
  const unread = useQuery(
    orpc.v1.notifications.list.queryOptions({
      input: { unreadOnly: true, limit: 50 },
      enabled: Boolean(session),
      refetchInterval: 5 * MINUTE_MS,
      // The alerts panel says when they cannot be loaded. The bell just shows no count.
      meta: { quiet: true },
    }),
  );
  const unreadCount = session ? (unread.data?.notifications.length ?? 0) : 0;

  return (
    <header className="flex h-14 items-center justify-between gap-s px-m shadow-[inset_0_calc(var(--border-s)*-1)_0_var(--neutral-4)]">
      <Link to="/app" className="focus-ring rounded-(--radius-xs) text-m font-medium outline-none">
        {APP_NAME}
      </Link>
      <nav className="flex items-center gap-xxs">
        <Link
          to="/app"
          search={(previous) => ({ ...previous, panel: "saved" as const })}
          className={buttonVariants({ variant: "ghost", className: "max-sm:size-10 max-sm:px-0" })}
        >
          <StarIcon aria-hidden />
          <span className="max-sm:sr-only">{m.saved_title()}</span>
        </Link>
        <Link
          to="/app"
          search={(previous) => ({ ...previous, panel: "alerts" as const })}
          aria-label={
            unreadCount > 0 ? m.alerts_title_unread({ count: unreadCount }) : m.alerts_title()
          }
          className={buttonVariants({ variant: "ghost", size: "icon", className: "relative" })}
        >
          <BellIcon aria-hidden />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-color-1 px-1 text-xxs font-medium text-neutral-1 tabular-nums"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <ThemeToggle label={m.landing_toggle_theme()} />
        {isPending ? (
          <Skeleton className="size-10 rounded-full" />
        ) : session ? (
          <UserMenu name={session.user.name} email={session.user.email} />
        ) : (
          <Button variant="outline" onClick={() => promptAuth()}>
            {m.auth_sign_in()}
          </Button>
        )}
      </nav>
    </header>
  );
}
