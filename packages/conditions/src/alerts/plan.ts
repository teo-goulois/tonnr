const HOUR_MS = 60 * 60 * 1000;

// A shorter window is not worth a notification.
export const MIN_WINDOW_HOURS = 2;
// A forecast wobbles between two runs, so a window is only called off once it stays away.
export const CANCEL_AFTER_MISSED_RUNS = 2;

type Window = { start: Date; end: Date };

type Announced = {
  kind: "window_found" | "window_cancelled";
  day: string;
  windowStart: Date;
  windowEnd: Date;
  missedRuns: number;
};

/** The UTC day a moment falls on, as "2026-10-08". */
export function dayOf(time: Date) {
  return time.toISOString().slice(0, 10);
}

function duration(window: Window) {
  return window.end.getTime() - window.start.getTime();
}

function overlaps(announced: Announced, window: Window) {
  return window.start <= announced.windowEnd && window.end >= announced.windowStart;
}

/**
 * Decides what to tell a spot's owner after an evaluation. `existing` holds the spot's
 * notifications whose window has not passed, or whose day is today or later.
 *
 * A day gets one "window found" notification, for its longest window of at least two hours.
 * A window that overlaps an announced one is the same window, even when it started on an earlier
 * day: its notification is kept up to date and the owner is not told again. When an announced
 * window is missing from two evaluations in a row and has not passed yet, the owner gets one
 * "window cancelled" notification.
 */
export function planNotifications(now: Date, windows: Window[], existing: Announced[]) {
  const windowOfDay = new Map<string, Window>();
  for (const window of windows) {
    if (window.end <= now || duration(window) < MIN_WINDOW_HOURS * HOUR_MS) continue;
    const day = dayOf(window.start);
    const longest = windowOfDay.get(day);
    if (!longest || duration(window) > duration(longest)) windowOfDay.set(day, window);
  }

  const found = existing.filter((notification) => notification.kind === "window_found");
  const cancelledDays = new Set(
    existing
      .filter((notification) => notification.kind === "window_cancelled")
      .map((notification) => notification.day),
  );

  const create: { kind: Announced["kind"]; day: string; windowStart: Date; windowEnd: Date }[] = [];
  const update: { day: string; windowStart: Date; windowEnd: Date; missedRuns: number }[] = [];
  const stillThere = new Set<Announced>();

  for (const [day, window] of windowOfDay) {
    const continued = found.find((announced) => overlaps(announced, window));
    const announced = continued ?? found.find((candidate) => candidate.day === day);
    if (!announced) {
      create.push({ kind: "window_found", day, windowStart: window.start, windowEnd: window.end });
      continue;
    }
    // A day's second window never replaces the one already matched to its announcement.
    if (stillThere.has(announced)) continue;

    stillThere.add(announced);
    update.push({
      day: announced.day,
      // A window already under way keeps the start it was announced with: the forecast no
      // longer covers its first hours. One still ahead follows the forecast.
      windowStart: continued && announced.windowStart <= now ? announced.windowStart : window.start,
      windowEnd: window.end,
      missedRuns: 0,
    });
  }

  for (const announced of found) {
    const stillAhead = announced.windowEnd > now;
    if (stillThere.has(announced) || !stillAhead || cancelledDays.has(announced.day)) continue;

    const missedRuns = announced.missedRuns + 1;
    const window = { windowStart: announced.windowStart, windowEnd: announced.windowEnd };
    update.push({ day: announced.day, ...window, missedRuns });
    if (missedRuns >= CANCEL_AFTER_MISSED_RUNS) {
      create.push({ kind: "window_cancelled", day: announced.day, ...window });
    }
  }

  return { create, update };
}
