import { describe, expect, it } from "vitest";

import { parseZonedTime } from "./utc-date";

describe("parseZonedTime", () => {
  it("reads a UTC time, with or without a fraction of a second", () => {
    expect(parseZonedTime("2026-10-08T07:00:00Z")).toEqual(new Date(Date.UTC(2026, 9, 8, 7)));
    expect(parseZonedTime("2026-10-08T08:19:47.000Z")).toEqual(
      new Date(Date.UTC(2026, 9, 8, 8, 19, 47)),
    );
  });

  it("reads a UTC time written with a zero offset", () => {
    expect(parseZonedTime("2026-10-08T04:00:00.000+00:00")).toEqual(
      new Date(Date.UTC(2026, 9, 8, 4)),
    );
    expect(parseZonedTime("2026-02-31T04:00:00+00:00")).toBeNull();
  });

  it("refuses a day that does not exist", () => {
    expect(parseZonedTime("2026-02-31T07:00:00Z")).toBeNull();
    expect(parseZonedTime("2026-13-01T07:00:00Z")).toBeNull();
  });

  it("reads a time written in another zone, or without seconds, as the moment it names", () => {
    expect(parseZonedTime("2026-10-08T17:00:00+10:00")).toEqual(new Date(Date.UTC(2026, 9, 8, 7)));
    expect(parseZonedTime("2026-10-08T02:30:00-04:30")).toEqual(new Date(Date.UTC(2026, 9, 8, 7)));
    expect(parseZonedTime("2026-10-08T06:32Z")).toEqual(new Date(Date.UTC(2026, 9, 8, 6, 32)));
    expect(parseZonedTime("2026-02-31T17:00:00+10:00")).toBeNull();
  });

  it("refuses a fraction when the seconds are not written", () => {
    expect(parseZonedTime("2026-10-08T07:00.5Z")).toBeNull();
    expect(parseZonedTime("2026-10-08T07:00:00.5Z")).toEqual(
      new Date(Date.UTC(2026, 9, 8, 7, 0, 0, 500)),
    );
  });

  it("refuses a time that names no zone", () => {
    expect(parseZonedTime("2026-10-08T07:00:00")).toBeNull();
    expect(parseZonedTime("2026-10-08")).toBeNull();
    expect(parseZonedTime("")).toBeNull();
    expect(parseZonedTime("2026-10-08T07:00:00+25:00")).toBeNull();
  });

  it("refuses a time no observation can have", () => {
    expect(parseZonedTime("1899-12-31T23:59:59Z")).toBeNull();
    expect(parseZonedTime("9999-01-01T00:00:00Z")).toBeNull();
  });
});
