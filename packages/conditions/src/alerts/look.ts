import type { Interval } from "./open";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Two looks in a row must find a sea window before its hours are told, and two must find none
// of the hours that were told before they are called off: a forecast wobbles from one run to
// the next.
export const LOOKS_TO_TELL = 2;
export const LOOKS_TO_CALL_OFF = 2;
// A sea window that no longer overlaps one known at its spot is still that window when the two
// begin within this long of one another. The same reach tells what told hours have become.
export const SAME_WINDOW_HOURS = 6;
// Open hours that begin or end further than this from what was told are told again.
export const MOVED_HOURS = 2;
// Open hours with this little left, or less, are not worth telling.
export const WORTH_MINUTES = 30;
// Past two, the looks that found a window are counted for the record, and no further than this.
const SEEN_AT_MOST = 99;

/**
 * What the worker keeps of a sea window from one look to the next. A sea window is a run of
 * hours in which the alert's conditions are met at a spot.
 */
export type SeaWindow = {
  // The sea window as the last look saw it.
  sea: Interval;
  // The looks in a row that found it, up to the last.
  seen: number;
};

/**
 * Open hours that were told at a spot, and are not over. What is told are open hours, piece by
 * piece: a sea window that lasts three days is three mornings to its owner, and each is found,
 * moved or gone for itself.
 */
export type ToldPiece = Interval & {
  // The looks in a row that found none of its hours.
  missed: number;
  // The hours it was at the last look that found it, when they are not the told ones: a move
  // too small to tell. The next look finds what it has become from there, and still holds it
  // against what was told.
  last?: Interval;
};

/** A moment to tell, at one spot. */
export type Told =
  | { moment: "found"; open: Interval[] }
  // What the pieces of `before` have become, all of them together.
  | { moment: "moved"; open: Interval[]; before: Interval[] }
  | { moment: "gone"; before: Interval[] };

type Context = {
  now: Date;
  // A window that opens later than this is not told yet: the account's days ahead.
  tellUntil: Date;
  // The open hours of a sea window at the spot, for the account as it is set now.
  open: (sea: Interval) => Interval[];
  // True when what cuts the open hours changed since the look before: the account's hours,
  // its daylight, its absence, its zone, or the alert's shortest window. What was told is then
  // cut again, as the known sea would have been told under the hours as they are now, before
  // anything is held against it: a day off calls nothing off, and hours that the change opened
  // are new.
  settled?: boolean;
  // The moments the account switched off. Hours that "found" does not tell are not told: they
  // are not followed, and nothing is said of what becomes of them.
  quiet?: { found?: boolean; change?: boolean };
};

const overlap = (one: Interval, other: Interval) =>
  Math.min(one.end.getTime(), other.end.getTime()) -
  Math.max(one.start.getTime(), other.start.getTime());
const apart = (one: number, other: number) => Math.abs(one - other);
const byStart = (one: Interval, other: Interval) => one.start.getTime() - other.start.getTime();
const overlapsAny = (piece: Interval, among: Interval[]) =>
  among.some((other) => overlap(piece, other) > 0);
const keyOf = (piece: Interval) => `${piece.start.getTime()}-${piece.end.getTime()}`;
// Where a told piece was at the last look that found it.
const lastOf = (piece: ToldPiece): Interval => piece.last ?? piece;
// Each stretch once, the earliest first.
function once<Piece extends Interval>(pieces: Piece[]) {
  return [...new Map(pieces.map((piece) => [keyOf(piece), piece])).values()].sort(byStart);
}

/**
 * The sea windows a look found, each with the looks in a row that found it. A window found
 * continues every known one it overlaps, and is as sure as the surest of them: one that splits
 * in two leaves two that are both as sure as it was, and two that join leave one. A window
 * found that overlaps none continues the nearest known one that nothing else does, when the
 * two begin within reach of one another.
 */
function follow(known: SeaWindow[], found: Interval[], now: Date): SeaWindow[] {
  const continued = new Set<SeaWindow>();
  const windows: SeaWindow[] = [];
  const alone: Interval[] = [];

  for (const sea of [...found].sort(byStart)) {
    const parents = known.filter((window) => overlap(window.sea, sea) > 0);
    if (parents.length === 0) {
      alone.push(sea);
      continue;
    }
    for (const parent of parents) continued.add(parent);
    // The forecast no longer covers the first hours of a window under way: it keeps the
    // beginning it was seen with, as long as what was found is its continuation. A day back
    // is as far as it is kept: no shortest window is longer, and a sea that works for a month
    // is not read from its first hour at every look.
    const began = parents
      .filter((parent) => parent.sea.start.getTime() <= now.getTime())
      .sort((a, b) => byStart(a.sea, b.sea))[0];
    const underWay = began && sea.start.getTime() <= now.getTime() + HOUR_MS;
    const earliest = Math.floor((now.getTime() - DAY_MS) / HOUR_MS) * HOUR_MS;
    const start = underWay
      ? Math.min(sea.start.getTime(), Math.max(began.sea.start.getTime(), earliest))
      : sea.start.getTime();
    windows.push({
      sea: { start: new Date(start), end: sea.end },
      seen: Math.min(SEEN_AT_MOST, Math.max(...parents.map((parent) => parent.seen)) + 1),
    });
  }

  for (const sea of alone) {
    const nearest = known
      .filter((window) => !continued.has(window))
      .map((window) => ({
        window,
        gap: apart(window.sea.start.getTime(), sea.start.getTime()),
      }))
      .filter((candidate) => candidate.gap <= SAME_WINDOW_HOURS * HOUR_MS)
      .sort((a, b) => a.gap - b.gap || byStart(a.window.sea, b.window.sea))[0]?.window;
    if (nearest) continued.add(nearest);
    windows.push({ sea, seen: Math.min(SEEN_AT_MOST, (nearest?.seen ?? 0) + 1) });
  }

  return windows.sort((a, b) => byStart(a.sea, b.sea));
}

