import type { ToldStretch } from "@repo/db/schema/alerts";
import { describe, expect, it } from "vitest";

import { named, windowOf } from "./kept";

const at = (hour: number) => new Date(Date.UTC(2026, 9, 10, hour)).toISOString();
const told = (from: number, to: number, more: Partial<ToldStretch> = {}): ToldStretch => ({
  start: at(from),
  end: at(to),
  missed: 0,
  ...more,
});
const interval = (from: number, to: number) => ({
  start: new Date(at(from)),
  end: new Date(at(to)),
});
// Told hours that have become others, as the rules of a look say it.
const move = (before: [number, number], ...open: [number, number][]) => ({
  before: interval(...before),
  open: open.map((hours) => interval(...hours)),
});

describe("the name of a window, from one push to the next", () => {
  it("is where its hours began when they were first told", () => {
    expect(windowOf(told(8, 12))).toBe(at(8));
    expect(windowOf(told(13, 17, { since: at(8) }))).toBe(at(8));
    // Hours that were never told before are a window of their own, and keep no other name.
    expect(named([], [told(8, 12)])).toEqual([told(8, 12)]);
  });

  it("stays with hours that are told again as they were, or held", () => {
    const before = [told(8, 12, { since: at(6) }), told(15, 18)];
    const after = [
      told(8, 12, { missed: 1 }),
      told(15, 18, { last: { start: at(16), end: at(19) } }),
    ];

    expect(named(before, after).map(windowOf)).toEqual([at(6), at(15)]);
  });

  it("follows hours that moved, by what the move says they were, however far they went", () => {
    expect(named([told(8, 12)], [told(13, 17)], [move([8, 12], [13, 17])])).toEqual([
      told(13, 17, { since: at(8) }),
    ]);
    // A second move keeps the first name, and not the name of where it was last.
    expect(
      named([told(13, 17, { since: at(8) })], [told(18, 22)], [move([13, 17], [18, 22])]).map(
        windowOf,
      ),
    ).toEqual([at(8)]);
    // Without the move, hours that are nowhere near what was told are other hours.
    expect(named([told(8, 12)], [told(13, 17)]).map(windowOf)).toEqual([at(13)]);
  });

  it("gives each of two windows that moved the name of the one it was", () => {
    const before = [told(6, 8), told(18, 20)];
    const moves = [move([6, 8], [9, 11]), move([18, 20], [21, 23])];

    expect(named(before, [told(9, 11), told(21, 23)], moves).map(windowOf)).toEqual([
      at(6),
      at(18),
    ]);
    // Two that joined: the hours they became are the nearer of them.
    expect(
      named(
        [told(6, 8), told(10, 12)],
        [told(9, 13)],
        [move([6, 8], [9, 13]), move([10, 12], [9, 13])],
      ).map(windowOf),
    ).toEqual([at(10)]);
  });

  it("stays with what is left of hours that were cut", () => {
    const before = [told(8, 17, { since: at(7) })];

    expect(named(before, [told(13, 17)]).map(windowOf)).toEqual([at(7)]);
    // Of two windows that overlap new hours, the one they are most a part of.
    expect(named([told(6, 9), told(9, 14)], [told(8, 13)]).map(windowOf)).toEqual([at(9)]);
  });

  it("is never the name of two windows: of the parts of one, the first keeps it", () => {
    // Cut in its middle: two windows from then on, and what is said of one is not said of both.
    expect(
      named([told(8, 17, { since: at(7) })], [told(8, 10), told(14, 17)]).map(windowOf),
    ).toEqual([at(7), at(14)]);
    expect(named([told(9, 17)], [told(14, 17), told(10, 12)]).map(windowOf)).toEqual([
      at(14),
      at(9),
    ]);
    // Moved into two: the first keeps the name.
    expect(
      named([told(8, 12)], [told(11, 13), told(15, 17)], [move([8, 12], [11, 13], [15, 17])]).map(
        windowOf,
      ),
    ).toEqual([at(8), at(15)]);
    // Hours that begin where a window that moved away was first told are other hours: they
    // are told where it was, and it gives its name up to them.
    expect(
      named([told(8, 12)], [told(8, 10), told(13, 17)], [move([8, 12], [13, 17])]).map(windowOf),
    ).toEqual([at(8), at(13)]);
    // And when even its own beginning is another's name, it still has one of its own.
    const names = named(
      [told(13, 17, { since: at(15) }), told(15, 16, { since: at(9) })],
      [told(13, 17), told(15, 16), told(18, 20), told(9, 10)],
    ).map(windowOf);
    expect(names).toEqual([at(15), at(9), at(18), `${at(9)}+`]);
    expect(new Set(names).size).toBe(4);
  });

  it("keeps no name that the hours no longer have", () => {
    // Hours that were told under a name, and that begin where they were first told again.
    expect(
      named([told(13, 17, { since: at(8) })], [told(8, 12)], [move([13, 17], [8, 12])]),
    ).toEqual([told(8, 12)]);
    // A name carried by a piece that was given is not taken as it stands.
    expect(named([], [told(13, 17, { since: at(8) })])).toEqual([told(13, 17)]);
  });
});
