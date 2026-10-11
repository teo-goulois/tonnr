import type { Interval } from "./open";

const HOUR_MS = 60 * 60 * 1000;

// Two looks in a row must find a window before it is told, and two must miss a told one before
// it is called off: a forecast wobbles from one run to the next.
export const LOOKS_TO_TELL = 2;
export const LOOKS_TO_CALL_OFF = 2;
// A sea window that no longer overlaps one known at its spot is still that window when the two
// begin within this long of one another.
export const SAME_WINDOW_HOURS = 6;
// Open hours that begin or end further than this from what was told are told again.
export const MOVED_HOURS = 2;

/** What the worker keeps of a sea window from one look to the next. */
export type Tracked = {
  id: string;
  spotId: string;
  // The sea window as the last look that found it saw it.
  sea: Interval;
  // The looks in a row that found it, up to the last. Zero once a look missed it.
  seen: number;
  // The looks in a row that missed it, since.
  missed: number;
  // What was told of it: the sea then, and its open hours then. Null while nothing was told, and
  // again once it was called off.
  told: { sea: Interval; open: Interval[] } | null;
};

/** What a look found at a spot. A spot whose forecast was not fresh is not in a look. */
export type Seen = { spotId: string; windows: Interval[] };

/** A moment to tell, of one window. */
export type Told =
  | { moment: "found"; spotId: string; windowId: string; open: Interval[] }
  | { moment: "moved"; spotId: string; windowId: string; open: Interval[]; before: Interval[] }
  | { moment: "gone"; spotId: string; windowId: string; before: Interval[] };

type Context = {
  now: Date;
  // How far ahead the account wants to be told.
  horizonDays: number;
  // The open hours of a sea window at a spot, for the account as it is set now.
  open: (spotId: string, sea: Interval) => Interval[];
  // An id for a window seen for the first time.
  newId: () => string;
};

const overlap = (one: Interval, other: Interval) =>
  Math.min(one.end.getTime(), other.end.getTime()) -
  Math.max(one.start.getTime(), other.start.getTime());
const apart = (one: Date, other: Date) => Math.abs(one.getTime() - other.getTime());
const sameInterval = (one: Interval, other: Interval) =>
  one.start.getTime() === other.start.getTime() && one.end.getTime() === other.end.getTime();
// The end of the last of some open hours, or of the sea itself when there are none.
const lastEnd = (open: Interval[], sea: Interval) => open.at(-1)?.end ?? sea.end;

// Which window found is which window known: the two that overlap most first, then, of those that
// overlap nothing, the two that begin nearest. Each is matched once.
function match(known: Tracked[], found: Interval[]) {
  const pairs: { known: number; found: number; shared: number; gap: number }[] = [];
  known.forEach((window, k) => {
    found.forEach((sea, f) => {
      const shared = overlap(window.sea, sea);
      const gap = apart(window.sea.start, sea.start);
      if (shared > 0 || gap <= SAME_WINDOW_HOURS * HOUR_MS) {
        pairs.push({ known: k, found: f, shared: Math.max(0, shared), gap });
      }
    });
  });
  pairs.sort((a, b) => b.shared - a.shared || a.gap - b.gap || a.found - b.found);

  const ofKnown = new Map<number, number>();
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (ofKnown.has(pair.known) || taken.has(pair.found)) continue;
    ofKnown.set(pair.known, pair.found);
    taken.add(pair.found);
  }
  return { ofKnown, taken };
}

/**
 * Decides what a look changes to what is known of an alert's windows, and what there is to tell.
 * Decision 031, "The moments", gives the rules, and the tests of this function are their detail.
 *
 * `known` are the alert's windows as the look before left them. `look` holds the spots that a
 * fresh forecast was read for: the windows of any other spot stay as they are. The answer gives
 * every window to keep, the ids of those to forget, and the moments to tell.
 */
