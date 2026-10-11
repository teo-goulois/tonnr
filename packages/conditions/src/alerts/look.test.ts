import { describe, expect, it } from "vitest";

import { type Seen, type Tracked, planLook } from "./look";
import type { Interval } from "./open";

// Thursday 15 October 2026, hour by hour. "15T08" is 08:00 UTC that day.
const at = (time: string) => new Date(`2026-10-${time}:00:00Z`);
const sea = (start: string, end: string): Interval => ({ start: at(start), end: at(end) });
const stamp = (interval: Interval) =>
  `${interval.start.toISOString().slice(8, 13)}-${interval.end.toISOString().slice(8, 13)}`;

/** An alert on one spot, looked at again and again, for an account that can always go. */
function alert(more: { horizonDays?: number; open?: (sea: Interval) => Interval[] } = {}) {
  let known: Tracked[] = [];
  let made = 0;
  const settings = { horizonDays: 3, open: (found: Interval) => [found], ...more };
  return {
    settings,
    /** A look at a moment, that found these sea windows at the spot. Null: no fresh forecast. */
    look(now: string, found: Interval[] | null, spots: Seen[] = []) {
      const plan = planLook(
        known,
        [...(found ? [{ spotId: "one", windows: found }] : []), ...spots],
        {
          now: at(now),
          horizonDays: settings.horizonDays,
          open: (_spotId, window) => settings.open(window),
          newId: () => `w${(made += 1)}`,
        },
      );
      known = plan.windows;
      return plan.told.map((told) =>
        [
          told.moment,
          told.spotId,
          "open" in told ? told.open.map(stamp).join(" ") : "",
          "before" in told ? `was ${told.before.map(stamp).join(" ")}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    },
    known: () => known,
  };
}

describe("a look at an alert", () => {
  it("tells a window once two looks in a row have found it, and once only", () => {
    const { look } = alert();

    expect(look("14T06", [sea("15T08", "15T11")])).toEqual([]);
    expect(look("14T09", [sea("15T08", "15T11")])).toEqual(["found one 15T08-15T11"]);
    expect(look("14T12", [sea("15T08", "15T11")])).toEqual([]);
  });

  it("says nothing of a window that one look found and the next did not", () => {
    const { look, known } = alert();

    look("14T06", [sea("15T08", "15T11")]);
    expect(look("14T09", [])).toEqual([]);
    expect(known()).toEqual([]);
    // Back, it is a window seen for the first time.
    expect(look("14T12", [sea("15T08", "15T11")])).toEqual([]);
    expect(look("14T15", [sea("15T08", "15T11")])).toEqual(["found one 15T08-15T11"]);
  });

  it("counts a look without a fresh forecast for nothing and against nothing", () => {
    const { look, known } = alert();

    look("14T06", [sea("15T08", "15T11")]);
    expect(look("14T09", null)).toEqual([]);
    expect(known()).toMatchObject([{ seen: 1, missed: 0 }]);
    expect(look("14T12", [sea("15T08", "15T11")])).toEqual(["found one 15T08-15T11"]);
    // And a told window is not called off for it.
    expect(look("14T15", null)).toEqual([]);
    expect(look("14T18", null)).toEqual([]);
    expect(known()).toMatchObject([{ seen: 2, missed: 0 }]);
  });

  it("tells every window of a day", () => {
    const { look } = alert();
    const day = [sea("15T07", "15T10"), sea("15T16", "15T19")];

    look("14T06", day);
    expect(look("14T09", day)).toEqual(["found one 15T07-15T10", "found one 15T16-15T19"]);
  });

  it("waits for a window to come within the days the account asked for", () => {
    const { look } = alert({ horizonDays: 1 });

    look("13T06", [sea("15T08", "15T11")]);
    expect(look("13T09", [sea("15T08", "15T11")])).toEqual([]);
    expect(look("14T06", [sea("15T08", "15T11")])).toEqual([]);
    // 08:00 on the 15th is a day ahead at 08:00 on the 14th, and no sooner.
    expect(look("14T09", [sea("15T08", "15T11")])).toEqual(["found one 15T08-15T11"]);
  });

  it("tells the open hours, and keeps quiet about a window that has none", () => {
    const account = alert();
    // The account can go from 09:00, and only then.
    account.settings.open = (found) =>
      found.end > at("15T09") ? [{ start: at("15T09"), end: found.end }] : [];

    account.look("14T06", [sea("15T04", "15T12")]);
    expect(account.look("14T09", [sea("15T04", "15T12")])).toEqual(["found one 15T09-15T12"]);

    const early = alert({ open: () => [] });
    early.look("14T06", [sea("15T02", "15T05")]);
    expect(early.look("14T09", [sea("15T02", "15T05")])).toEqual([]);
    // The account then makes room for it: it is found, without waiting two more looks.
    early.settings.open = (found) => [found];
    expect(early.look("14T12", [sea("15T02", "15T05")])).toEqual(["found one 15T02-15T05"]);
  });

  it("tells again a window whose open hours moved by more than two hours", () => {
    const { look } = alert();
    look("14T06", [sea("15T08", "15T12")]);
    look("14T09", [sea("15T08", "15T12")]);

    // Two hours is not more than two hours.
    expect(look("14T12", [sea("15T10", "15T14")])).toEqual([]);
    // One more is three from what was told: small moves add up.
    expect(look("14T15", [sea("15T11", "15T15")])).toEqual([
      "moved one 15T11-15T15 was 15T08-15T12",
    ]);
    // Back where it was, it has moved again from what was last told.
    expect(look("14T18", [sea("15T08", "15T12")])).toEqual([
      "moved one 15T08-15T12 was 15T11-15T15",
    ]);
  });

  it("knows a short window that moved past its own length for the same window", () => {
    const { look, known } = alert();
    look("14T06", [sea("15T08", "15T10")]);
    look("14T09", [sea("15T08", "15T10")]);

    expect(look("14T12", [sea("15T11", "15T13")])).toEqual([
      "moved one 15T11-15T13 was 15T08-15T10",
    ]);
    expect(known()).toHaveLength(1);
    // Further than six hours from where it was, it is another: the first is missed.
    expect(look("14T15", [sea("15T18", "15T20")])).toEqual([]);
    expect(look("14T18", [sea("15T18", "15T20")])).toEqual([
      "gone one was 15T11-15T13",
      "found one 15T18-15T20",
    ]);
  });

  it("matches each known window once, to the one that shares most with it", () => {
    const { look, known } = alert();
    look("14T06", [sea("15T08", "15T14")]);
    look("14T09", [sea("15T08", "15T14")]);

    // The window breaks in two: the longer piece is the window, the other a new one.
    expect(look("14T12", [sea("15T08", "15T09"), sea("15T10", "15T14")])).toEqual([]);
    expect(known().map((window) => [stamp(window.sea), window.seen])).toEqual([
      ["15T10-15T14", 3],
      ["15T08-15T09", 1],
    ]);
  });

  it("calls a told window off once two looks in a row have missed it", () => {
    const { look, known } = alert();
    look("14T06", [sea("15T08", "15T11")]);
    look("14T09", [sea("15T08", "15T11")]);

    expect(look("14T12", [])).toEqual([]);
    // Found again, the count of the looks that missed it starts over.
    expect(look("14T15", [sea("15T08", "15T11")])).toEqual([]);
    expect(look("14T18", [])).toEqual([]);
    expect(look("14T21", [])).toEqual(["gone one was 15T08-15T11"]);
    expect(known()).toEqual([]);
    // It may come back: it is then found again, after two looks.
    look("15T00", [sea("15T08", "15T11")]);
    expect(look("15T03", [sea("15T08", "15T11")])).toEqual(["found one 15T08-15T11"]);
  });

  it("does not call off a window whose hours have passed", () => {
    const { look, known } = alert();
    look("14T06", [sea("15T08", "15T11")]);
    look("14T09", [sea("15T08", "15T11")]);

    expect(look("15T12", [])).toEqual([]);
    expect(known()).toEqual([]);
  });

  it("keeps the beginning of a window under way, which the forecast no longer shows", () => {
    const { look, known } = alert();
    look("14T06", [sea("15T06", "15T12")]);
    look("14T09", [sea("15T06", "15T12")]);

    // At 09:00 the forecast begins at 09:00: the window has not moved by three hours.
    expect(look("15T09", [sea("15T09", "15T12")])).toEqual([]);
    expect(known().map((window) => stamp(window.sea))).toEqual(["15T06-15T12"]);
    // Its end may still move, and that is told.
    expect(look("15T10", [sea("15T10", "15T16")])).toEqual([
      "moved one 15T06-15T16 was 15T06-15T12",
    ]);
  });

  it("tells nothing when the account's hours change and the sea does not", () => {
    const account = alert();
    account.look("14T06", [sea("15T08", "15T14")]);
    account.look("14T09", [sea("15T08", "15T14")]);

    account.settings.open = () => [sea("15T12", "15T14")];
    expect(account.look("14T12", [sea("15T08", "15T14")])).toEqual([]);
    account.settings.open = () => [];
    expect(account.look("14T15", [sea("15T08", "15T14")])).toEqual([]);
  });

  it("tells as gone a window that the sea moved out of the account's hours", () => {
    const account = alert({ open: (found) => (found.start < at("15T18") ? [found] : []) });
    account.look("14T06", [sea("15T08", "15T11")]);
    account.look("14T09", [sea("15T08", "15T11")]);

    // The sea now comes after dark.
    expect(account.look("14T12", [sea("15T14", "15T17")])).toEqual([
      "moved one 15T14-15T17 was 15T08-15T11",
    ]);
    expect(account.look("14T15", [sea("15T19", "15T22")])).toEqual(["gone one was 15T14-15T17"]);
    // And back into the day: found again, at once since two looks have seen it.
    expect(account.look("14T18", [sea("15T15", "15T18")])).toEqual(["found one 15T15-15T18"]);
  });

  it("looks at each spot of an alert for itself", () => {
    const { look, known } = alert();
    const other = (found: Interval[]): Seen[] => [{ spotId: "two", windows: found }];

    look("14T06", [sea("15T08", "15T11")], other([sea("15T09", "15T11")]));
    // The second spot has no fresh forecast at this look: it is found a look later.
    expect(look("14T09", [sea("15T08", "15T11")])).toEqual(["found one 15T08-15T11"]);
    expect(look("14T12", [sea("15T08", "15T11")], other([sea("15T09", "15T11")]))).toEqual([
      "found two 15T09-15T11",
    ]);
    expect(
      known()
        .map((window) => window.spotId)
        .sort(),
    ).toEqual(["one", "two"]);
  });

  it("forgets a window that has run its course", () => {
    const { look, known } = alert();
    look("14T06", [sea("15T08", "15T11")]);
    look("14T09", [sea("15T08", "15T11")]);

    expect(look("15T12", null)).toEqual([]);
    expect(known()).toEqual([]);
  });
});
