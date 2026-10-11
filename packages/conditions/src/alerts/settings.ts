import type { alertSettings } from "@repo/db/schema/alerts";

import type { QuietHours } from "./moments";
import type { Availability } from "./open";

type Row = typeof alertSettings.$inferSelect;

/** How an account wants to be told, as its row says or, without one, as the defaults do. */
export type AlertSettings = Omit<Row, "userId" | "updatedAt" | "eveningUntil" | "mailTokenHash">;

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
    mailTokenHash: _hash,
    ...settings
  } = row;
  return settings;
}

/** The time zone an account's days and hours are read in: its own, or UTC until it is known. */
export const zoneOf = (settings: AlertSettings) => settings.zone ?? "UTC";

/** When the account can go. */
export function availabilityOf(settings: AlertSettings): Availability {
  return {
    zone: zoneOf(settings),
    daylightOnly: settings.daylightOnly,
    week: settings.week,
    awayUntil: settings.awayUntil,
  };
}

/**
 * What cuts the open hours of an alert's windows, as one string: two that differ are two ways
 * of cutting them. A look keeps the one it read, and knows by it that the hours it finds were
 * moved by a setting and not by the sea.
 */
export function cutOf(settings: AlertSettings, shortestMinutes: number) {
  const { zone, daylightOnly, week, awayUntil } = availabilityOf(settings);
  return JSON.stringify([
    zone,
    daylightOnly,
    week?.map((day) => day.map(({ from, to }) => [from, to])) ?? null,
    awayUntil?.getTime() ?? null,
    shortestMinutes,
  ]);
}

/** The hours in which the account is sent nothing. Null when it set none. */
export function quietHoursOf(settings: AlertSettings): QuietHours | null {
  if (settings.quietFrom === null || settings.quietTo === null) return null;
  return { zone: zoneOf(settings), from: settings.quietFrom, to: settings.quietTo };
}
