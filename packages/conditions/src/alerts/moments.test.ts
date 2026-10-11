import { describe, expect, it } from "vitest";

import {
  type Watched,
  beginnings,
  dayOf,
  eveningFor,
  hoursOfDay,
  leavesAt,
  tellUntil,
} from "./moments";
import type { Interval } from "./open";

const PARIS = "Europe/Paris";
const at = (time: string) => new Date(`2026-10-${time}:00Z`);
const sea = (start: string, end: string): Interval => ({ start: at(start), end: at(end) });
const stamp = (interval: Interval) =>
  `${interval.start.toISOString().slice(8, 16)}-${interval.end.toISOString().slice(8, 16)}`;
const whole = (_spotId: string, found: Interval) => [found];
const watched = (more: Partial<Watched> = {}): Watched => ({
  spotId: "one",
  windows: [{ sea: sea("15T08:00", "15T11:00"), seen: 2 }],
  told: [],
  lookedAt: at("15T06:00"),
  begun: [],
  ...more,
});

describe("the days ahead", () => {
  it("end with the last of the account's days, however long a day is", () => {
    // Saturday evening in Paris, the day before the clock is set back: one day ahead is all of
    // Sunday, which lasts twenty-five hours.
    const saturday = new Date("2026-10-24T17:00:00Z");

    expect(tellUntil(saturday, PARIS, 1).toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(tellUntil(saturday, PARIS, 3).toISOString()).toBe("2026-10-27T23:00:00.000Z");
    // A minute after midnight, the days are counted from the new one.
    expect(tellUntil(new Date("2026-10-24T22:01:00Z"), PARIS, 1).toISOString()).toBe(
      "2026-10-26T23:00:00.000Z",
    );
  });
});

describe("the open hours that begin", () => {
  const begin = (now: string, spot: Watched, noticeMinutes = 0, open = whole) =>
    beginnings(at(now), [spot], { open, noticeMinutes }).map((due) => stamp(due.piece));

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
    expect(begin("15T08:15", watched({ begun: [sea("15T08:00", "15T11:00")] }))).toEqual([]);
    // Nor of hours that were a part of those it was said of.
    expect(begin("15T09:15", watched({ begun: [sea("15T06:00", "15T12:00")] }))).toEqual([]);
  });

  it("are said of a window that was never told, seen once by a look just before", () => {
    const once = watched({ windows: [{ sea: sea("15T08:00", "15T11:00"), seen: 1 }] });

    expect(begin("15T08:00", once)).toEqual(["15T08:00-15T11:00"]);
  });

  it("are not said of a spot that was looked at too long ago, never, or later than now", () => {
    expect(begin("15T08:00", watched({ windows: [] }))).toEqual([]);
    expect(begin("15T08:00", watched({ lookedAt: at("15T01:59") }))).toEqual([]);
    expect(begin("15T08:00", watched({ lookedAt: at("15T02:00") }))).toHaveLength(1);
    expect(begin("15T08:00", watched({ lookedAt: null }))).toEqual([]);
    expect(begin("15T08:00", watched({ lookedAt: at("15T08:01") }))).toEqual([]);
  });

  it("are not said when half an hour or less is left of them", () => {
    expect(begin("15T10:29", watched())).toHaveLength(1);
    expect(begin("15T10:30", watched())).toEqual([]);
  });

  it("are said piece by piece, across the windows of the spot", () => {
    const mornings = (_spotId: string, found: Interval) =>
      found.start.getTime() < at("15T12:00").getTime()
        ? [sea("15T08:00", "15T10:00"), sea("15T11:00", "15T12:00")].filter(
            (piece) => piece.end.getTime() <= found.end.getTime(),
          )
        : [found];
    const spot = (begun: Interval[], lookedAt = at("15T06:00")) =>
      watched({
        lookedAt,
        windows: [
          { sea: sea("15T08:00", "15T12:00"), seen: 2 },
          { sea: sea("15T17:00", "15T19:00"), seen: 1 },
        ],
        begun,
      });
    const first = sea("15T08:00", "15T10:00");
    const second = sea("15T11:00", "15T12:00");

    expect(begin("15T08:00", spot([]), 0, mornings)).toEqual(["15T08:00-15T10:00"]);
    expect(begin("15T09:00", spot([first]), 0, mornings)).toEqual([]);
    expect(begin("15T11:00", spot([first]), 0, mornings)).toEqual(["15T11:00-15T12:00"]);
    expect(begin("15T17:00", spot([first, second], at("15T15:00")), 0, mornings)).toEqual([
      "15T17:00-15T19:00",
    ]);
  });

  it("are said of hours that appear before others that were said ahead", () => {
    // With four hours' notice, the afternoon was said at 07:00. A look then finds a morning.
    const spot = watched({
      lookedAt: at("15T09:00"),
      windows: [
        { sea: sea("15T08:00", "15T10:00"), seen: 1 },
        { sea: sea("15T11:00", "15T13:00"), seen: 3 },
      ],
      begun: [sea("15T11:00", "15T13:00")],
    });

    expect(begin("15T09:00", spot, 240)).toEqual(["15T08:00-15T10:00"]);
  });
});

