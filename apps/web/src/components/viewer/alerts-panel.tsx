import { momentOf } from "@repo/conditions/alerts/clock";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import {
  CameraIcon,
  CircleCheckIcon,
  ClockIcon,
  type IconProps,
  MoonIcon,
  OctagonXIcon,
  WaveIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentType } from "react";

import { formatAgo, formatClock, formatDay, formatDayAndClock, formatSeconds } from "@/lib/format";
import { formatDistance, formatHeight, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { MyAlerts } from "../alerts/my-alerts";
import { sizesWords } from "../sessions/surf-size";
import { Bearing } from "./bearing";
import { AccountPrompt } from "./saved-panel";
import type { Alert, AlertNotification, Loadable, ReportNotice } from "./types";

/**
 * The parts of the alerts panel: what was told, and the alerts. How to be told is a setting of
 * the account, in its own panel: decision 040.
 */
export type AlertsTab = "news" | "mine";

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
  // What the account was told of the reports at the breaks it keeps, and what opens one: the
  // break, on its reports. Decision 068.
  notices: Loadable<ReportNotice[]>;
  onOpenNotice: (notice: ReportNotice) => void;
  alerts: Loadable<Alert[]>;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onRead: (notification: AlertNotification) => void;
  onOpenAlert: (alert: Alert) => void;
  switching: string[];
  onSwitchAlert: (alert: Alert, enabled: boolean) => void;
};

/** What the visitor's alerts told them, and the alerts themselves. */
export function AlertsPanel({
  signedIn,
  tab,
  onTabChange,
  alerts,
  onSignIn,
  onCreateAccount,
  onOpenAlert,
  switching,
  onSwitchAlert,
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
      </TabsList>
      <TabsPanel value="news">
        <News {...news} />
      </TabsPanel>
      <TabsPanel value="mine">
        <MyAlerts
          alerts={alerts}
          onOpen={onOpenAlert}
          switching={switching}
          onSwitch={onSwitchAlert}
        />
      </TabsPanel>
    </Tabs>
  );
}

/**
 * A notice of reports: the break, how many reports, and the newest one still shown, with its
 * first photo. Pressed, it opens the break on its reports, whether it was read or not.
 */
export function NoticeRow({
  notice,
  now,
  onOpen,
}: {
  notice: ReportNotice;
  now: number;
  onOpen: (notice: ReportNotice) => void;
}) {
  const unread = notice.readAt === null;
  // The reports still shown, or all those it told once none is.
  const count = notice.shown > 0 ? notice.shown : notice.told;
  const title =
    count > 1
      ? m.notice_title_many({ count, name: notice.breakName })
      : m.notice_title_one({ name: notice.breakName });
  const { latest } = notice;
  const said = latest
    ? [latest.author ?? m.report_someone(), sizesWords(latest.waveSize, null), latest.note]
        .filter(Boolean)
        .join(" · ")
    : notice.state === "past"
      ? m.notice_past()
      : m.notice_removed();
  return (
    <li>
      <button
        type="button"
        className={cn(
          rowLayout,
          "focus-ring cursor-pointer text-left outline-none hover:bg-neutral-3-transparent",
        )}
        onClick={() => onOpen(notice)}
      >
        <CameraIcon aria-hidden className="mt-0.5 size-4.5 shrink-0" />
        <span className="grid min-w-0 flex-1 gap-xxs">
          <span className={cn("truncate", unread && "font-medium")}>{title}</span>
          <span className="text-s text-neutral-7">{m.notice_label()}</span>
          <span className={cn("line-clamp-2 text-s", !latest && "text-neutral-7")}>{said}</span>
          <span className="text-xs text-neutral-7">{formatAgo(notice.updatedAt, now)}</span>
        </span>
        {latest?.thumb && (
          <img
            src={latest.thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-12 shrink-0 rounded-(--radius-xs) bg-neutral-3 object-cover"
          />
        )}
        {unread && (
          <span className="mt-2 size-2 shrink-0 rounded-full bg-color-1">
            <span className="sr-only">{m.alerts_unread()}</span>
          </span>
        )}
      </button>
    </li>
  );
}

/** What the alerts told, and the notices of reports, newest first. */
function News({
  now,
  notifications,
  notices,
  onRead,
  onOpenNotice,
}: Pick<AlertsPanelProps, "now" | "notifications" | "notices" | "onRead" | "onOpenNotice">) {
  // A buoy's height and its distance are written in the reader's units.
  useUnits();
  if (notifications.isPending || notices.isPending) {
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
  // The notices are said when they come: what cannot be loaded of them leaves the alerts.
  const told = [
    ...(notifications.data ?? []).map((notification) => ({
      at: notification.createdAt.getTime(),
      notification,
    })),
    ...(notices.data ?? []).map((notice) => ({ at: notice.updatedAt.getTime(), notice })),
  ].sort((a, b) => b.at - a.at);
  if (told.length === 0) {
    return <p className="text-neutral-7">{m.alerts_empty()}</p>;
  }

  return (
    <ul className="-mx-xs grid gap-xxs">
      {told.map((one) => {
        if ("notice" in one) {
          return (
            <NoticeRow key={one.notice.id} notice={one.notice} now={now} onOpen={onOpenNotice} />
          );
        }
        const { notification } = one;
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
                  {payload.alertName ??
                    // The evening before lists a day, for every alert: it is named by that day.
                    m.alerts_evening_title({
                      day: payload.day
                        ? formatDay(momentOf(payload.day, 12 * 60, payload.zone), payload.zone)
                        : "",
                    })}
                </span>
                <span className="text-s text-neutral-7">{label()}</span>
                {payload.lines.map((line) => (
                  <span key={line.spotId} className="grid gap-xxs text-s">
                    <span>
                      {/* The evening lists every alert: a line says whose it is, when its
                          alert is not named after its spot. */}
                      {line.alertName && line.alertName !== line.spotName && (
                        <span className="text-neutral-7">{line.alertName} · </span>
                      )}
                      {lineOf(line, moment, payload.zone)}
                    </span>
                    {/* What the nearest wave station measured as the window began: the whole
                        sea where it stands, given for the reader to judge. */}
                    {line.buoy && line.buoy.significantHeightMeters !== null && (
                      <span className="flex flex-wrap items-center gap-x-xxs text-neutral-7">
                        {m.alerts_station({
                          name: line.buoy.name,
                          distance: formatDistance(line.buoy.distanceKm),
                        })}{" "}
                        {formatHeight(line.buoy.significantHeightMeters)}
                        {line.buoy.peakPeriodSeconds !== null &&
                          ` · ${formatSeconds(line.buoy.peakPeriodSeconds)}`}
                        {line.buoy.peakDirectionDegrees !== null && (
                          <>
                            {" · "}
                            <Bearing degrees={line.buoy.peakDirectionDegrees} />
                          </>
                        )}
                        {" · "}
                        {formatDayAndClock(new Date(line.buoy.observedAt), payload.zone)}
                      </span>
                    )}
                    {line.buoy?.attribution && line.buoy.significantHeightMeters !== null && (
                      <span className="text-xs text-neutral-7">
                        {m.alerts_station_credit({ attribution: line.buoy.attribution })}
                      </span>
                    )}
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
