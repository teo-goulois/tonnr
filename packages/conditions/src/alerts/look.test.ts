import { describe, expect, it } from "vitest";

import { type SeaWindow, type ToldPiece, planLook, planMail, recut } from "./look";
import type { Interval } from "./open";

// Thursday 15 October 2026, hour by hour. "15T08" is 08:00 UTC that day.
const at = (time: string) => new Date(`2026-10-${time}:00:00Z`);
const sea = (start: string, end: string): Interval => ({ start: at(start), end: at(end) });
const stamp = (interval: Interval) =>
  `${interval.start.toISOString().slice(8, 13)}-${interval.end.toISOString().slice(8, 13)}`;

type Settings = {
  // The end of the days the account asked for.
  tellUntil: string;
  open: (sea: Interval) => Interval[];
  quiet: { found?: boolean; change?: boolean };
};

/** A spot of an alert, looked at again and again, for an account that can always go. */
function spot(more: Partial<Settings> = {}) {
  let known: { windows: SeaWindow[]; told: ToldPiece[] } = { windows: [], told: [] };
  const settings: Settings = { tellUntil: "31T00", open: (found) => [found], quiet: {}, ...more };
  return {
    settings,
    /** A look at a moment, that found these sea windows. Null: no fresh forecast, no look. */
    look(now: string, found: Interval[] | null, settled = false) {
      if (!found) return [];
      const plan = planLook(known, found, {
        now: at(now),
        tellUntil: at(settings.tellUntil),
        open: settings.open,
        settled,
        quiet: settings.quiet,
      });
      known = { windows: plan.windows, told: plan.told };
      return plan.tell.map((told) =>
        [
          told.moment,
          "open" in told ? told.open.map(stamp).join(" ") : "",
          "before" in told ? `was ${told.before.map(stamp).join(" ")}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    },
    windows: () => known.windows.map((window) => `${stamp(window.sea)} x${window.seen}`),
    told: () => known.told.map((piece) => `${stamp(piece)}${piece.missed ? " ?" : ""}`),
  };
}

// The account's hours, as hours of the UTC day: the pieces of a sea window within them.
const between =
  (from: number, to: number, shortest = 1) =>
  (found: Interval) => {
    const pieces: Interval[] = [];
    for (let day = Date.UTC(2026, 9, 10); day < found.end.getTime(); day += 24 * 3_600_000) {
      const start = Math.max(found.start.getTime(), day + from * 3_600_000);
      const end = Math.min(found.end.getTime(), day + to * 3_600_000);
      if (end - start >= shortest * 3_600_000) {
        pieces.push({ start: new Date(start), end: new Date(end) });
      }
    }
    return pieces;
  };

describe("a look at a spot of an alert", () => {
  it("tells a window once two looks in a row have found it, and once only", () => {
    const { look, told } = spot();

    expect(look("14T06", [sea("15T08", "15T11")])).toEqual([]);
    expect(told()).toEqual([]);
    expect(look("14T09", [sea("15T08", "15T11")])).toEqual(["found 15T08-15T11"]);
    expect(look("14T12", [sea("15T08", "15T11")])).toEqual([]);
    expect(told()).toEqual(["15T08-15T11"]);
  });

  it("says nothing of a window that one look found and the next did not", () => {
    const { look, windows } = spot();

    look("14T06", [sea("15T08", "15T11")]);
    expect(look("14T09", [])).toEqual([]);
    expect(windows()).toEqual([]);
    // It comes back as a new window, to be found twice again.
    expect(look("14T12", [sea("15T08", "15T11")])).toEqual([]);
    expect(look("14T15", [sea("15T08", "15T11")])).toEqual(["found 15T08-15T11"]);
  });

  it("counts a look without a fresh forecast for nothing and against nothing", () => {
    const { look } = spot();

    look("14T06", [sea("15T08", "15T11")]);
    expect(look("14T09", null)).toEqual([]);
    expect(look("14T12", [sea("15T08", "15T11")])).toEqual(["found 15T08-15T11"]);
    look("14T15", []);
    expect(look("14T18", null)).toEqual([]);
    expect(look("14T21", [])).toEqual(["gone was 15T08-15T11"]);
  });

  it("tells every window of a day", () => {
    const { look } = spot();
    const day = [sea("15T07", "15T10"), sea("15T17", "15T20")];

    look("14T06", day);
    expect(look("14T09", day)).toEqual(["found 15T07-15T10 15T17-15T20"]);
  });

  it("tells the open hours, piece by piece, and keeps quiet about a window that has none", () => {
    const { look, told, windows } = spot({ open: between(8, 12, 2) });
    // Three days of sea are three mornings, and a window in the evening is none.
    const found = [sea("15T06", "17T20"), sea("18T18", "18T22")];

    look("14T06", found);
    expect(look("14T09", found)).toEqual(["found 15T08-15T12 16T08-16T12 17T08-17T12"]);
    expect(windows()).toEqual(["15T06-17T20 x2", "18T18-18T22 x2"]);
    expect(told()).toEqual(["15T08-15T12", "16T08-16T12", "17T08-17T12"]);
  });

  it("waits for a window to come within the days the account asked for", () => {
    const { look, settings } = spot({ tellUntil: "16T00" });
    const found = [sea("16T08", "16T11")];

    look("14T06", found);
    expect(look("14T09", found)).toEqual([]);
    // The next day, the days asked for reach it, and it has been found long enough.
    settings.tellUntil = "17T00";
    expect(look("15T00", found)).toEqual(["found 16T08-16T11"]);
  });

  it("does not tell hours of which half an hour or less is left", () => {
    const known = { windows: [{ sea: sea("15T08", "15T11"), seen: 1 }], told: [] };
    const tellAt = (now: string) =>
      planLook(known, [sea("15T10", "15T11")], {
        now: new Date(`2026-10-${now}:00Z`),
        tellUntil: at("31T00"),
        open: (found) => [found],
      }).tell.map((told) => told.moment);

    expect(tellAt("15T10:29")).toEqual(["found"]);
    expect(tellAt("15T10:30")).toEqual([]);
  });
});

describe("a window that was told", () => {
  /** A spot whose window from 08 to 12 on the 15th was told. */
  function toldSpot(more: Partial<Settings> = {}, window = sea("15T08", "15T12")) {
    const one = spot(more);
    one.look("14T00", [window]);
    one.look("14T03", [window]);
    return one;
  }

  it("is told again when its open hours begin or end more than two hours from what was told", () => {
    const { look, told } = toldSpot();

    expect(look("14T06", [sea("15T10", "15T14")])).toEqual([]);
    expect(told()).toEqual(["15T08-15T12"]);
    expect(look("14T09", [sea("15T11", "15T15")])).toEqual(["moved 15T11-15T15 was 15T08-15T12"]);
    // What is told now is what the next move is held against.
    expect(look("14T12", [sea("15T10", "15T13")])).toEqual([]);
    expect(look("14T15", [sea("15T08", "15T12")])).toEqual(["moved 15T08-15T12 was 15T11-15T15"]);
  });

  it("adds small moves up, against what was told", () => {
    const { look } = toldSpot();

    expect(look("14T06", [sea("15T09", "15T13")])).toEqual([]);
    expect(look("14T09", [sea("15T10", "15T14")])).toEqual([]);
    expect(look("14T12", [sea("15T11", "15T15")])).toEqual(["moved 15T11-15T15 was 15T08-15T12"]);
  });

  it("is told as longer or shorter when only its end moved", () => {
    const { look } = toldSpot();

    expect(look("14T06", [sea("15T08", "15T15")])).toEqual(["moved 15T08-15T15 was 15T08-15T12"]);
  });

  it("is the same window when it moved past its own length, within six hours", () => {
    const { look } = toldSpot({}, sea("15T08", "15T10"));

    expect(look("14T06", [sea("15T13", "15T15")])).toEqual(["moved 15T13-15T15 was 15T08-15T10"]);
    // And further than six hours, the one is gone and the other is a new window.
    const far = toldSpot({}, sea("15T08", "15T10"));
    expect(far.look("14T06", [sea("15T15", "15T17")])).toEqual([]);
    expect(far.look("14T09", [sea("15T15", "15T17")])).toEqual([
      "found 15T15-15T17",
      "gone was 15T08-15T10",
    ]);
  });

  it("is called off once two looks in a row have missed it", () => {
    const { look, told } = toldSpot();

    expect(look("14T06", [])).toEqual([]);
    expect(told()).toEqual(["15T08-15T12 ?"]);
    expect(look("14T09", [])).toEqual(["gone was 15T08-15T12"]);
    expect(told()).toEqual([]);
    // It is called off once.
    expect(look("14T12", [])).toEqual([]);
  });

  it("stands when a look that missed it is followed by one that finds it", () => {
    const { look, told } = toldSpot();

    look("14T06", []);
    expect(look("14T09", [sea("15T08", "15T12")])).toEqual([]);
    expect(told()).toEqual(["15T08-15T12"]);
    expect(look("14T12", [])).toEqual([]);
    expect(look("14T15", [])).toEqual(["gone was 15T08-15T12"]);
  });

  it("is told as moved by the first look that finds it again elsewhere", () => {
    const { look } = toldSpot();

    look("14T06", []);
    expect(look("14T09", [sea("15T11", "15T15")])).toEqual(["moved 15T11-15T15 was 15T08-15T12"]);
  });

  it("is a new window when it comes back after it was called off", () => {
    const { look } = toldSpot();

    look("14T06", []);
    look("14T09", []);
    expect(look("14T12", [sea("15T08", "15T12")])).toEqual([]);
    expect(look("14T15", [sea("15T08", "15T12")])).toEqual(["found 15T08-15T12"]);
  });

  it("is not called off once its hours have passed", () => {
    const { look, told } = toldSpot();

    expect(look("15T12", [])).toEqual([]);
    expect(look("15T15", [])).toEqual([]);
    expect(told()).toEqual([]);
  });

  it("is not told as moved because its first hours have passed", () => {
    const { look } = toldSpot({}, sea("15T06", "15T18"));

    // The forecast begins at the hour of the look: the window keeps the beginning it had.
    expect(look("15T09", [sea("15T09", "15T18")])).toEqual([]);
    expect(look("15T12", [sea("15T12", "15T18")])).toEqual([]);
    // But a window under way that stops for more than two hours has moved.
    expect(look("15T13", [sea("15T16", "15T18")])).toEqual(["moved 15T16-15T18 was 15T06-15T18"]);
  });

  it("is not called off for an hour that dips in the middle of it", () => {
    const { look, told } = toldSpot({}, sea("15T08", "15T16"));

    expect(look("14T06", [sea("15T08", "15T11"), sea("15T12", "15T16")])).toEqual([]);
    expect(told()).toEqual(["15T08-15T16"]);
    // Its two halves are as sure as it was: neither is told as new.
    expect(look("14T09", [sea("15T08", "15T11"), sea("15T12", "15T16")])).toEqual([]);
  });

  it("keeps two told windows for themselves when one grows and another appears", () => {
    const { look, told } = spot();
    const two = [sea("15T08", "15T10"), sea("15T12", "15T14")];
    look("14T00", two);
    expect(look("14T03", two)).toEqual(["found 15T08-15T10 15T12-15T14"]);

    // The two have joined, and a third appeared: nothing is gone, and the third waits a look.
    const then = [sea("15T09", "15T14"), sea("15T16", "15T18")];
    expect(look("14T06", then)).toEqual(["moved 15T09-15T14 was 15T08-15T10 15T12-15T14"]);
    expect(look("14T09", then)).toEqual(["found 15T16-15T18"]);
    expect(told()).toEqual(["15T09-15T14", "15T16-15T18"]);
  });

  it("is not called off when two told windows joined and the sea then left one's hours", () => {
    const { look, told } = spot();
    const two = [sea("15T08", "15T10"), sea("15T11", "15T13")];
    look("14T00", two);
    look("14T03", two);

    // They join, by less than two hours each: nothing is said, and both are where the sea is.
    expect(look("14T06", [sea("15T09", "15T12")])).toEqual([]);
    // The sea no longer reaches the hours told of the first: it is still its window.
    expect(look("14T09", [sea("15T10", "15T12")])).toEqual([]);
    expect(look("14T12", [sea("15T10", "15T12")])).toEqual([]);
    expect(told()).toEqual(["15T08-15T10", "15T11-15T13"]);
    // And a move past two hours from what was told is said of both.
    expect(look("14T15", [sea("15T14", "15T17")])).toEqual([
      "moved 15T14-15T17 was 15T08-15T10 15T11-15T13",
    ]);
  });

  it("does not take the hours of another told window for its own", () => {
    const { look } = spot();
    const two = [sea("15T08", "15T10"), sea("15T12", "15T14")];
    look("14T00", two);
    look("14T03", two);

    // The morning goes, and the afternoon stays where it was: the one is gone, not moved.
    look("14T06", [sea("15T12", "15T14")]);
    expect(look("14T09", [sea("15T12", "15T14")])).toEqual(["gone was 15T08-15T10"]);
  });

  it("is followed where it is, once the hours that were told have passed", () => {
    const { look, told } = toldSpot({}, sea("15T10", "15T12"));

    // Two hours later, which is no news: it is told for 10 to 12, and is at 12 to 14.
    expect(look("14T06", [sea("15T12", "15T14")])).toEqual([]);
    // At 13:00 the hours told are over, and the window is not: it is not found anew.
    expect(look("15T13", [sea("15T12", "15T14")])).toEqual([]);
    expect(told()).toEqual(["15T10-15T12"]);
    expect(look("15T16", [])).toEqual([]);
    expect(told()).toEqual([]);
  });

  it("keeps the beginning of a window under way, a day back at most", () => {
    const { look, windows } = spot();
    look("13T00", [sea("13T00", "15T20")]);
    look("13T03", [sea("13T00", "15T20")]);

    // The forecast begins with the day of the look: the window is known since before.
    look("14T03", [sea("14T00", "15T20")]);
    expect(windows()).toEqual(["13T03-15T20 x3"]);
    look("15T09", [sea("15T00", "15T20")]);
    expect(windows()).toEqual(["14T09-15T20 x4"]);
  });

  it("stays one window when the sea found goes back and forth between two", () => {
    const { look, told } = spot();
    const two = [sea("15T08", "15T10"), sea("15T11", "15T16")];
    look("14T00", two);
    look("14T03", two);

    for (const [now, found] of [
      ["14T06", sea("15T09", "15T12")],
      ["14T09", sea("15T10", "15T15")],
      ["14T12", sea("15T09", "15T12")],
      ["14T15", sea("15T10", "15T15")],
    ] as const) {
      const said = look(now, [found]);
      expect(said.filter((line) => line.startsWith("gone"))).toEqual([]);
      expect(said.filter((line) => line.startsWith("found"))).toEqual([]);
    }
    expect(told().length).toBeLessThanOrEqual(2);
  });

  it("is called off when the sea leaves the account's hours, after two looks as well", () => {
    const { look, told } = toldSpot({ open: between(6, 18, 2) }, sea("15T14", "15T17"));

    // The sea window is still there, in the evening: it has no hours for the account.
    expect(look("14T06", [sea("15T19", "15T22")])).toEqual([]);
    expect(told()).toEqual(["15T14-15T17 ?"]);
    expect(look("14T09", [sea("15T19", "15T22")])).toEqual(["gone was 15T14-15T17"]);
    // Back in its hours, it is a new window: it was found by every look, and is told at once.
    expect(look("14T12", [sea("15T15", "15T18")])).toEqual(["found 15T15-15T18"]);
  });

  it("stands when the sea comes back into the account's hours at the next look", () => {
    const { look } = toldSpot({ open: between(6, 18, 2) }, sea("15T14", "15T17"));

    look("14T06", [sea("15T19", "15T22")]);
    expect(look("14T09", [sea("15T15", "15T18")])).toEqual([]);
  });
});

describe("a change of the account's settings", () => {
  it("calls nothing off, and tells nothing of the hours it moved", () => {
    const { look, told, settings } = spot({ open: between(6, 14, 2) });
    const found = [sea("15T06", "15T20")];
    look("14T00", found);
    expect(look("14T03", found)).toEqual(["found 15T06-15T14"]);

    // A day off: no hour is open any more.
    settings.open = () => [];
    expect(look("14T06", found, true)).toEqual([]);
    expect(look("14T09", found)).toEqual([]);
    expect(told()).toEqual([]);

    // Afternoons instead: what the sea had found long ago is told for the new hours.
    settings.open = between(14, 20, 2);
    expect(look("14T12", found, true)).toEqual(["found 15T14-15T20"]);
  });

  it("is not told as a move of the sea, even after the sea moved a little", () => {
    const { look, told, settings } = spot({ open: between(6, 20, 2) });
    look("14T00", [sea("15T08", "15T14")]);
    look("14T03", [sea("15T08", "15T14")]);
    // A small move, of which nothing is said.
    expect(look("14T06", [sea("15T09", "15T15")])).toEqual([]);

    // Later hours for the account, and the sea as it was.
    settings.open = between(12, 20, 2);
    expect(look("14T09", [sea("15T09", "15T15")], true)).toEqual([]);
    expect(told()).toEqual(["15T12-15T15"]);
    // What stands is what the next move of the sea is held against.
    expect(look("14T12", [sea("15T09", "15T16")])).toEqual([]);
    expect(look("14T15", [sea("15T09", "15T18")])).toEqual(["moved 15T12-15T18 was 15T12-15T15"]);
  });

  it("leaves a told window in doubt when the look that follows it misses the sea", () => {
    const { look, told } = spot();
    look("14T00", [sea("15T08", "15T12")]);
    look("14T03", [sea("15T08", "15T12")]);

    // Another time zone, and the same hours: the sea is missed once, as at any look.
    expect(look("14T06", [], true)).toEqual([]);
    expect(told()).toEqual(["15T08-15T12 ?"]);
    expect(look("14T09", [sea("15T08", "15T12")])).toEqual([]);
    expect(told()).toEqual(["15T08-15T12"]);
  });

  it("tells hours it opened elsewhere in the day as new, and forgets those it closed", () => {
    const { look, told, settings } = spot({ open: between(8, 10, 2) });
    const found = [sea("15T06", "15T20")];
    look("14T00", found);
    expect(look("14T03", found)).toEqual(["found 15T08-15T10"]);

    // Early afternoons instead of mornings, on the same sea: they were never told.
    settings.open = between(12, 14, 2);
    expect(look("14T06", found, true)).toEqual(["found 15T12-15T14"]);
    expect(told()).toEqual(["15T12-15T14"]);
  });

  it("tells hours it opened where the sea had gone as new, and not as a move", () => {
    const { look, settings } = spot({ open: between(8, 12, 2) });
    look("14T00", [sea("15T08", "15T12")]);
    look("14T03", [sea("15T08", "15T12")]);
    // The sea leaves for the afternoon, outside the account's hours: missed once.
    expect(look("14T06", [sea("15T13", "15T17")])).toEqual([]);

    // The account opens its afternoons. The morning is gone by the sea's doing, after two
    // looks, and the afternoon is the account's by its own: found, not moved to.
    settings.open = between(8, 17, 2);
    expect(look("14T09", [sea("15T13", "15T17")], true)).toEqual([
      "found 15T13-15T17",
      "gone was 15T08-15T12",
    ]);
  });

  it("keeps a told window whose hours it widened, without a word", () => {
    const { look, told, settings } = spot({ open: between(8, 12, 2) });
    const found = [sea("15T06", "15T20")];
    look("14T00", found);
    look("14T03", found);

    settings.open = between(8, 18, 2);
    expect(look("14T06", found, true)).toEqual([]);
    expect(told()).toEqual(["15T08-15T18"]);
  });

  it("tells the hours it opened of a window that had none", () => {
    const { look, settings } = spot({ open: () => [] });
    const found = [sea("15T06", "15T20")];
    look("14T00", found);
    expect(look("14T03", found)).toEqual([]);

    settings.open = between(8, 12, 2);
    expect(look("14T06", found, true)).toEqual(["found 15T08-15T12"]);
  });
});

describe("a moment the account switched off", () => {
  it("is not told, and hours that were not told are not followed", () => {
    const { look, told, settings } = spot({ quiet: { found: true } });
    const found = [sea("15T08", "15T12")];

    look("14T00", found);
    expect(look("14T03", found)).toEqual([]);
    expect(told()).toEqual([]);
    expect(look("14T06", [])).toEqual([]);
    expect(look("14T09", [])).toEqual([]);

    // Switched back on, it tells what the looks have found meanwhile.
    look("14T12", found);
    look("14T15", found);
    settings.quiet = {};
    expect(look("14T18", found)).toEqual(["found 15T08-15T12"]);
  });

  it("holds the next move against where the window was when changes were switched back on", () => {
    const { look, settings } = spot({ quiet: { change: true } });
    look("14T00", [sea("15T08", "15T12")]);
    look("14T03", [sea("15T08", "15T12")]);
    // An hour later, of which nothing is said and nothing is kept against.
    look("14T06", [sea("15T09", "15T13")]);

    settings.quiet = {};
    expect(look("14T09", [sea("15T11", "15T15")])).toEqual([]);
    expect(look("14T12", [sea("15T12", "15T16")])).toEqual(["moved 15T12-15T16 was 15T09-15T13"]);
  });

  it("keeps what was told in line with the sea, without a word", () => {
    const { look, told } = spot({ quiet: { change: true } });
    look("14T00", [sea("15T08", "15T12")]);
    look("14T03", [sea("15T08", "15T12")]);

    expect(look("14T06", [sea("15T12", "15T16")])).toEqual([]);
    expect(told()).toEqual(["15T12-15T16"]);
    look("14T09", []);
    expect(look("14T12", [])).toEqual([]);
    expect(told()).toEqual([]);
  });
});

/** What mail tells of a spot, pass after pass, beside what the list holds as told. */
function mailbox(quiet: { found?: boolean; change?: boolean } = {}) {
  let mailed: ToldPiece[] = [];
  const piece = (start: string, end: string, more: Partial<ToldPiece> = {}): ToldPiece => ({
    ...sea(start, end),
    missed: 0,
    ...more,
  });
  return {
    piece,
    /**
     * A mail that leaves at a moment, when the list holds these hours as told. The hours that
     * are open then are where the told pieces are, unless they are given.
     */
    mail(now: string, told: ToldPiece[], present?: Interval[]) {
      const plan = planMail(
        mailed,
        told,
        present ?? told.filter((one) => one.missed === 0).map((one) => one.last ?? one),
        { now: at(now), quiet },
      );
      mailed = plan.mailed;
      return plan.tell.map((said) =>
        [
          said.moment,
          "open" in said ? said.open.map(stamp).join(" ") : "",
          "before" in said ? `was ${said.before.map(stamp).join(" ")}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    },
    mailed: () => mailed.map(stamp),
  };
}

describe("what a mail says of a spot", () => {
  it("tells hours that mail never told, once", () => {
    const { mail, piece, mailed } = mailbox();
    const told = [piece("15T08", "15T12"), piece("16T08", "16T12")];

    expect(mail("14T07", told)).toEqual(["found 15T08-15T12 16T08-16T12"]);
    expect(mailed()).toEqual(["15T08-15T12", "16T08-16T12"]);
    expect(mail("14T10", told)).toEqual([]);
    // Hours told since are the only news.
    expect(mail("14T13", [...told, piece("17T08", "17T12")])).toEqual(["found 17T08-17T12"]);
  });

  it("says where hours are now, when they moved while the mail waited", () => {
    const { mail, piece } = mailbox();

    // Told at 23:00 as 08:00 to 12:00, moved in the night: the morning's mail says 11:00.
    expect(mail("15T07", [piece("15T11", "15T15")])).toEqual(["found 15T11-15T15"]);
  });

  it("says nothing of hours that came and went while the mail waited", () => {
    const { mail, mailed } = mailbox();

    expect(mail("15T07", [])).toEqual([]);
    expect(mailed()).toEqual([]);
  });

  it("says that hours moved by more than two hours from what mail told", () => {
    const { mail, piece, mailed } = mailbox();
    mail("14T07", [piece("15T08", "15T12")]);

    // An hour later is no news, and is held against what mail said.
    expect(mail("14T10", [piece("15T08", "15T12", { last: sea("15T09", "15T13") })])).toEqual([]);
    expect(mailed()).toEqual(["15T08-15T12"]);
    // The list told the move: mail tells it against what mail said.
    expect(mail("14T13", [piece("15T11", "15T15")])).toEqual(["moved 15T11-15T15 was 15T08-15T12"]);
    expect(mailed()).toEqual(["15T11-15T15"]);
  });

  it("adds up small moves against what mail told, whatever the list told meanwhile", () => {
    const { mail, piece } = mailbox();
    mail("14T07", [piece("15T08", "15T12")]);

    expect(mail("14T10", [piece("15T10", "15T14")])).toEqual([]);
    expect(mail("14T13", [piece("15T11", "15T15")])).toEqual(["moved 15T11-15T15 was 15T08-15T12"]);
  });

  it("says that hours are gone as soon as the list holds them no more", () => {
    const { mail, piece, mailed } = mailbox();
    mail("14T07", [piece("15T08", "15T12"), piece("16T08", "16T12")]);

    // Missed by one look, they still stand as told.
    expect(
      mail("14T10", [piece("15T08", "15T12", { missed: 1 }), piece("16T08", "16T12")]),
    ).toEqual([]);
    expect(mail("14T13", [piece("16T08", "16T12")])).toEqual(["gone was 15T08-15T12"]);
    expect(mailed()).toEqual(["16T08-16T12"]);
  });

  it("says nothing of hours that are over, nor of hours with too little left", () => {
    const { mail, piece, mailed } = mailbox();
    mail("14T07", [piece("15T08", "15T12")]);

    expect(mail("15T13", [])).toEqual([]);
    expect(mailed()).toEqual([]);
    // Twenty minutes are left of these: not worth a mail.
    expect(
      mail("16T11", [{ ...piece("16T08", "16T12"), end: new Date("2026-10-16T11:20:00Z") }]),
    ).toEqual([]);
  });

  it("keeps what mail told in line without a word, for an account that switched changes off", () => {
    const { mail, piece, mailed } = mailbox({ change: true });
    mail("14T07", [piece("15T08", "15T12"), piece("16T08", "16T12")]);

    expect(mail("14T10", [piece("15T12", "15T16")])).toEqual([]);
    expect(mailed()).toEqual(["15T12-15T16"]);
  });

  it("tells nothing new to an account that switched found off, and follows nothing of it", () => {
    const { mail, piece, mailed } = mailbox({ found: true });

    expect(mail("14T07", [piece("15T08", "15T12")])).toEqual([]);
    expect(mailed()).toEqual([]);
    expect(mail("14T10", [])).toEqual([]);
  });

  it("tells the hours that are open, not the stretch a told piece was last found in", () => {
    const { mail, piece, mailed } = mailbox();
    // Two mornings were told, joined for a look, then apart again: the second is remembered
    // as a stretch that holds the hour between them, which does not work.
    const told = [
      piece("15T07", "15T09", { last: sea("15T08", "15T09") }),
      piece("15T10", "15T12", { last: sea("15T08", "15T12") }),
    ];

    expect(mail("14T07", told, [sea("15T08", "15T09"), sea("15T10", "15T12")])).toEqual([
      "found 15T08-15T09 15T10-15T12",
    ]);
    expect(mailed()).toEqual(["15T08-15T09", "15T10-15T12"]);
  });

  it("says nothing new of hours that the last look missed, and does not call them off", () => {
    const { mail, piece, mailed } = mailbox();
    // Never told by mail, and missed by the last look: nothing to say yet.
    expect(mail("14T07", [piece("15T08", "15T12", { missed: 1 })], [])).toEqual([]);
    expect(mailed()).toEqual([]);

    // Told by mail, then missed by a look that found other hours nearby: it has not moved.
    mail("14T10", [piece("15T08", "15T12")]);
    expect(
      mail(
        "14T13",
        [piece("15T08", "15T12", { missed: 1 }), piece("15T14", "15T18")],
        [sea("15T14", "15T18")],
      ),
    ).toEqual(["found 15T14-15T18"]);
    expect(mailed()).toEqual(["15T08-15T12", "15T14-15T18"]);
  });
});

describe("what mail told of a piece that the last look missed", () => {
  it("is not moved onto other hours that stand nearby", () => {
    const { mail, piece, mailed } = mailbox();
    mail("14T07", [piece("15T09", "15T13")]);

    // The list has moved it a little, to 11:00, and the last look missed it. Another piece
    // stands from 08:00 to 10:00, which overlaps what mail told and is not it.
    const told = [
      piece("15T09", "15T13", { last: sea("15T11", "15T15"), missed: 1 }),
      piece("15T08", "15T10"),
    ];
    expect(mail("14T10", told, [sea("15T08", "15T10")])).toEqual(["found 15T08-15T10"]);
    expect(mailed()).toEqual(["15T08-15T10", "15T09-15T13"]);
  });

  it("is found again where the list has it, without a word when it is near what mail told", () => {
    const { mail, piece } = mailbox();
    mail("14T07", [piece("15T09", "15T13")]);
    mail("14T10", [piece("15T09", "15T13", { last: sea("15T11", "15T15"), missed: 1 })], []);

    expect(
      mail(
        "14T13",
        [piece("15T09", "15T13", { last: sea("15T11", "15T15") })],
        [sea("15T11", "15T15")],
      ),
    ).toEqual([]);
  });
});

describe("what mail told, under hours that are cut anew", () => {
  it("keeps the hours that are still open, and takes none that the change opened", () => {
    const windows: SeaWindow[] = [{ sea: sea("15T08", "15T17"), seen: 3 }];
    const mailed: ToldPiece[] = [{ ...sea("15T08", "15T10"), missed: 0 }];

    // The account now goes in the afternoon only: the morning mail told is no longer its own.
    expect(recut({ windows, told: mailed }, between(13, 17))).toEqual([]);
    // And one that goes all day keeps it, as long as it is now.
    expect(recut({ windows, told: mailed }, between(6, 12)).map(stamp)).toEqual(["15T08-15T12"]);
    // The afternoon is then new to mail, as it is to the list.
    const plan = planMail(
      recut({ windows, told: mailed }, between(13, 17)),
      [{ ...sea("15T13", "15T17"), missed: 0 }],
      [sea("15T13", "15T17")],
      { now: at("14T07") },
    );
    expect(plan.tell).toEqual([{ moment: "found", open: [sea("15T13", "15T17")] }]);
  });
});
