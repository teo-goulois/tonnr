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

    // Dawn cuts the hour from 06:00 UTC, and dusk the one from 17:00: an hour is day or night
    // by its middle, and both are night.
    expect(hours(openHours(sea("15T02:00", "15T09:00"), BEACH, daylight, 120))).toEqual([
      "15T07:00 - 15T09:00",
    ]);
    // A window that runs through the night comes in two pieces.
    expect(hours(openHours(sea("15T15:00", "16T09:00"), BEACH, daylight, 120))).toEqual([
      "15T15:00 - 15T17:00",
      "16T07:00 - 16T09:00",
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

  it("are none until the end of a pause", () => {
    const paused = account({ pausedUntil: at("15T10:00") });

    expect(hours(openHours(sea("15T06:00", "15T14:00"), BEACH, paused, 120))).toEqual([
      "15T10:00 - 15T14:00",
    ]);
    expect(openHours(sea("15T06:00", "15T11:00"), BEACH, paused, 120)).toEqual([]);
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
