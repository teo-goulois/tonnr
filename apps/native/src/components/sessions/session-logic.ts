import type { SessionPlace } from "@repo/client/sessions/types";
import type { Session } from "@repo/client/viewer/types";

import { formatDate, formatMonth } from "@/lib/format";
import { m } from "@/paraglide/messages";

// The rules of a session's form that read no screen: when a session written now began, how its
// day is said, how long it may last, and where it most likely was. The web's `session-form.tsx`
// and `duration-input.tsx` hold the same. Decision 043.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** A session is written once it has begun: a clock that runs a little ahead is forgiven. */
export const AHEAD_MS = 15 * MINUTE_MS;

/** How long a session is taken to last until its surfer says. */
export const USUAL_MINUTES = 90;
/** What a session's length is chosen among at a press. */
export const USUAL_LENGTHS = [30, 60, USUAL_MINUTES, 120, 180] as const;
/** A length of one's own: from a quarter of an hour to eight hours, five minutes at a time. */
export const LEAST_MINUTES = 15;
export const MOST_MINUTES = 480;
export const STEP_MINUTES = 5;

/** A length of one's own, kept within what is taken. */
export const withinLengths = (minutes: number) =>
  Math.min(
    MOST_MINUTES,
    Math.max(LEAST_MINUTES, Math.round(minutes / STEP_MINUTES) * STEP_MINUTES),
  );

/**
 * When a session that is written now is taken to have begun: as long ago as it usually lasts,
 * on a round five minutes. It is nearly always written on the way out of the water.
 */
export function usualStart(now: number) {
  const step = 5 * MINUTE_MS;
  return new Date(Math.floor((now - USUAL_MINUTES * MINUTE_MS) / step) * step);
}

/** Whether a session would begin later than it may be written. */
export const isAhead = (startedAt: Date, now: number) => startedAt.getTime() > now + AHEAD_MS;

/** A moment on the round five minutes before it, as a session's start is said. */
export function onFiveMinutes(moment: Date) {
  const step = 5 * MINUTE_MS;
  return new Date(Math.floor(moment.getTime() / step) * step);
}

/** The day of `day` at the hour of `clock`, on the phone's clock. */
export function withDay(clock: Date, day: Date) {
  const next = new Date(clock);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return next;
}

/** The hour of `clock` on the day of `day`, on the phone's clock. */
export function withClock(day: Date, clock: Date) {
  const next = new Date(day);
  next.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
  return next;
}

/** A day as it is said beside its hour: today, yesterday, or its date. */
export function dayWords(day: Date, now: number) {
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round(
    (midnight(new Date(now)).getTime() - midnight(day).getTime()) / DAY_MS,
  );
  if (daysAgo === 0) return m.session_day_today();
  if (daysAgo === 1) return m.session_day_yesterday();
  return formatDate(day, now);
}

/**
 * When a new session began, from its first photo: the moment the photo was taken, on a round five
 * minutes before and never ahead of now, when the photo is of the last ten years. A photo is taken during
 * a session, rarely at its very start: it is the best the phone knows.
 */
export function startFromPhoto(taken: Date | null, now: number) {
  if (!taken) return null;
  const at = onFiveMinutes(taken);
  if (isAhead(at, now)) return null;
  if (now - at.getTime() > 10 * 365 * DAY_MS) return null;
  return at;
}

type Point = { latitude: number; longitude: number };

/** How far two points are, in kilometres, on the earth's mean radius. */
export function distanceKm(from: Point, to: Point) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLatitude = radians(to.latitude - from.latitude);
  const dLongitude = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLongitude / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** How near the phone must stand to a place for a new session to be taken to be there. */
export const NEAR_KM = 20;

/**
 * The place nearest the phone among those offered, the account's spots and the breaks it looked
 * at last, when one is within `NEAR_KM`: a session written on the beach is at the break in view.
 * None when the phone is further from all of them, or does not say where it is.
 */
export function nearestPlace<Place extends Point>(
  places: readonly Place[],
  phone: Point | null,
): Place | null {
  if (!phone) return null;
  let nearest: { place: Place; km: number } | null = null;
  for (const place of places) {
    const km = distanceKm(phone, place);
    if (km <= NEAR_KM && (nearest === null || km < nearest.km)) nearest = { place, km };
  }
  return nearest?.place ?? null;
}

/** The place a route names, or null when it names none a session can be at. */
export function placeOfParam(param: string | undefined): Pick<SessionPlace, "kind" | "id"> | null {
  const at = param?.indexOf(":") ?? -1;
  if (!param || at < 0) return null;
  const kind = param.slice(0, at);
  const id = param.slice(at + 1);
  if ((kind === "break" || kind === "spot") && id) return { kind, id };
  return null;
}

/** A place as a route names it. */
export const placeParam = (place: Pick<SessionPlace, "kind" | "id">) => `${place.kind}:${place.id}`;

/** The sessions of a month, the latest first, as the list gives them. */
export type Month = { name: string; sessions: Session[] };

/** The sessions month by month, the latest month first, from a list the latest first. */
export function byMonth(sessions: readonly Session[]): Month[] {
  const months: Month[] = [];
  for (const session of sessions) {
    const name = formatMonth(session.startedAt);
    const last = months.at(-1);
    if (last?.name === name) last.sessions.push(session);
    else months.push({ name, sessions: [session] });
  }
  return months;
}