export function planLook(known: Tracked[], look: Seen[], context: Context) {
  const { now, horizonDays, open, newId } = context;
  const windows: Tracked[] = [];
  const forgotten: string[] = [];
  const told: Told[] = [];
  const looked = new Map(look.map((seen) => [seen.spotId, seen.windows]));

  // A window that has run its course is forgotten, told or not.
  const live: Tracked[] = [];
  for (const window of known) {
    const over = lastEnd(window.told?.open ?? [], window.sea).getTime() <= now.getTime();
    if (over && window.sea.end.getTime() <= now.getTime()) forgotten.push(window.id);
    else live.push(window);
  }

  const spots = new Set([...live.map((window) => window.spotId), ...looked.keys()]);
  for (const spotId of spots) {
    const before = live.filter((window) => window.spotId === spotId);
    const found = looked.get(spotId)?.filter((sea) => sea.end.getTime() > now.getTime());
    // No fresh forecast for this spot: its windows are neither confirmed nor missed.
    if (!found) {
      windows.push(...before);
      continue;
    }

    const { ofKnown, taken } = match(before, found);
    const after: Tracked[] = [];
    before.forEach((window, index) => {
      const matched = ofKnown.get(index);
      if (matched === undefined) {
        // Missed. What was never told goes without a word, and so does what stays away.
        const missed = window.missed + 1;
        if (!window.told) forgotten.push(window.id);
        else if (missed >= LOOKS_TO_CALL_OFF) {
          forgotten.push(window.id);
          // Called off while its hours are still ahead. Once they have passed, nobody waits.
          if (lastEnd(window.told.open, window.sea).getTime() > now.getTime()) {
            told.push({ moment: "gone", spotId, windowId: window.id, before: window.told.open });
          }
        } else after.push({ ...window, seen: 0, missed });
        return;
      }
      const sea = found[matched]!;
      // The forecast no longer covers the first hours of a window under way: it keeps the
      // beginning it was seen with, as long as what was found is its continuation.
      const underWay =
        window.sea.start.getTime() <= now.getTime() &&
        sea.start.getTime() <= now.getTime() + HOUR_MS;
      after.push({
        ...window,
        sea: underWay ? { start: window.sea.start, end: sea.end } : sea,
        seen: window.seen + 1,
        missed: 0,
      });
    });
    found.forEach((sea, index) => {
      if (!taken.has(index)) {
        after.push({ id: newId(), spotId, sea, seen: 1, missed: 0, told: null });
      }
    });

    for (const window of after) {
      if (window.seen < LOOKS_TO_TELL) {
        windows.push(window);
        continue;
      }
      const hours = open(spotId, window.sea);
      if (!window.told) {
        // Told once it has open hours still ahead, and they begin within the days asked for.
        const ahead = hours.filter((piece) => piece.end.getTime() > now.getTime());
        const within = now.getTime() + horizonDays * 24 * HOUR_MS;
        if (ahead[0] && ahead[0].start.getTime() <= within) {
          told.push({ moment: "found", spotId, windowId: window.id, open: ahead });
          windows.push({ ...window, told: { sea: window.sea, open: hours } });
        } else windows.push(window);
        continue;
      }

      // A change of the account's settings moves the open hours and not the sea: it is not told.
      if (sameInterval(window.sea, window.told.sea)) {
        windows.push(window);
        continue;
      }
      const first = window.told.open[0];
      const last = window.told.open.at(-1);
      if (hours.length === 0) {
        // The sea moved out of every hour the account can use. It is told as gone, and found
        // again should it come back.
        told.push({ moment: "gone", spotId, windowId: window.id, before: window.told.open });
        windows.push({ ...window, told: null });
      } else if (
        first &&
        last &&
        (apart(hours[0]!.start, first.start) > MOVED_HOURS * HOUR_MS ||
          apart(hours.at(-1)!.end, last.end) > MOVED_HOURS * HOUR_MS)
      ) {
        told.push({
          moment: "moved",
          spotId,
          windowId: window.id,
          open: hours,
          before: window.told.open,
        });
        windows.push({ ...window, told: { sea: window.sea, open: hours } });
        // A smaller move is held against what was told, so that two of them add up.
      } else windows.push(window);
    }
  }

  return { windows, forgotten, told };
}
