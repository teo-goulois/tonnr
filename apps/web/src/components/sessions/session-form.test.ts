import { describe, expect, it } from "vitest";

import { formatDuration } from "@/lib/format";

import { dayWords, fromFields, toClockField, toDayField } from "./session-form";

describe("the moment a session's two fields hold", () => {
  it("is written on the device's clock, and read back as the same moment", () => {
    const moment = new Date(2026, 9, 3, 7, 5);
    expect(toDayField(moment)).toBe("2026-10-03");
    expect(toClockField(moment)).toBe("07:05");
    expect(fromFields("2026-10-03", "07:05")?.getTime()).toBe(moment.getTime());
  });

  it("is none while a field is empty or holds no moment", () => {
    expect(fromFields("", "07:05")).toBeNull();
    expect(fromFields("2026-10-03", "")).toBeNull();
    expect(fromFields("not a day", "07:05")).toBeNull();
  });
});

describe("the day of a session, beside its hour", () => {
  const now = new Date(2026, 9, 3, 11, 0).getTime();

  it("is today or yesterday by the calendar, whatever the hours", () => {
    expect(dayWords(new Date(2026, 9, 3, 0, 5), now)).toBe("Today");
    expect(dayWords(new Date(2026, 9, 2, 23, 55), now)).toBe("Yesterday");
  });

  it("is its date further back", () => {
    expect(dayWords(new Date(2026, 9, 1, 8, 0), now)).toMatch(/1/);
    expect(dayWords(new Date(2026, 9, 1, 8, 0), now)).not.toBe("Yesterday");
  });
});

describe("how long a session lasted", () => {
  it("is said in minutes, in hours, or in both", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(95)).toBe("1 h 35");
    expect(formatDuration(65)).toBe("1 h 05");
  });
});
