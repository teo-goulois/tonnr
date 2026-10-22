import type { AlertNotification, ReportNotice } from "@repo/client/viewer/types";
import { momentOf } from "@repo/conditions/alerts/clock";

import { sizeName } from "@/components/profile/profile-words";
import {
  compassName,
  formatAgo,
  formatClock,
  formatDay,
  formatDayAndClock,
  formatSeconds,
} from "@/lib/format";
import { formatDistance, formatHeight } from "@/lib/units";
import { m } from "@/paraglide/messages";

// What the alerts told and the notices of reports, in words: what the web's `AlertsPanel` writes,
// for the list of the alerts' tab. Decisions 031 and 068.

export type Moment = AlertNotification["moment"];
type Line = AlertNotification["payload"]["lines"][number];

/** What each moment of an alert is called: decision 031, "The moments". */
export const MOMENT_WORDS: Record<Moment, () => string> = {
  found: m.alerts_moment_found,
  moved: m.alerts_moment_moved,
  gone: m.alerts_moment_gone,
  evening: m.alerts_moment_evening,
  begins: m.alerts_moment_begins,
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

/** What a notification says of one place. */
export function lineWords(line: Line, moment: Moment, zone: string) {
  const before = hoursOf(line.before ?? [], zone);
  if (moment === "gone") return m.alerts_line({ spot: line.spotName, hours: before });
  const hours = hoursOf(line.open, zone);
  return moment === "moved"
    ? m.alerts_line_moved({ spot: line.spotName, hours, before })
    : m.alerts_line({ spot: line.spotName, hours });
}

/** A notification's title: its alert's name, or the day the evening before lists. */
export function notificationTitle(notification: AlertNotification) {
  const { payload } = notification;
  if (payload.alertName !== null) return payload.alertName;
  return m.alerts_evening_title({
    day: payload.day ? formatDay(momentOf(payload.day, 12 * 60, payload.zone), payload.zone) : "",
  });
}

/**
 * What the nearest wave station measured as a window began, and whom its readings are credited
 * to: the whole sea where it stands, given for the reader to judge. The row draws the direction
 * as an arrow and its point between the period and the hour, as the web's `Bearing`; a screen
 * reader hears it named in full. Undefined when it read no height.
 */
export function buoyWords(line: Line, zone: string) {
  const buoy = line.buoy;
  if (!buoy || buoy.significantHeightMeters === null) return undefined;
  const measured = `${m.alerts_station({ name: buoy.name, distance: formatDistance(buoy.distanceKm) })} ${formatHeight(buoy.significantHeightMeters)}`;
  const period =
    buoy.peakPeriodSeconds === null ? undefined : formatSeconds(buoy.peakPeriodSeconds);
  const direction = buoy.peakDirectionDegrees ?? undefined;
  const at = formatDayAndClock(new Date(buoy.observedAt), zone);
  return {
    measured,
    period,
    direction,
    at,
    spoken: [measured, period, direction === undefined ? undefined : compassName(direction), at]
      .filter(Boolean)
      .join(", "),
    credit: buoy.attribution
      ? m.alerts_station_credit({ attribution: buoy.attribution })
      : undefined,
  };
}

/** What a notice of reports says: how many reports at its break, and the newest still shown. */
export function noticeWords(notice: ReportNotice) {
  // The reports still shown, or all those it told once none is.
  const count = notice.shown > 0 ? notice.shown : notice.told;
  const title =
    count > 1
      ? m.notice_title_many({ count, name: notice.breakName })
      : m.notice_title_one({ name: notice.breakName });
  const { latest } = notice;
  const said = latest
    ? [
        latest.author ?? m.report_someone(),
        latest.waveSize ? sizeName(latest.waveSize) : null,
        latest.note,
      ]
        .filter(Boolean)
        .join(" · ")
    : notice.state === "past"
      ? m.notice_past()
      : m.notice_removed();
  return { title, said };
}

/** How long ago a notice of reports was told: "just now" in its first minute, as the web's. */
export function agoWords(at: Date, now: number) {
  return now - at.getTime() < 60_000 ? m.report_just_now() : formatAgo(at, now);
}

/** One thing told: a notification of an alert, or a notice of reports. */
export type Told =
  | { kind: "notification"; at: number; notification: AlertNotification }
  | { kind: "notice"; at: number; notice: ReportNotice };

/** What was told, the newest first, both kinds together. */
export function toldOf(notifications: AlertNotification[], notices: ReportNotice[]): Told[] {
  return [
    ...notifications.map((notification): Told => ({
      kind: "notification",
      at: notification.createdAt.getTime(),
      notification,
    })),
    ...notices.map((notice): Told => ({ kind: "notice", at: notice.updatedAt.getTime(), notice })),
  ].sort((a, b) => b.at - a.at);
}
