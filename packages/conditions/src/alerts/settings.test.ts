import { describe, expect, it } from "vitest";

import { openHours } from "./open";
import {
  DEFAULT_SETTINGS,
  type AlertSettings,
  availabilityOf,
  cutOf,
  endOfToday,
} from "./settings";

// An alert paused by "Not today", beside the account's own absence: decision 072.
const BEACH = { latitude: 47.84, longitude: -4.35 };
const at = (time: string) => new Date(`2026-10-${time}:00Z`);
const account = (more: Partial<AlertSettings> = {}): AlertSettings => ({
  ...DEFAULT_SETTINGS,
  zone: "Europe/Paris",
  daylightOnly: false,
  ...more,
});
const hours = (pieces: { start: Date; end: Date }[]) =>
  pieces.map(
    (piece) =>
      `${piece.start.toISOString().slice(8, 16)} - ${piece.end.toISOString().slice(8, 16)}`,
  );

describe("an alert that its owner paused for the day", () => {
  it("opens no hour before its pause ends, as an account that is away opens none", () => {
    const paused = { awayUntil: at("15T22:00") };
    const sea = { start: at("15T18:00"), end: at("16T02:00") };

    expect(hours(openHours(sea, BEACH, availabilityOf(account(), paused), 120))).toEqual([
      "15T22:00 - 16T02:00",
    ]);
    // Without the alert, the account's own hours alone.
    expect(hours(openHours(sea, BEACH, availabilityOf(account()), 120))).toEqual([
      "15T18:00 - 16T02:00",
    ]);
  });

  it("waits for the later of the two pauses, the account's or the alert's", () => {
    const later = account({ awayUntil: at("17T00:00") });
    const earlier = account({ awayUntil: at("15T08:00") });
    const paused = { awayUntil: at("15T22:00") };

    expect(availabilityOf(later, paused).awayUntil).toEqual(at("17T00:00"));
    expect(availabilityOf(earlier, paused).awayUntil).toEqual(at("15T22:00"));
    expect(availabilityOf(earlier, { awayUntil: null }).awayUntil).toEqual(at("15T08:00"));
  });

  it("cuts its hours otherwise, so that the next look brings what it told in line", () => {
    const settings = account();
    const alert = { shortestMinutes: 120, awayUntil: null };

    expect(cutOf(settings, { ...alert, awayUntil: at("15T22:00") })).not.toBe(
      cutOf(settings, alert),
    );
    // An alert that was never paused is cut as it was before pauses were.
    expect(cutOf(settings, alert)).toBe(
      cutOf(account({ awayUntil: null }), { shortestMinutes: 120, awayUntil: null }),
    );
    // A pause that the account's own absence covers changes nothing.
    const away = account({ awayUntil: at("20T00:00") });
    expect(cutOf(away, { ...alert, awayUntil: at("15T22:00") })).toBe(cutOf(away, alert));
  });
});

describe("the end of the account's day, which “Not today” pauses an alert until", () => {
  it("is its next midnight, on its own calendar and clock", () => {
    // Half past eleven at night in Paris is still the 15th there.
    expect(endOfToday(at("15T21:30"), account())).toEqual(at("15T22:00"));
    // And half past midnight is the 16th already.
    expect(endOfToday(at("15T22:30"), account())).toEqual(at("16T22:00"));
    expect(endOfToday(at("15T21:30"), account({ zone: "America/New_York" }))).toEqual(
      at("16T04:00"),
    );
  });

  it("is UTC's for an account whose time zone is not known yet", () => {
    expect(endOfToday(at("15T21:30"), account({ zone: null }))).toEqual(at("16T00:00"));
  });

  it("follows the clock on the day it is set back", () => {
    // Paris leaves summer time early on 25 October 2026: the day before ends in summer time,
    // and that day, of 25 hours, in winter time.
    expect(endOfToday(at("24T08:00"), account())).toEqual(at("24T22:00"));
    expect(endOfToday(at("25T08:00"), account())).toEqual(at("25T23:00"));
  });
});
