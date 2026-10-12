import { APP_NAME } from "@repo/config/app";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { BellIcon, BookmarkIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { useAuthPrompt } from "@/components/auth/auth-prompt";
import { useOwnAccount } from "@/components/auth/use-own-account";
import { useSendVerification } from "@/components/auth/use-send-verification";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useUnreadAlerts } from "@/components/shared/use-unread-alerts";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";

import UserMenu from "./user-menu";

// The bar above every screen of the app on a wide screen: the map's two panels, the theme and
// the account. A phone has the bar of tabs at its bottom in its place: decision 040.
export default function Header({ className }: { className?: string }) {
  const { data: session, isPending } = authClient.useSession();
  const promptAuth = useAuthPrompt();
  const unreadCount = useUnreadAlerts();
  // An instance that checks addresses says so here, and the account menu offers the mail again.
  const { account } = useOwnAccount();
  const verification = useSendVerification();
  const needsCheck = account?.checksAddresses === true && !account.emailVerified;

  return (
    <header
      className={cn(
        "flex h-14 items-center justify-between gap-s px-m shadow-[inset_0_calc(var(--border-s)*-1)_0_var(--neutral-4)]",
        className,
      )}
    >
      <Link to="/app" className="focus-ring rounded-(--radius-xs) text-m font-medium outline-none">
        {APP_NAME}
      </Link>
      <nav className="flex items-center gap-xxs">
        <Link
          to="/app"
          search={(previous) => ({ ...previous, panel: "saved" as const })}
          className={buttonVariants({ variant: "ghost" })}
        >
          <BookmarkIcon aria-hidden />
          {m.saved_title()}
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
          <UserMenu
            // An account is called by its username once it has one.
            name={session.user.username ? `@${session.user.username}` : session.user.name}
            email={session.user.email}
            check={
              needsCheck
                ? { isSending: verification.isSending, onSend: verification.send }
                : undefined
            }
          />
        ) : (
          <Button variant="outline" onClick={() => promptAuth()}>
            {m.auth_sign_in()}
          </Button>
        )}
      </nav>
    </header>
  );
}
