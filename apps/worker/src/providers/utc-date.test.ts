import { describe, expect, it } from "vitest";

import { parseUtcTime } from "./utc-date";

describe("parseUtcTime", () => {
  it("reads a UTC time, with or without a fraction of a second", () => {
    expect(parseUtcTime("2026-10-08T07:00:00Z")).toEqual(new Date(Date.UTC(2026, 9, 8, 7)));
    expect(parseUtcTime("2026-10-08T08:19:47.000Z")).toEqual(
      new Date(Date.UTC(2026, 9, 8, 8, 19, 47)),
    );
  });

  it("refuses a day that does not exist", () => {
    expect(parseUtcTime("2026-02-31T07:00:00Z")).toBeNull();
    expect(parseUtcTime("2026-13-01T07:00:00Z")).toBeNull();
  });

  it("refuses a time that is not written in UTC", () => {
    expect(parseUtcTime("2026-10-08T07:00:00")).toBeNull();
    expect(parseUtcTime("2026-10-08T07:00:00+10:00")).toBeNull();
    expect(parseUtcTime("2026-10-08")).toBeNull();
    expect(parseUtcTime("")).toBeNull();
  });

  it("refuses a time no observation can have", () => {
    expect(parseUtcTime("1899-12-31T23:59:59Z")).toBeNull();
    expect(parseUtcTime("9999-01-01T00:00:00Z")).toBeNull();
  });
});