/**
 * What was told, as it would have been told under the hours as they are cut now: for each told
 * piece, the open hours of the known sea that overlap where it was. A piece whose sea the last
 * look did not find stays as it is: nothing is known to cut it with.
 */
export function recut(
  known: { windows: SeaWindow[]; told: ToldPiece[] },
  open: (sea: Interval) => Interval[],
): ToldPiece[] {
  const hours = once(known.windows.flatMap((window) => open(window.sea)));
  const pieces = known.told.flatMap((piece) => {
    const at = lastOf(piece);
    if (!known.windows.some((window) => overlap(window.sea, at) > 0)) return [piece];
    return hours
      .filter((other) => overlap(other, at) > 0)
      .map((other) => ({ start: other.start, end: other.end, missed: piece.missed }));
  });
  return once(pieces);
}

/**
 * Decides what a look at a spot changes to what is known of it, and what there is to tell.
 * Decision 031, "Windows" and "The moments", gives the rules, and the tests of this function
 * are their detail.
 *
 * `known` is what the look before left of the spot: its sea windows, and the open hours that
 * were told. `found` are the sea windows a fresh forecast gives now: a spot whose forecast is
 * not fresh is not looked at, and nothing of it changes. The answer gives the sea windows to
 * keep in place of the known ones, the open hours that stand as told, and the moments to tell.
 */
export function planLook(
  known: { windows: SeaWindow[]; told: ToldPiece[] },
  found: Interval[],
  context: Context,
) {
  const { tellUntil, open, settled = false, quiet = {} } = context;
  const now = context.now.getTime();
  const ahead = <Piece extends Interval>(pieces: Piece[]) =>
    pieces.filter((piece) => piece.end.getTime() > now);
  // A beginning that has passed is now: what is left to tell of it is from here on.
  const from = (piece: Interval) => Math.max(piece.start.getTime(), now);

  const windows = follow(
    known.windows.filter((window) => window.sea.end.getTime() > now),
    ahead(found),
    context.now,
  );
  // The open hours of every window this look found, and those of the windows that two looks
  // in a row have: the first say what told hours have become, the second what is new.
  const present = once(windows.flatMap((window) => ahead(open(window.sea))));
  const sure = once(
    windows
      .filter((window) => window.seen >= LOOKS_TO_TELL)
      .flatMap((window) => ahead(open(window.sea))),
  );

  // What each told piece has become: the present hours that overlap where it last was, all of
  // them, so that an hour's dip in the middle of a morning is no news. One that overlaps none
  // has moved to the nearest hours within reach that no told piece is at, or is missed.
  // A piece is followed until the hours it is at are over, which may be later than those told.
  const waited = (settled ? recut(known, open) : known.told)
    .filter((piece) => lastOf(piece).end.getTime() > now)
    .sort(byStart);
  const places = waited.map(lastOf);
  const claimed = new Set<string>();
  const standing: ToldPiece[] = [];
  const moved: { open: Interval[]; before: Interval }[] = [];
  const gone: Interval[] = [];
  // Pieces that are at the same hours, since two told windows joined, become the same thing.
  const becomes = new Map<string, Interval[]>();
  for (const piece of waited) {
    const at = lastOf(piece);
    let become = becomes.get(keyOf(at));
    if (!become) {
      become = present.filter((other) => overlap(at, other) > 0);
      // After a change of settings, hours that are open elsewhere may be so by the change: they
      // are new, and no told piece is said to have moved there.
      if (become.length === 0 && !settled) {
        const nearest = present
          .filter((other) => !claimed.has(keyOf(other)) && !overlapsAny(other, places))
          .map((other) => ({ other, gap: apart(from(at), from(other)) }))
          .filter((candidate) => candidate.gap <= SAME_WINDOW_HOURS * HOUR_MS)
          .sort((a, b) => a.gap - b.gap || byStart(a.other, b.other))[0]?.other;
        if (nearest) become = [nearest];
      }
      becomes.set(keyOf(at), become);
      for (const other of become) claimed.add(keyOf(other));
    }

    if (become.length === 0) {
      const missed = piece.missed + 1;
      if (missed < LOOKS_TO_CALL_OFF) standing.push({ ...piece, missed });
      else if (!quiet.change) gone.push({ start: piece.start, end: piece.end });
      continue;
    }
    const first = Math.min(...become.map(from));
    const last = Math.max(...become.map((other) => other.end.getTime()));
    const hasMoved =
      apart(first, from(piece)) > MOVED_HOURS * HOUR_MS ||
      apart(last, piece.end.getTime()) > MOVED_HOURS * HOUR_MS;
    if (hasMoved || quiet.change) {
      // What it has become is what stands as told from here on: said, or with changes switched
      // off kept in line without a word.
      standing.push(...become.map((other) => ({ ...other, missed: 0 })));
      if (!quiet.change)
        moved.push({ open: become, before: { start: piece.start, end: piece.end } });
    } else {
      // A smaller move is held against what was told, so that two of them add up, and
      // remembered, so that the next look finds the piece where it is.
      const span = {
        start: new Date(Math.min(...become.map((other) => other.start.getTime()))),
        end: new Date(last),
      };
      standing.push({
        start: piece.start,
        end: piece.end,
        missed: 0,
        ...(keyOf(span) === keyOf(piece) ? {} : { last: span }),
      });
    }
  }

  // Sure hours that were not told yet are, once they begin within the days asked for and
  // enough of them is left.
  const news = quiet.found
    ? []
    : sure.filter(
        (piece) =>
          !claimed.has(keyOf(piece)) &&
          !overlapsAny(piece, standing) &&
          !overlapsAny(piece, standing.map(lastOf)) &&
          piece.start.getTime() < tellUntil.getTime() &&
          piece.end.getTime() - WORTH_MINUTES * MINUTE_MS > now,
      );
  standing.push(...news.map((piece) => ({ ...piece, missed: 0 })));

  const tell: Told[] = [];
  if (news.length > 0) tell.push({ moment: "found", open: news });
  if (moved.length > 0) {
    tell.push({
      moment: "moved",
      open: once(moved.flatMap((one) => one.open)),
      before: moved.map((one) => one.before),
    });
  }
  if (gone.length > 0) tell.push({ moment: "gone", before: gone });

  return { windows, told: once(standing), tell };
}

