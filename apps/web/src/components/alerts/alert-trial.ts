import { formatClock, formatDay, formatDayAndClock } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import type { AlertPreview } from "../viewer/types";
import type { CriterionKey } from "./alert-words";

const HOUR_MS = 60 * 60 * 1000;

type Tried = AlertPreview["spots"][number];
type Stretch = { start: Date; end: Date };

/** The hours of a spot's forecast from this one on: the forecast begins with the day. */
export function hoursAhead(tried: Tried | undefined, now: number) {
  return (tried?.hours ?? []).filter((hour) => hour.time.getTime() > now - HOUR_MS);
}

/** The windows an account can use at the spots that were tried, the soonest first. */
export function openPieces(tried: Tried[], now: number) {
  return tried
    .flatMap((one) => one.open.map((piece) => ({ ...piece, spotId: one.spotId, hours: one.hours })))
    .filter((piece) => piece.end.getTime() > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Whether the sea is there at a spot, ahead, in a window the account has no use for. */
export function hasSeaAhead(tried: Tried[], now: number) {
  return tried.some((one) => one.windows.some((sea) => sea.end.getTime() > now));
}

/**
 * For each condition, the hours that it alone rules out, the most first: what to loosen first.
 * An hour that two conditions rule out is neither's alone.
 */
export function heldBack(hours: { unmet: CriterionKey[] }[]) {
  const alone = new Map<CriterionKey, number>();
  for (const hour of hours) {
    const [only, ...others] = hour.unmet;
    if (only && others.length === 0) alone.set(only, (alone.get(only) ?? 0) + 1);
  }
  return [...alone.entries()].sort((a, b) => b[1] - a[1]);
}

/** A stretch of hours in words, in a time zone: "Mon 08:00 to 12:00". */
export function stretchWords(piece: Stretch, zone: string | undefined) {
  // The day of its last minute: hours that end at midnight end that evening.
  const endsLater =
    formatDay(piece.start, zone) !== formatDay(new Date(piece.end.getTime() - 60_000), zone);
  return m.alerts_window({
    start: formatDayAndClock(piece.start, zone),
    end: endsLater ? formatDayAndClock(piece.end, zone) : formatClock(piece.end, zone),
  });
}
