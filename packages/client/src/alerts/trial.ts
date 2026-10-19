import { findWindows, unmetCriteria } from "@repo/conditions/spots/criteria";

import type { AlertCriteria, AlertPreview } from "../viewer/types";
import type { CriterionKey } from "./alert-words";

// What an alert's editor reads of the preview while it is written, the same on a page and on a
// phone: the API is asked once for the places, with no condition, and the editor judges each
// change itself, by the rules the worker judges by. Decision 031, "The editor".

const HOUR_MS = 60 * 60 * 1000;

type Tried = AlertPreview["spots"][number];
type Stretch = { start: Date; end: Date };

/**
 * What conditions give at a place, judged here, as the API would judge them: the preview was
 * asked with no condition and windows of an hour, so its open hours are every hour the account
 * can use, and its hours carry every figure. The editor judges each change at once, by the rules
 * the worker judges by, and asks the API nothing more.
 */
export function judgeTried(tried: Tried, criteria: AlertCriteria, shortestMinutes: number): Tried {
  if (!tried.hasSea) return tried;
  const usable = (time: Date) =>
    tried.open.some((piece) => piece.start <= time && time < piece.end);
  const hours = tried.hours.map((hour) => ({ ...hour, unmet: unmetCriteria(hour, criteria) }));
  const windows = findWindows(hours);
  // The hours of each window the account can use, in runs as long as the shortest at least.
  const open: Stretch[] = [];
  for (const sea of windows) {
    let run: Date | null = null;
    let last: Date | null = null;
    const close = () => {
      if (run && last && last.getTime() + HOUR_MS - run.getTime() >= shortestMinutes * 60_000) {
        open.push({ start: run, end: new Date(last.getTime() + HOUR_MS) });
      }
      run = null;
    };
    for (let at = sea.start.getTime(); at < sea.end.getTime(); at += HOUR_MS) {
      const time = new Date(at);
      if (usable(time)) {
        run ??= time;
        last = time;
      } else close();
    }
    close();
  }
  return { ...tried, hours, windows, open };
}

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
