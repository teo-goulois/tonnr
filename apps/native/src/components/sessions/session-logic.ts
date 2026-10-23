import type { SessionDraft, SessionPlace, Upload } from "@repo/client/sessions/types";
import { daysBefore, isAhead } from "@repo/client/sessions/rules";
import type { Session } from "@repo/client/viewer/types";
import { distanceKm } from "@repo/client/viewer/samples";

import type { MediaEntry } from "@/components/media/media-strip";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";

// The rules of a session's form in the app for phones that read no screen: how its day is said,
// its day and its hour each set by a picker of their own, when a start is refused, the photos and
// the videos it is saved with, what of it differs from the session it changes, and where it most
// likely was. What the web's form holds too, its usual start and length and how far ahead it may
// be, is packages/client/src/sessions/rules.ts. Decision 043.

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

/** Why a start is not one a session may have, as the web's form says it, or nothing. */
export function startFault(start: Date, now: number) {
  return isAhead(start, now) ? m.session_when_ahead() : undefined;
}

/** The ids a session is saved with: what it keeps, and each file sent that the API gave one. */
export function mediaIdsOf(entries: readonly MediaEntry[], uploads: ReadonlyMap<string, Upload>) {
  return entries.flatMap((entry) => {
    if ("kept" in entry) return [entry.kept];
    const upload = uploads.get(entry.upload);
    return upload?.id && upload.state !== "failed" ? [upload.id] : [];
  });
}

/** Whether a file is still waiting for its id from the API: a moment, before the form is sent. */
export function isAskingOf(entries: readonly MediaEntry[], uploads: ReadonlyMap<string, Upload>) {
  return entries.some((entry) => {
    if ("kept" in entry) return false;
    const upload = uploads.get(entry.upload);
    return upload?.state === "sending" && upload.id === null;
  });
}

/** What a session's form compares itself with: the session it changes, or what a new one opened with. */
export type SessionBase = Pick<
  Session,
  "startedAt" | "durationMinutes" | "rating" | "note" | "waveSize" | "setSize"
>;

/**
 * What of a session as it is written differs from `base`, as the web's form says it to the API:
 * the photos and the videos when their ids or their order changed, and each other part that is
 * not what `base` holds. `keptIds` are the ones `base` keeps.
 */
export function sessionChanges(
  base: SessionBase,
  draft: SessionDraft,
  keptIds: readonly string[],
): Partial<SessionDraft> {
  return {
    ...(draft.mediaIds.join() !== keptIds.join() && { mediaIds: draft.mediaIds }),
    ...(draft.startedAt.getTime() !== base.startedAt.getTime() && { startedAt: draft.startedAt }),
    ...(draft.durationMinutes !== base.durationMinutes && {
      durationMinutes: draft.durationMinutes,
    }),
    ...(draft.rating !== (base.rating ?? null) && { rating: draft.rating }),
    ...(draft.note !== (base.note ?? "") && { note: draft.note }),
    ...(draft.waveSize !== (base.waveSize ?? null) && { waveSize: draft.waveSize }),
    ...(draft.setSize !== (base.setSize ?? null) && { setSize: draft.setSize }),
  };
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
