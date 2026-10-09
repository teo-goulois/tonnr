import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { CircleCheckIcon, OctagonXIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { formatAgo, formatClock, formatDayAndClock } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { AccountPrompt } from "./saved-panel";
import type { AlertNotification, Loadable } from "./types";

const rowLayout = "flex w-full items-start gap-s rounded-(--radius-xs) px-xs py-xs";

function AlertRowSkeleton() {
  return (
    <li className={rowLayout}>
      <Skeleton className="mt-0.5 size-4.5 rounded-full" />
      <div className="grid flex-1 gap-xxs">
        <Skeleton className="h-(--line-m) w-2/5 rounded-(--radius-xs)" />
        <Skeleton className="h-(--line-s) w-3/5 rounded-(--radius-xs)" />
      </div>
    </li>
  );
}

type AlertsPanelProps = {
  now: number;
  signedIn: boolean;
  notifications: Loadable<AlertNotification[]>;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onRead: (notification: AlertNotification) => void;
};

/** What the visitor was told about their spots, newest first. */
export function AlertsPanel({
  now,
  signedIn,
  notifications,
  onSignIn,
  onCreateAccount,
  onRead,
}: AlertsPanelProps) {
  if (!signedIn) {
    return (
      <AccountPrompt
        text={m.alerts_sign_in_prompt()}
        onSignIn={onSignIn}
        onCreateAccount={onCreateAccount}
      />
    );
  }

  if (notifications.isPending) {
    return (
      <ul className="-mx-xs grid gap-xxs">
        <AlertRowSkeleton />
        <AlertRowSkeleton />
        <AlertRowSkeleton />
      </ul>
    );
  }
  if (notifications.isError) {
    return <p className="text-s text-neutral-7">{m.alerts_load_failed()}</p>;
  }
  if (!notifications.data?.length) {
    return <p className="text-neutral-7">{m.alerts_empty()}</p>;
  }

  return (
    <ul className="-mx-xs grid gap-xxs">
      {notifications.data.map((notification) => {
        const found = notification.kind === "window_found";
        const window = m.alerts_window({
          start: formatDayAndClock(notification.windowStart),
          end: formatClock(notification.windowEnd),
        });
        const unread = notification.readAt === null;

        return (
          <li key={notification.id}>
            <button
              type="button"
              // Reading an alert is the only thing to do with it, and only once.
              disabled={!unread}
              className={cn(
                rowLayout,
                "focus-ring text-left outline-none",
                unread && "cursor-pointer hover:bg-neutral-3-transparent",
              )}
              onClick={() => onRead(notification)}
            >
              {found ? (
                <CircleCheckIcon aria-hidden className="mt-0.5 size-4.5 shrink-0" />
              ) : (
                <OctagonXIcon aria-hidden className="mt-0.5 size-4.5 shrink-0 text-neutral-7" />
              )}
              <span className="grid min-w-0 flex-1 gap-xxs">
                <span className={cn("truncate", unread && "font-medium")}>
                  {notification.spot.name}
                </span>
                <span className="text-s text-neutral-7">
                  {found ? m.alerts_found({ window }) : m.alerts_cancelled({ window })}
                </span>
                <span className="text-xs text-neutral-7">
                  {formatAgo(notification.createdAt, now)}
                </span>
              </span>
              {unread && (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-color-1">
                  <span className="sr-only">{m.alerts_unread()}</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
