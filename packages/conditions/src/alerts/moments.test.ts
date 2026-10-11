import { describe, expect, it } from "vitest";

import { type Watched, beginnings, eveningFor, hoursOfDay, leavesAt } from "./moments";
import type { Interval } from "./open";

const PARIS = "Europe/Paris";
const at = (time: string) => new Date(`2026-10-${time}:00Z`);
const sea = (start: string, end: string): Interval => ({ start: at(start), end: at(end) });
const stamp = (interval: Interval) =>
  `${interval.start.toISOString().slice(8, 16)}-${interval.end.toISOString().slice(8, 16)}`;
const whole = (_spotId: string, found: Interval) => [found];
const watched = (more: Partial<Watched> = {}): Watched => ({
  id: "w1",
  spotId: "one",
  sea: sea("15T08:00", "15T11:00"),
  seen: 2,
  missed: 0,
  lookedAt: at("15T06:00"),
  begunUntil: null,
  ...more,
});

describe("the open hours that begin", () => {
  const begin = (now: string, window: Watched, noticeMinutes = 0, open = whole) =>
    beginnings(at(now), [window], { open, noticeMinutes }).map((due) => stamp(due.piece));

  it("are said when they begin, and not before", () => {
    expect(begin("15T07:45", watched())).toEqual([]);
    expect(begin("15T08:00", watched())).toEqual(["15T08:00-15T11:00"]);
    expect(begin("15T08:10", watched())).toEqual(["15T08:00-15T11:00"]);
  });

  it("are said ahead by the notice the account asked for", () => {
    expect(begin("15T06:45", watched(), 60)).toEqual([]);
    expect(begin("15T07:00", watched(), 60)).toEqual(["15T08:00-15T11:00"]);
  });

  it("are said once", () => {
    expect(begin("15T08:15", watched({ begunUntil: at("15T11:00") }))).toEqual([]);
  });

  it("are said of a window that was never told, seen once by a look just before", () => {
    expect(begin("15T08:00", watched({ seen: 1 }))).toEqual(["15T08:00-15T11:00"]);
  });

  it("are not said of a window the last look missed, or looked at too long ago", () => {
    expect(begin("15T08:00", watched({ seen: 0, missed: 1 }))).toEqual([]);
    expect(begin("15T08:00", watched({ lookedAt: at("15T01:59") }))).toEqual([]);
    expect(begin("15T08:00", watched({ lookedAt: at("15T02:00") }))).toHaveLength(1);
  });

  it("are not said with less than half an hour left", () => {
    expect(begin("15T10:29", watched())).toHaveLength(1);
    expect(begin("15T10:30", watched())).toEqual([]);
  });

  it("are said piece by piece when the account's hours cut a window in two", () => {
    const pieces = () => [sea("15T08:00", "15T10:00"), sea("15T16:00", "15T18:00")];
    const day = watched({ sea: sea("15T08:00", "15T18:00"), lookedAt: at("15T12:00") });

    expect(begin("15T08:00", { ...day, lookedAt: at("15T06:00") }, 0, pieces)).toEqual([
      "15T08:00-15T10:00",
    ]);
    // The morning was said: the afternoon is another beginning.
    const afterMorning = { ...day, begunUntil: at("15T10:00") };
    expect(begin("15T12:00", afterMorning, 0, pieces)).toEqual([]);
    expect(begin("15T16:00", afterMorning, 0, pieces)).toEqual(["15T16:00-15T18:00"]);
  });
});

describe("the evening before", () => {
  const settings = { zone: PARIS, eveningMinutes: 19 * 60 };

  it("is due for the next day from the account's hour until midnight", () => {
    // 19:00 in Paris is 17:00 UTC in October.
    expect(eveningFor(at("14T16:59"), settings, null)).toBeNull();
    expect(eveningFor(at("14T17:00"), settings, null)).toBe("2026-10-15");
    // A worker that was late still sends it that evening.
    expect(eveningFor(at("14T21:59"), settings, null)).toBe("2026-10-15");
    // After midnight in Paris it is the 15th, and its evening has not come.
    expect(eveningFor(at("14T22:00"), settings, null)).toBeNull();
  });

  it("is due once for a day", () => {
    expect(eveningFor(at("14T17:15"), settings, "2026-10-15")).toBeNull();
    expect(eveningFor(at("14T17:15"), settings, "2026-10-14")).toBe("2026-10-15");
    // An account that moved its clock back a day is not sent the same evening twice.
    expect(eveningFor(at("14T17:15"), settings, "2026-10-16")).toBeNull();
  });

  it("lists the open hours of the day, of the windows two looks have found", () => {
    const windows = [
      watched({ id: "morning", sea: sea("15T06:00", "15T09:00") }),
      // Seen once only: not yet a window to count on.
      watched({ id: "once", seen: 1, sea: sea("15T12:00", "15T15:00") }),
      // The day after.
      watched({ id: "later", sea: sea("16T06:00", "16T09:00") }),
      // Across midnight in Paris, which is 22:00 UTC: it belongs to both days.
      watched({ id: "night", spotId: "two", sea: sea("15T20:00", "16T01:00") }),
      // Missed by the last look.
      watched({ id: "missed", seen: 0, missed: 1, sea: sea("15T10:00", "15T13:00") }),
    ];
    const listed = (day: string) =>
      hoursOfDay(day, PARIS, at("14T17:00"), windows, whole).map((entry) => entry.windowId);

    expect(listed("2026-10-15")).toEqual(["morning", "night"]);
    expect(listed("2026-10-16")).toEqual(["later", "night"]);
  });

  it("lists nothing from looks that are too old to be believed", () => {
    const stale = [watched({ lookedAt: at("14T08:00") })];

    expect(hoursOfDay("2026-10-15", PARIS, at("14T17:00"), stale, whole)).toEqual([]);
  });
});

describe("quiet hours", () => {
  // From 22:00 to 07:00 in Paris: from 20:00 to 05:00 UTC in October.
  const night = { zone: PARIS, from: 22 * 60, to: 7 * 60 };

  it("hold a message until they end", () => {
    expect(leavesAt(at("14T19:59"), night)).toEqual(at("14T19:59"));
    expect(leavesAt(at("14T20:00"), night)).toEqual(at("15T05:00"));
    expect(leavesAt(at("15T02:30"), night)).toEqual(at("15T05:00"));
    expect(leavesAt(at("15T05:00"), night)).toEqual(at("15T05:00"));
  });

  it("may be hours of one day", () => {
    const siesta = { zone: PARIS, from: 13 * 60, to: 15 * 60 };

    expect(leavesAt(at("15T11:30"), siesta)).toEqual(at("15T13:00"));
    expect(leavesAt(at("15T13:00"), siesta)).toEqual(at("15T13:00"));
  });

  it("hold nothing when there are none", () => {
    expect(leavesAt(at("15T02:30"), null)).toEqual(at("15T02:30"));
    expect(leavesAt(at("15T02:30"), { zone: PARIS, from: 0, to: 0 })).toEqual(at("15T02:30"));
  });

  it("end at the hour the clock shows the morning it is set back", () => {
    // In the night of 24 to 25 October the clock is set back: 07:00 is 06:00 UTC.
    expect(leavesAt(at("24T22:00"), night)).toEqual(at("25T06:00"));
  });
});