describe("the evening before", () => {
  const evening = (now: string, listedUntil: Date | null = null, zone = PARIS) =>
    eveningFor(at(now), { zone, eveningMinutes: 19 * 60 }, listedUntil);

  it("is due for the next day from the account's hour until midnight", () => {
    // Paris is two hours ahead of UTC in mid-October.
    expect(evening("14T16:59")).toBeNull();
    expect(evening("14T17:00")).toBe("2026-10-15");
    expect(evening("14T21:59")).toBe("2026-10-15");
    expect(evening("14T22:00")).toBeNull();
  });

  it("is due once for a day", () => {
    const listed = dayOf("2026-10-15", PARIS).end;

    expect(evening("14T17:15", listed)).toBeNull();
    expect(evening("14T21:59", listed)).toBeNull();
    expect(evening("15T17:00", listed)).toBe("2026-10-16");
  });

  it("is not due again for a day the account moved its clock onto", () => {
    // 05:00 UTC is 19:00 the day before in Honolulu, and 19:00 that day on Kiritimati: the
    // next day there is the stretch of time Honolulu's next day was.
    const now = "15T05:00";
    const honolulu = "Pacific/Honolulu";
    const kiritimati = "Pacific/Kiritimati";
    expect(evening(now, null, honolulu)).toBe("2026-10-15");
    const listed = dayOf("2026-10-15", honolulu).end;

    expect(evening(now, listed, kiritimati)).toBeNull();
    expect(evening("16T05:00", listed, kiritimati)).toBe("2026-10-17");
    // Half a day away, the day that is half in the one listed is the same day too.
    expect(evening("15T17:00", dayOf("2026-10-16", kiritimati).end, PARIS)).toBeNull();
    expect(evening("16T17:00", dayOf("2026-10-16", kiritimati).end, PARIS)).toBe("2026-10-17");
    // And back: the evening after is due, for a day that was not listed.
    const there = dayOf("2026-10-16", kiritimati).end;
    expect(evening(now, there, honolulu)).toBeNull();
    expect(evening("16T05:00", there, honolulu)).toBe("2026-10-16");
  });

  it("counts half of a day as long as the day is", () => {
    // The 25th of October lasts twenty-five hours in Paris. The day listed last ended at
    // 10:00 UTC that day, twelve hours into it: less than half of it, so it is another day.
    const saturday = new Date("2026-10-24T17:00:00Z");
    const due = (listedUntil: string) =>
      eveningFor(saturday, { zone: PARIS, eveningMinutes: 19 * 60 }, new Date(listedUntil));

    expect(due("2026-10-25T10:00:00Z")).toBe("2026-10-25");
    expect(due("2026-10-25T10:30:00Z")).toBeNull();
  });

  it("lists the open hours of the day, of the windows two looks have found", () => {
    const now = at("14T17:00");
    const spots = [
      watched({
        spotId: "one",
        lookedAt: at("14T15:00"),
        windows: [
          { sea: sea("15T08:00", "15T11:00"), seen: 2 },
          // Found once: not sure enough for the evening.
          { sea: sea("15T15:00", "15T18:00"), seen: 1 },
          // The day after.
          { sea: sea("16T08:00", "16T11:00"), seen: 3 },
        ],
      }),
      // Looked at too long ago to be believed.
      watched({ spotId: "two", lookedAt: at("14T10:59") }),
      // Its window runs across midnight in Paris, which is 22:00 UTC: it is of both days.
      watched({
        spotId: "three",
        lookedAt: at("14T15:00"),
        windows: [{ sea: sea("15T20:00", "16T01:00"), seen: 2 }],
      }),
    ];
    const list = (day: string) =>
      hoursOfDay(day, PARIS, now, spots, whole).map(
        (listed) => `${listed.spotId} ${listed.pieces.map(stamp).join(" ")}`,
      );

    expect(list("2026-10-15")).toEqual(["one 15T08:00-15T11:00", "three 15T20:00-16T01:00"]);
    expect(list("2026-10-16")).toEqual(["one 16T08:00-16T11:00", "three 15T20:00-16T01:00"]);
  });

  it("lists hours that were told, when the look that found them again was the first", () => {
    const spot = (missed: number) =>
      watched({
        lookedAt: at("14T15:00"),
        windows: [{ sea: sea("15T09:00", "15T12:00"), seen: 1 }],
        told: [{ ...sea("15T08:00", "15T11:00"), missed }],
      });

    expect(hoursOfDay("2026-10-15", PARIS, at("14T17:00"), [spot(0)], whole)).toHaveLength(1);
    expect(hoursOfDay("2026-10-15", PARIS, at("14T17:00"), [spot(1)], whole)).toEqual([]);
  });

  it("lists nothing for a day the clock skipped", () => {
    // Samoa went from the 29th of December 2011 to the 31st.
    const apia = "Pacific/Apia";
    const skipped = dayOf("2011-12-30", apia);
    expect(skipped.end.getTime()).toBe(skipped.start.getTime());

    const around: Interval = {
      start: new Date(skipped.start.getTime() - 3_600_000),
      end: new Date(skipped.start.getTime() + 3_600_000),
    };
    const spot = watched({
      windows: [{ sea: around, seen: 2 }],
      lookedAt: new Date(skipped.start.getTime() - 2 * 3_600_000),
    });
    const now = new Date(skipped.start.getTime() - 3_600_000);

    expect(hoursOfDay("2011-12-30", apia, now, [spot], whole)).toEqual([]);
    expect(hoursOfDay("2011-12-31", apia, now, [spot], whole)).toHaveLength(1);
  });
});

