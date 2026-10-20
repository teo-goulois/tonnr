import type { AlertNotification, ReportNotice } from "@repo/client/viewer/types";
import { momentOf } from "@repo/conditions/alerts/clock";

import { sizeName } from "@/components/profile/profile-words";
import {
  formatAgo,
  formatClock,
  formatDate,
  formatDay,
  formatDayAndClock,
  formatSeconds,
} from "@/lib/format";
import { formatDistance, formatHeight } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { bearingWords } from "./words";

// What the alerts told and the notices of reports, in words, and in the days they came on: what
// the web's `AlertsPanel` writes, for the list of the alerts' tab. Decisions 031 and 068.

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
 * What the nearest wave station measured as a window began, in a line, and whom its readings are
 * credited to: the whole sea where it stands, given for the reader to judge. Undefined when it
 * read no height.
 */
export function buoyWords(line: Line, zone: string) {
  const buoy = line.buoy;
  if (!buoy || buoy.significantHeightMeters === null) return undefined;
  return {
    said: [
      `${m.alerts_station({ name: buoy.name, distance: formatDistance(buoy.distanceKm) })} ${formatHeight(buoy.significantHeightMeters)}`,
      ...(buoy.peakPeriodSeconds === null ? [] : [formatSeconds(buoy.peakPeriodSeconds)]),
      ...(buoy.peakDirectionDegrees === null ? [] : [bearingWords(buoy.peakDirectionDegrees)]),
      formatDayAndClock(new Date(buoy.observedAt), zone),
    ].join(" · "),
    credit: buoy.attribution
      ? m.alerts_station_credit({ attribution: buoy.attribution })
      : undefined,
  };
}

/**
 * The place a notification opens, as its push does: the one it speaks of, and none when it
 * speaks of several, whose list is where it stands. Decision 031, "Push".
 */
export function placeOf(notification: AlertNotification) {
  const [line, other] = notification.payload.lines;
  if (!line || other) return undefined;
  return line.breakId
    ? ({ kind: "break", id: line.breakId } as const)
    : ({ kind: "spot", id: line.spotId } as const);
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

/** How long ago something was told: "just now" in its first minute. */
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

// A day of the phone's calendar, which what was told is grouped by.
const dayKey = (at: number) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** What was told, in the days it came on, the newest first, each named as a list names it. */
export function byDay(told: Told[], now: number) {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now).setDate(new Date(now).getDate() - 1));
  const days: { key: string; title: string; data: Told[] }[] = [];
  for (const one of told) {
    const key = dayKey(one.at);
    const day = days.at(-1);
    if (day?.key === key) {
      day.data.push(one);
      continue;
    }
    days.push({
      key,
      title:
        key === today
          ? m.session_day_today()
          : key === yesterday
            ? m.session_day_yesterday()
            : formatDate(new Date(one.at), now),
      data: [one],
    });
  }
  return days;
}

/** Whether something told is read. */
export function isRead(one: Told) {
  return (one.kind === "notification" ? one.notification.readAt : one.notice.readAt) !== null;
}
