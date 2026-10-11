import { describe, expect, it } from "vitest";

import { ALWAYS, type Availability, openHours } from "./open";

// A beach of Finistère, in mid-October: the sun rises at about 06:30 UTC and sets at about
// 17:20 UTC.
const BEACH = { latitude: 47.84, longitude: -4.35 };
const PARIS = "Europe/Paris";
const at = (time: string) => new Date(`2026-10-${time}:00Z`);
const sea = (start: string, end: string) => ({ start: at(start), end: at(end) });
const hours = (pieces: { start: Date; end: Date }[]) =>
  pieces.map(
    (piece) =>
      `${piece.start.toISOString().slice(8, 16)} - ${piece.end.toISOString().slice(8, 16)}`,
  );
const account = (more: Partial<Availability> = {}): Availability => ({
  ...ALWAYS,
  zone: PARIS,
  ...more,
});
const allDay = [{ from: 0, to: 1440 }];

describe("the open hours of a sea window", () => {
  it("are the whole window for an account that can always go", () => {
    expect(hours(openHours(sea("15T02:00", "15T09:00"), BEACH, ALWAYS, 120))).toEqual([
      "15T02:00 - 15T09:00",
    ]);
  });

  it("are cut to the daylight at the spot", () => {
    const daylight = account({ daylightOnly: true });

    // First light comes a few minutes past 06:00 UTC, half an hour before the sun, and the
    // last goes at 18:00: an hour is day when most of it is.
    expect(hours(openHours(sea("15T02:00", "15T09:00"), BEACH, daylight, 120))).toEqual([
      "15T06:00 - 15T09:00",
    ]);
    // A window that runs through the night comes in two pieces.
    expect(hours(openHours(sea("15T15:00", "16T09:00"), BEACH, daylight, 120))).toEqual([
      "15T15:00 - 15T18:00",
      "16T06:00 - 16T09:00",
    ]);
    // In the dark from end to end, it has none.
    expect(openHours(sea("15T19:00", "16T04:00"), BEACH, daylight, 120)).toEqual([]);
  });

  it("are cut to the account's hours for each day, on its own clock", () => {
    // Before work and after it on weekdays, the whole of Saturday, and no Sunday.
    const workdays = [
      { from: 6 * 60, to: 9 * 60 },
      { from: 17 * 60, to: 21 * 60 },
    ];
    const week = [workdays, workdays, workdays, workdays, workdays, allDay, []];
    const busy = account({ week });

    // Thursday 15 October, 04:00 to 20:00 UTC, is 06:00 to 22:00 in Paris.
    expect(hours(openHours(sea("15T04:00", "15T20:00"), BEACH, busy, 120))).toEqual([
      "15T04:00 - 15T07:00",
      "15T15:00 - 15T19:00",
    ]);
    // Saturday is open from its first hour to its last, and Sunday not at all.
    expect(hours(openHours(sea("16T20:00", "19T02:00"), BEACH, busy, 120))).toEqual([
      "16T22:00 - 17T22:00",
    ]);
  });

  it("drop a piece shorter than the alert's shortest window", () => {
    const mornings = account({ week: Array(7).fill([{ from: 7 * 60, to: 9 * 60 }]) });

    expect(hours(openHours(sea("15T03:00", "15T12:00"), BEACH, mornings, 120))).toEqual([
      "15T05:00 - 15T07:00",
    ]);
    expect(openHours(sea("15T03:00", "15T12:00"), BEACH, mornings, 180)).toEqual([]);
    // The sea comes in for the second of the account's two hours only.
    expect(openHours(sea("15T06:00", "15T12:00"), BEACH, mornings, 120)).toEqual([]);
    expect(hours(openHours(sea("15T06:00", "15T12:00"), BEACH, mornings, 60))).toEqual([
      "15T06:00 - 15T07:00",
    ]);
  });

  it("are none until the account is back", () => {
    const away = account({ awayUntil: at("15T10:00") });

    expect(hours(openHours(sea("15T06:00", "15T14:00"), BEACH, away, 120))).toEqual([
      "15T10:00 - 15T14:00",
    ]);
    expect(openHours(sea("15T06:00", "15T11:00"), BEACH, away, 120)).toEqual([]);
    // Back within an hour, the account has not the whole of it.
    const halfPast = account({ awayUntil: at("15T10:30") });
    expect(hours(openHours(sea("15T06:00", "15T14:00"), BEACH, halfPast, 120))).toEqual([
      "15T11:00 - 15T14:00",
    ]);
  });

  it("follow an hour across midnight in a zone half an hour from the forecast's", () => {
    // Every hour of every day: no hour is closed, wherever the account's midnight falls in it.
    const always = (zone: string) => account({ zone, week: Array(7).fill(allDay) });

    for (const zone of ["Asia/Kolkata", "Asia/Kathmandu", "Pacific/Chatham"]) {
      expect(hours(openHours(sea("15T00:00", "17T00:00"), BEACH, always(zone), 60))).toEqual([
        "15T00:00 - 17T00:00",
      ]);
    }
    // In Kolkata 18:00 UTC is 23:30. An account free until midnight has half of that hour,
    // and half an hour is not an open hour.
    const evenings = account({
      zone: "Asia/Kolkata",
      week: Array(7).fill([{ from: 20 * 60, to: 1440 }]),
    });
    expect(hours(openHours(sea("15T12:00", "15T22:00"), BEACH, evenings, 60))).toEqual([
      "15T15:00 - 15T18:00",
    ]);
  });

  it("read hours that touch as one stretch", () => {
    const split = account({
      zone: "UTC",
      week: Array(7).fill([
        { from: 8 * 60, to: 8 * 60 + 30 },
        { from: 8 * 60 + 30, to: 10 * 60 },
      ]),
    });

    expect(hours(openHours(sea("15T06:00", "15T12:00"), BEACH, split, 120))).toEqual([
      "15T08:00 - 15T10:00",
    ]);
  });

  it("call an hour day when most of it is, where dawn and dusk come within the hour", () => {
    // Far north on the shortest day: there is light for under half an hour, around 11:30 UTC.
    const arctic = { latitude: 72.54, longitude: 7 };
    const daylight = account({ zone: "UTC", daylightOnly: true });
    const december = {
      start: new Date("2026-12-21T08:00:00Z"),
      end: new Date("2026-12-21T15:00:00Z"),
    };

    expect(openHours(december, arctic, daylight, 60)).toEqual([]);
  });

  it("count the minutes of light in an hour that dawn cuts in two", () => {
    // Further west on the same parallel, first light comes at about half past six UTC: the
    // hour from six has a little more light than dark, and counts as day.
    const west = { latitude: 47.84, longitude: -10.5 };
    const daylight = account({ zone: "UTC", daylightOnly: true });

    expect(hours(openHours(sea("15T04:00", "15T09:00"), west, daylight, 60))).toEqual([
      "15T06:00 - 15T09:00",
    ]);
    // A degree further, it has a little less.
    expect(
      hours(openHours(sea("15T04:00", "15T09:00"), { ...west, longitude: -11.5 }, daylight, 60)),
    ).toEqual(["15T07:00 - 15T09:00"]);
  });

  it("close an hour in which the clock is set forward past the account's hours", () => {
    // Newfoundland goes from 02:00 to 03:00 on the 8th of March 2026. The hour from 05:00 UTC
    // begins at 01:30 there and ends at 03:30: its second half is past hours that end at 03:00.
    const nights = account({
      zone: "America/St_Johns",
      week: Array(7).fill([{ from: 60, to: 180 }]),
    });
    const march = (start: string, end: string) => ({
      start: new Date(`2026-03-08T${start}:00Z`),
      end: new Date(`2026-03-08T${end}:00Z`),
    });

    expect(openHours(march("05:00", "06:00"), BEACH, nights, 60)).toEqual([]);
    // The hour before, from 00:30 to 01:30 there, begins before them.
    expect(openHours(march("04:00", "05:00"), BEACH, nights, 60)).toEqual([]);
    // With hours until 04:00, the hour is theirs whole.
    const later = account({
      zone: "America/St_Johns",
      week: Array(7).fill([{ from: 60, to: 240 }]),
    });
    expect(openHours(march("05:00", "06:00"), BEACH, later, 60)).toHaveLength(1);
  });

  it("leave out what is left of a sea window that is no whole number of hours", () => {
    expect(hours(openHours(sea("15T08:00", "15T10:30"), BEACH, ALWAYS, 60))).toEqual([
      "15T08:00 - 15T10:00",
    ]);
  });

  it("count the hours that pass when the clock is set back", () => {
    // On 25 October Paris shows the hour from 02:00 twice. An account free from midnight to 04:00
    // has five hours that night, from 22:00 to 03:00 UTC.
    const nights = account({ week: Array(7).fill([{ from: 0, to: 4 * 60 }]) });

    expect(hours(openHours(sea("24T20:00", "25T06:00"), BEACH, nights, 60))).toEqual([
      "24T22:00 - 25T03:00",
    ]);
  });
});
