import type { alertSettings } from "@repo/db/schema/alerts";

import { localTime } from "./clock";
import { type QuietHours, dayOf } from "./moments";
import type { Availability } from "./open";

type Row = typeof alertSettings.$inferSelect;

/** How an account wants to be told, as its row says or, without one, as the defaults do. */
export type AlertSettings = Omit<
  Row,
  "userId" | "updatedAt" | "eveningUntil" | "mailKey" | "mailTokenHash"
>;

/**
 * The most days ahead an account may ask to be told of. The forecast reaches seven days, counted
 * from the UTC day: five days after an account's today end within them in every time zone.
 */
export const MAX_HORIZON_DAYS = 5;

/** What an account that never set anything gets: decision 031, "The settings of an account". */
export const DEFAULT_SETTINGS: AlertSettings = {
  horizonDays: 3,
  zone: null,
  locale: null,
  onFound: true,
  onEvening: true,
  eveningMinutes: 19 * 60,
  onChange: true,
  onBegin: true,
  onReports: true,
  noticeMinutes: 0,
  daylightOnly: true,
  week: null,
  awayUntil: null,
  quietFrom: 22 * 60,
  quietTo: 7 * 60,
  byMail: null,
  namesInSubject: true,
  byPush: false,
};

/** An account's settings, from its row when it has one. */
export function settingsOf(row: Row | undefined): AlertSettings {
  if (!row) return DEFAULT_SETTINGS;
  const {
    userId: _userId,
    updatedAt: _updatedAt,
    eveningUntil: _until,
    mailKey: _key,
    mailTokenHash: _hash,
    ...settings
  } = row;
  return settings;
}

/** The time zone an account's days and hours are read in: its own, or UTC until it is known. */
export const zoneOf = (settings: AlertSettings) => settings.zone ?? "UTC";

/** What of an alert pauses it: "Not today", until the end of the day it was said on. */
export type Paused = { awayUntil: Date | null };

/**
 * When the account can go, for one of its alerts: no hour is open before the later of the
 * account's own `awayUntil` and the alert's, which its owner set by "Not today" (decision 072).
 */
export function pausedBy(availability: Availability, alert: Paused): Availability {
  const { awayUntil } = alert;
  if (!awayUntil || (availability.awayUntil && availability.awayUntil >= awayUntil)) {
    return availability;
  }
  return { ...availability, awayUntil };
}

/** When the account can go, and for one of its alerts when it is given. */
export function availabilityOf(settings: AlertSettings, alert?: Paused): Availability {
  const availability = {
    zone: zoneOf(settings),
    daylightOnly: settings.daylightOnly,
    week: settings.week,
    awayUntil: settings.awayUntil,
  };
  return alert ? pausedBy(availability, alert) : availability;
}

/**
 * What cuts the open hours of an alert's windows, as one string: two that differ are two ways
 * of cutting them. A look keeps the one it read, and knows by it that the hours it finds were
 * moved by a setting, or by a pause of the alert, and not by the sea.
 */
export function cutOf(settings: AlertSettings, alert: Paused & { shortestMinutes: number }) {
  const { zone, daylightOnly, week, awayUntil } = availabilityOf(settings, alert);
  return JSON.stringify([
    zone,
    daylightOnly,
    week?.map((day) => day.map(({ from, to }) => [from, to])) ?? null,
    awayUntil?.getTime() ?? null,
    alert.shortestMinutes,
  ]);
}

/**
 * Until when "Not today" pauses an alert: the end of the account's day as it is at `now`, on its
 * own calendar and clock. Decision 072.
 */
export function endOfToday(now: Date, settings: AlertSettings) {
  const zone = zoneOf(settings);
  return dayOf(localTime(now, zone).date, zone).end;
}

/** The hours in which the account is sent nothing. Null when it set none. */
export function quietHoursOf(settings: AlertSettings): QuietHours | null {
  if (settings.quietFrom === null || settings.quietTo === null) return null;
  return { zone: zoneOf(settings), from: settings.quietFrom, to: settings.quietTo };
}