describe("quiet hours", () => {
  const night = { zone: PARIS, from: 22 * 60, to: 7 * 60 };
  const leaves = (now: string, quiet = night) => leavesAt(new Date(now), quiet).toISOString();

  it("let a message leave at once outside them", () => {
    expect(leaves("2026-10-14T12:00:00Z")).toBe("2026-10-14T12:00:00.000Z");
    expect(leavesAt(at("14T23:00"), null)).toEqual(at("14T23:00"));
    expect(leaves("2026-10-14T23:00:00Z", { zone: PARIS, from: 0, to: 0 })).toBe(
      "2026-10-14T23:00:00.000Z",
    );
  });

  it("hold a message until their end, across midnight", () => {
    // 20:30 UTC is 22:30 in Paris: until 07:00 the next morning, which is 05:00 UTC.
    expect(leaves("2026-10-14T20:30:00Z")).toBe("2026-10-15T05:00:00.000Z");
    // 03:00 UTC is 05:00 in Paris: until 07:00 that morning.
    expect(leaves("2026-10-15T03:00:10Z")).toBe("2026-10-15T05:00:00.000Z");
    expect(leaves("2026-10-15T04:59:30Z")).toBe("2026-10-15T05:00:00.000Z");
    expect(leaves("2026-10-15T05:00:00Z")).toBe("2026-10-15T05:00:00.000Z");
  });

  it("end at a moment that is still to come when the clock is set back", () => {
    // Paris shows 02:00 to 03:00 twice on the 25th of October 2026. Quiet until 02:30.
    const early = { zone: PARIS, from: 0, to: 2 * 60 + 30 };

    // 01:15 UTC is the second 02:15: they end at the second 02:30, not at the first.
    expect(leaves("2026-10-25T01:15:00Z", early)).toBe("2026-10-25T01:30:00.000Z");
    // The first 02:15 is quiet until the first 02:30, and the hour that follows is not.
    expect(leaves("2026-10-25T00:15:00Z", early)).toBe("2026-10-25T00:30:00.000Z");
    // The night as a whole lasts an hour longer.
    expect(leaves("2026-10-24T21:00:00Z")).toBe("2026-10-25T06:00:00.000Z");
  });

  it("end in the gap a clock set forward opens in them", () => {
    // Quiet from 03:30 to 02:30 the next night: all day but an hour. On the 29th of March
    // Paris goes from 02:00 to 03:00, which is neither before 02:30 nor after 03:30.
    const almostAll = { zone: PARIS, from: 3 * 60 + 30, to: 2 * 60 + 30 };

    expect(leaves("2026-03-29T00:30:00Z", almostAll)).toBe("2026-03-29T01:00:00.000Z");
    // On another night they end at 02:30, an hour after 01:30.
    expect(leaves("2026-03-28T00:30:00Z", almostAll)).toBe("2026-03-28T01:30:00.000Z");
  });

  it("end when the clock skips their end", () => {
    // Paris goes from 02:00 to 03:00 on the 29th of March 2026: 02:30 is never shown, and
    // quiet hours that end then end at 03:00, which is 01:00 UTC.
    const early = { zone: PARIS, from: 0, to: 2 * 60 + 30 };
    expect(leaves("2026-03-29T00:15:00Z", early)).toBe("2026-03-29T01:00:00.000Z");
    // Lord Howe skips half an hour, from 02:00 to 02:30, on the 4th of October 2026.
    const lordHowe = { zone: "Australia/Lord_Howe", from: 0, to: 2 * 60 + 15 };
    expect(leaves("2026-10-03T15:00:00Z", lordHowe)).toBe("2026-10-03T15:30:00.000Z");
  });
});
