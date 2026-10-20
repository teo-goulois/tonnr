import type { SessionPlace } from "@repo/client/sessions/types";
import { daysBefore, isAhead } from "@repo/client/sessions/rules";
import { distanceKm } from "@repo/client/viewer/samples";

import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";

// The rules of a session's form in the app for phones that read no screen: how its day is said,
// its day and its hour each set by a picker of their own, when it began from its first photo,
// and where it most likely was. What the web's form holds too, its usual start and length and how
// far ahead it may be, is packages/client/src/sessions/rules.ts. Decision 043.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

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
  const daysAgo = daysBefore(day, now);
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
