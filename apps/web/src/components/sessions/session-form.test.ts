import { describe, expect, it } from "vitest";

import { formatDuration } from "@/lib/format";

import { fromLocalField, toLocalField, usualStart } from "./session-form";

describe("the moment a session's field holds", () => {
  it("is written in the hours of the device, and read back as the same moment", () => {
    const moment = new Date(2026, 9, 3, 7, 5);
    expect(toLocalField(moment)).toBe("2026-10-03T07:05");
    expect(fromLocalField("2026-10-03T07:05")?.getTime()).toBe(moment.getTime());
  });

  it("is none while the field is empty or holds no moment", () => {
    expect(fromLocalField("")).toBeNull();
    expect(fromLocalField("not a day")).toBeNull();
  });
});

describe("when a session that is written now is taken to have begun", () => {
  it("is an hour and a half before, on a round five minutes", () => {
    const now = new Date(2026, 9, 3, 11, 13, 40).getTime();
    expect(toLocalField(usualStart(now))).toBe("2026-10-03T09:40");
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
