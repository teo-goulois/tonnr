import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import {
  CircleCheckIcon,
  ClockIcon,
  type IconProps,
  MoonIcon,
  OctagonXIcon,
  WaveIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentType } from "react";

import { formatAgo, formatClock, formatDay, formatDayAndClock } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { type AlertSettingsChange, AlertSettingsForm } from "../alerts/alert-settings";
import { MyAlerts } from "../alerts/my-alerts";
import { AccountPrompt } from "./saved-panel";
import type { Alert, AlertNotification, AlertSettings, Loadable, Spot } from "./types";

/** The parts of the alerts panel: what was told, the alerts, and how to be told. */
export type AlertsTab = "news" | "mine" | "settings";

type Moment = AlertNotification["moment"];
type Line = AlertNotification["payload"]["lines"][number];

// What each moment of an alert is called, and its sign: decision 031, "The moments".
const MOMENTS: Record<
  Moment,
  { label: () => string; icon: ComponentType<IconProps>; quiet?: boolean }
> = {
  found: { label: m.alerts_moment_found, icon: CircleCheckIcon },
  moved: { label: m.alerts_moment_moved, icon: ClockIcon },
  gone: { label: m.alerts_moment_gone, icon: OctagonXIcon, quiet: true },
  evening: { label: m.alerts_moment_evening, icon: MoonIcon },
  begins: { label: m.alerts_moment_begins, icon: WaveIcon },
};

// Open hours as the account reads them: in the time zone they were worked out in. Hours that
// run into another day say which day they end on.
function hoursOf(stretches: Line["open"], zone: string) {
  return stretches
    .map((stretch) => {
      const start = new Date(stretch.start);
      const end = new Date(stretch.end);
      // The day of their last minute: hours that end at midnight end that evening.
      const endsLater =
        formatDay(start, zone) !== formatDay(new Date(end.getTime() - 60_000), zone);
      return m.alerts_window({
        start: formatDayAndClock(start, zone),
        end: endsLater ? formatDayAndClock(end, zone) : formatClock(end, zone),
      });
    })
    .join(", ");
}

// What a notification says of one spot.
function lineOf(line: Line, moment: Moment, zone: string) {
  const before = hoursOf(line.before ?? [], zone);
  if (moment === "gone") return m.alerts_line({ spot: line.spotName, hours: before });
  const hours = hoursOf(line.open, zone);
  return moment === "moved"
    ? m.alerts_line_moved({ spot: line.spotName, hours, before })
    : m.alerts_line({ spot: line.spotName, hours });
}

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
  tab: AlertsTab;
  onTabChange: (tab: AlertsTab) => void;
  notifications: Loadable<AlertNotification[]>;
  alerts: Loadable<Alert[]>;
  spots: Spot[];
  settings: Loadable<AlertSettings>;
  deviceZone: string;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onRead: (notification: AlertNotification) => void;
  onOpenAlert: (alert: Alert) => void;
  switching: string[];
  onSwitchAlert: (alert: Alert, enabled: boolean) => void;
  onSettingsChange: (change: AlertSettingsChange) => void;
};

/** What the visitor's alerts told them, the alerts themselves, and how they want to be told. */
export function AlertsPanel({
  signedIn,
  tab,
  onTabChange,
  alerts,
  spots,
  settings,
  deviceZone,
  onSignIn,
  onCreateAccount,
  onOpenAlert,
  switching,
  onSwitchAlert,
  onSettingsChange,
  ...news
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

  return (
    <Tabs value={tab} onValueChange={(next) => onTabChange(next as AlertsTab)} className="gap-m">
      <TabsList>
        <TabsTab value="news">{m.alerts_tab_news()}</TabsTab>
        <TabsTab value="mine">{m.alerts_tab_mine()}</TabsTab>
        <TabsTab value="settings">{m.alerts_tab_settings()}</TabsTab>
      </TabsList>
      <TabsPanel value="news">
        <News {...news} />
      </TabsPanel>
      <TabsPanel value="mine">
        <MyAlerts
          alerts={alerts}
          spots={spots}
          onOpen={onOpenAlert}
          switching={switching}
          onSwitch={onSwitchAlert}
        />
      </TabsPanel>
      <TabsPanel value="settings">
        <AlertSettingsForm
          settings={settings}
          deviceZone={deviceZone}
          onChange={onSettingsChange}
        />
      </TabsPanel>
    </Tabs>
  );
}

/** What the alerts told, newest first. */
function News({
  now,
  notifications,
  onRead,
}: Pick<AlertsPanelProps, "now" | "notifications" | "onRead">) {
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
        const { moment, payload } = notification;
        const { label, icon: MomentIcon, quiet } = MOMENTS[moment];
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
              <MomentIcon
                aria-hidden
                className={cn("mt-0.5 size-4.5 shrink-0", quiet && "text-neutral-7")}
              />
              <span className="grid min-w-0 flex-1 gap-xxs">
                <span className={cn("truncate", unread && "font-medium")}>
                  {payload.alertName ?? m.alerts_evening_title()}
                </span>
                <span className="text-s text-neutral-7">{label()}</span>
                {payload.lines.map((line) => (
                  <span key={line.spotId} className="text-s">
                    {lineOf(line, moment, payload.zone)}
                  </span>
                ))}
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
