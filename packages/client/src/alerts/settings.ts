import type { AlertSettings } from "../viewer/types";

// What the settings of an account's alerts offer, the same on a page and on a phone: how far
// ahead it may be told, the notices before a window, a day at any hour, the quiet hours it is
// first given, and how an hour of them is written. Each app draws them its own way. Decision 031.

/** What a control of the settings changes: one setting, as the API takes it. */
export type AlertSettingsChange = Partial<
  Pick<
    AlertSettings,
    | "onFound"
    | "onChange"
    | "onEvening"
    | "eveningMinutes"
    | "onBegin"
    | "onReports"
    | "noticeMinutes"
    | "quietFrom"
    | "quietTo"
    | "namesInSubject"
    | "horizonDays"
    | "daylightOnly"
    | "week"
    | "awayUntil"
  > & { zone: string; byMail: boolean }
>;

export const DAY_MINUTES = 24 * 60;
/** The days an account may ask to be told ahead of. */
export const DAYS_AHEAD = [1, 2, 3, 4, 5] as const;
/** How long before a window begins "it is on" may be told, in minutes. */
export const NOTICES = [0, 30, 60, 120] as const;
/** A day the account can go, at any hour of it. */
export const ALL_DAY = [{ from: 0, to: DAY_MINUTES }];
/** The quiet hours an account is given when it asks for some: from ten at night to seven. */
export const FIRST_QUIET = { quietFrom: 22 * 60, quietTo: 7 * 60 };

/** A time of day, written 24:00 at its end, as the hour it ends at: "07:30". */
export const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The days of the week by name, Monday first, in a language, as it writes them: "lundi". */
export function weekdayNames(locale: string) {
  const format = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  // The first of January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, index) => format.format(Date.UTC(2024, 0, 1 + index)));
}

/** The notices offered: the four, and one set elsewhere that is none of them, in order. */
export function noticeChoices(kept: number) {
  return [...new Set<number>([...NOTICES, kept])].sort((a, b) => a - b);
}
