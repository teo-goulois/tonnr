import { describe, expect, it } from "vitest";

import { addDays, isZone, localTime, momentOf, zoneNamed } from "./clock";

const PARIS = "Europe/Paris";

describe("the clock of an account", () => {
  it("says what day and what time a moment is in a zone", () => {
    // A Sunday evening in UTC is already Monday in Auckland.
    const moment = new Date("2026-10-11T20:30:00Z");

    expect(localTime(moment, "UTC")).toEqual({ date: "2026-10-11", weekday: 6, minutes: 1230 });
    expect(localTime(moment, PARIS)).toEqual({ date: "2026-10-11", weekday: 6, minutes: 1350 });
    expect(localTime(moment, "Pacific/Auckland")).toEqual({
      date: "2026-10-12",
      weekday: 0,
      minutes: 570,
    });
  });

  it("reads midnight as the first minute of the day", () => {
    expect(localTime(new Date("2026-10-11T22:00:00Z"), PARIS)).toEqual({
      date: "2026-10-12",
      weekday: 0,
      minutes: 0,
    });
  });

  it("finds the moment a day shows a time", () => {
    expect(momentOf("2026-10-11", 19 * 60, PARIS)).toEqual(new Date("2026-10-11T17:00:00Z"));
    expect(momentOf("2026-12-11", 19 * 60, PARIS)).toEqual(new Date("2026-12-11T18:00:00Z"));
    expect(momentOf("2026-10-11", 7 * 60, "America/Los_Angeles")).toEqual(
      new Date("2026-10-11T14:00:00Z"),
    );
    expect(momentOf("2026-10-11", 0, "UTC")).toEqual(new Date("2026-10-11T00:00:00Z"));
  });

  it("takes the first of the two moments a clock set back shows a time", () => {
    // On 25 October 2026 Paris shows 02:30 twice: at 00:30 and at 01:30 UTC.
    expect(momentOf("2026-10-25", 150, PARIS)).toEqual(new Date("2026-10-25T00:30:00Z"));
    // The evening of that day is an hour later in UTC than the evening before.
    expect(momentOf("2026-10-25", 19 * 60, PARIS)).toEqual(new Date("2026-10-25T18:00:00Z"));
    expect(momentOf("2026-10-24", 19 * 60, PARIS)).toEqual(new Date("2026-10-24T17:00:00Z"));
  });

  it("gives a moment after the gap for a time a clock set forward skips", () => {
    // On 29 March 2026 Paris goes from 02:00 to 03:00: there is no 02:30.
    const moment = momentOf("2026-03-29", 150, PARIS);

    expect(moment).toEqual(new Date("2026-03-29T01:30:00Z"));
    expect(localTime(moment, PARIS)).toMatchObject({ date: "2026-03-29", minutes: 210 });
  });

  it("goes from one day to another across a month and a year", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("knows a zone from a name that is none, and spells it one way", () => {
    expect(isZone(PARIS)).toBe(true);
    expect(isZone("Europe/Atlantis")).toBe(false);
    expect(zoneNamed("europe/paris")).toBe(PARIS);
    // Two spellings of one zone are one name, whichever the runtime prefers.
    expect(zoneNamed("AMERICA/argentina/buenos_aires")).toBe(
      zoneNamed("America/Argentina/Buenos_Aires"),
    );
    expect(zoneNamed("Europe/Atlantis")).toBeNull();
  });

  it("reads the end of a day as the beginning of the next", () => {
    expect(momentOf("2026-03-29", 1440, PARIS)).toEqual(momentOf("2026-03-30", 0, PARIS));
    expect(momentOf("2026-10-11", 1440, "UTC")).toEqual(new Date("2026-10-12T00:00:00Z"));
  });

  it("reads zones whose clocks change by half an hour, or skip a day", () => {
    // Lord Howe goes forward by thirty minutes on 4 October 2026, at 02:00.
    expect(localTime(new Date("2026-10-03T15:29:00Z"), "Australia/Lord_Howe")).toMatchObject({
      date: "2026-10-04",
      minutes: 119,
    });
    expect(localTime(new Date("2026-10-03T15:30:00Z"), "Australia/Lord_Howe")).toMatchObject({
      date: "2026-10-04",
      minutes: 150,
    });
    // Apia had no 30 December 2011.
    expect(momentOf("2011-12-30", 0, "Pacific/Apia")).toEqual(
      momentOf("2011-12-31", 0, "Pacific/Apia"),
    );
  });
});
