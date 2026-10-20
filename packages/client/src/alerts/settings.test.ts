import { describe, expect, it } from "vitest";

import { clock, noticeChoices, weekdayNames } from "./settings";

describe("the settings of an account's alerts", () => {
  it("write an hour as a clock writes it, the end of a day as 24:00", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(7 * 60 + 30)).toBe("07:30");
    expect(clock(24 * 60)).toBe("24:00");
  });

  it("name the days of the week from Monday, in the reader's language", () => {
    expect(weekdayNames("en")).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(weekdayNames("fr")[0]).toBe("lundi");
  });

  it("offer four notices, and keep one set elsewhere among them in order", () => {
    expect(noticeChoices(60)).toEqual([0, 30, 60, 120]);
    expect(noticeChoices(45)).toEqual([0, 30, 45, 60, 120]);
  });
});