/**
 * Decides what a mail says of a spot, and what stands as told by mail once it has left.
 *
 * A mail may leave hours after the look that wrote its notification, when the account's quiet
 * hours end, or not at all. So what mail told at a spot is kept apart from what the list told,
 * and a mail says how the two differ, by the rules of a look: the open hours that stand as told
 * are to mail what the sea is to a look. Hours that mail never told are found, hours further
 * than two hours from what mail told have moved, and hours that stand no more are gone. Nothing
 * waits for a second look here: what stands as told was found twice, and was called off after
 * two looks.
 *
 * `mailed` is what mail told at the spot, `told` what the last look left as told there, and
 * `present` the open hours of the windows that look found. What a mail says are hours of
 * `present`, as they are: where a told piece was last found is a stretch that may hold hours
 * that do not work, and only says which of the present hours are its own.
 */
export function planMail(
  mailed: ToldPiece[],
  told: ToldPiece[],
  present: Interval[],
  context: { now: Date; quiet?: Context["quiet"] },
) {
  const now = context.now.getTime();
  const ahead = <Piece extends Interval>(pieces: Piece[]) =>
    pieces.filter((piece) => piece.end.getTime() > now);
  // The present hours that told pieces are at.
  const found = told.filter((piece) => piece.missed === 0).map(lastOf);
  const standing = once(ahead(present).filter((piece) => overlapsAny(piece, found)));
  // A told piece that the last look missed is neither there nor gone yet: what mail told of
  // it stays as it is, and nothing is said.
  const missed = ahead(told.filter((piece) => piece.missed > 0).map(lastOf));
  const isHeld = (piece: ToldPiece) =>
    overlapsAny(lastOf(piece), missed) && !overlapsAny(lastOf(piece), standing);
  const held = ahead(mailed).filter(isHeld);

  const plan = planLook(
    {
      windows: standing.map((piece) => ({ sea: piece, seen: LOOKS_TO_TELL })),
      told: mailed
        .filter((piece) => !isHeld(piece))
        .map((piece) => ({ ...piece, missed: LOOKS_TO_CALL_OFF - 1 })),
    },
    standing,
    {
      now: context.now,
      // The days ahead were counted when the hours were told.
      tellUntil: new Date(8.64e15),
      open: (piece) => [piece],
      ...(context.quiet ? { quiet: context.quiet } : {}),
    },
  );
  return { mailed: once([...plan.told, ...held]), tell: plan.tell };
}
