import { describe, expect, it } from "vitest";

import {
  awayDay,
  awayMoment,
  dateOfDay,
  dateOfMinutes,
  dayOf,
  dayWords,
  minutesOf,
  noticeWords,
  oneStretch,
  weekdays,
  weekWith,
} from "./alert-settings-words";

describe("the hours of the alerts' settings", () => {
  it("name the days of the week from Monday, each as a row's title begins", () => {
    expect(weekdays("en")[0]).toBe("Monday");
    expect(weekdays("fr")[0]).toBe("Lundi");
  });

  it("say a day's hours, or that it is not one the account can go", () => {
    expect(dayWords([])).toBe("Not this day");
    expect(dayWords([{ from: 0, to: 1440 }])).toBe("All day");
    expect(
      dayWords([
        { from: 360, to: 540 },
        { from: 1020, to: 1260 },
      ]),
    ).toBe("06:00–09:00, 17:00–21:00");
    expect(
      oneStretch([
        { from: 360, to: 540 },
        { from: 1020, to: 1260 },
      ]),
    ).toEqual({ from: 360, to: 1260 });
    expect(oneStretch([])).toBeUndefined();
  });

  it("change one day and keep the others, from a week given or none", () => {
    const week = weekWith(null, 2, [{ from: 0, to: 1440 }]);
    expect(week).toHaveLength(7);
    expect(week[2]).toEqual([{ from: 0, to: 1440 }]);
    expect(week[0]).toEqual([]);
    expect(weekWith(week, 0, [{ from: 60, to: 120 }])[2]).toEqual([{ from: 0, to: 1440 }]);
  });
});

describe("the notice before a window begins", () => {
  it("is said in hours when it is whole hours", () => {
    expect(noticeWords(0)).toBe("At the start");
    expect(noticeWords(120)).toContain("2");
    expect(noticeWords(30)).toContain("30");
  });
});

describe("the day an account is away until", () => {
  it("is a day of its own calendar, and its first minute there", () => {
    const moment = awayMoment("2026-10-24", "Europe/Paris");
    expect(moment.toISOString()).toBe("2026-10-23T22:00:00.000Z");
    expect(awayDay(moment, "Europe/Paris")).toBe("2026-10-24");
    expect(awayDay(null, "Europe/Paris")).toBe("");
  });

  it("goes to and from a picker in the phone's own time", () => {
    expect(dayOf(dateOfDay("2026-02-03"))).toBe("2026-02-03");
    expect(minutesOf(dateOfMinutes(21 * 60 + 15))).toBe(21 * 60 + 15);
  });
});
