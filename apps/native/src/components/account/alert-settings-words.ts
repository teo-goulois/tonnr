import { localTime, momentOf } from "@repo/conditions/alerts/clock";

import { m } from "@/paraglide/messages";

// What the step of the alerts' settings reads and writes, as the web's `AlertSettingsForm` does:
// the hours of a day, the notice before a window, the days ahead, a day the account is away
// until. Decision 031. A module that imports nothing of React Native, so that a test reads it.

export const DAY_MINUTES = 24 * 60;
/** The days an account may ask to be told ahead of. */
export const DAYS_AHEAD = [1, 2, 3, 4, 5] as const;
/** How long before a window begins "it is on" may be told, in minutes. */
export const NOTICES = [0, 30, 60, 120] as const;
/** A day the account can go, at any hour of it. */
export const ALL_DAY = [{ from: 0, to: DAY_MINUTES }];
/** A week the account can go at any hour of any day, which its own hours start from. */
export const allWeek = () => Array.from({ length: 7 }, () => [...ALL_DAY]);
/** The quiet hours an account is given when it asks for some: from ten at night to seven. */
export const FIRST_QUIET = { quietFrom: 22 * 60, quietTo: 7 * 60 };

export type Stretch = { from: number; to: number };

/** A time of day, written 24:00 at its end, as the hour it ends at: "07:30". */
export const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The days of the week by name, Monday first, in a language. */
export function weekdays(locale: string) {
  const format = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  // The first of January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, index) => {
    const name = format.format(Date.UTC(2024, 0, 1 + index));
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  });
}

/** A stretch of a day, as its row says it: "All day", or "06:00–21:00". */
export function stretchWords(stretch: Stretch) {
  return stretch.from === 0 && stretch.to === DAY_MINUTES
    ? m.alert_settings_all_day()
    : `${clock(stretch.from)}–${clock(stretch.to)}`;
}

/** What a day's hours say: not this day, its stretches, each as its row says it. */
export function dayWords(hours: readonly Stretch[]) {
  return hours.length === 0 ? m.alert_settings_day_off() : hours.map(stretchWords).join(", ");
}

/** The one stretch that holds every stretch a day was given, from the first to the last. */
export function oneStretch(hours: readonly Stretch[]): Stretch | undefined {
  const first = hours[0];
  const last = hours.at(-1);
  return first && last ? { from: first.from, to: last.to } : undefined;
}

/** The hours a day may begin at, and end at: whole hours, and an end after the beginning. */
export function hoursFrom(to: number) {
  return Array.from({ length: 24 }, (_, hour) => hour * 60).filter((minutes) => minutes < to);
}
export function hoursTo(from: number) {
  return Array.from({ length: 24 }, (_, hour) => (hour + 1) * 60).filter(
    (minutes) => minutes > from,
  );
}

/** A day's stretch, its beginning or its end moved. */
export function moved(stretch: Stretch, end: "from" | "to", minutes: number): Stretch {
  return end === "from" ? { ...stretch, from: minutes } : { ...stretch, to: minutes };
}

/** The week after one day's hours changed, the other days as they were. */
export function weekWith(
  week: readonly (readonly Stretch[])[] | null,
  day: number,
  hours: Stretch[],
): Stretch[][] {
  return Array.from({ length: 7 }, (_, other) =>
    other === day ? hours : [...(week?.[other] ?? [])],
  );
}

/** The notices offered: the four, and one set elsewhere that is none of them, in order. */
export function noticeChoices(kept: number) {
  return [...new Set<number>([...NOTICES, kept])].sort((a, b) => a - b);
}

/** A notice, as it is chosen: "At the start", "1 h before", "30 min before". */
export function noticeWords(minutes: number) {
  if (minutes === 0) return m.alert_settings_notice_none();
  return m.alert_settings_notice_before({
    notice:
      minutes % 60 === 0
        ? m.alert_hours({ count: minutes / 60 })
        : m.alert_settings_minutes({ count: minutes }),
  });
}

/** The day an account is away until, on its own calendar, "2026-10-24"; empty for none. */
export function awayDay(awayUntil: Date | null, zone: string) {
  return awayUntil ? localTime(awayUntil, zone).date : "";
}

/** The moment an account is away until, from a day of its calendar: that day's first minute. */
export const awayMoment = (day: string, zone: string) => momentOf(day, 0, zone);

/** A day of the calendar as a picker gives it, in the phone's own time: "2026-10-24". */
export function dayOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A day of the calendar as a picker shows it: noon of it, in the phone's own time. */
export function dateOfDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1, 12);
}

/** A time of day as a picker shows it: today at that time, in the phone's own time. */
export function dateOfMinutes(minutes: number) {
  const today = new Date();
  today.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return today;
}

/** The time of day a picker gave, in minutes since midnight. */
export const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
