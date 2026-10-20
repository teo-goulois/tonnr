import { describe, expect, it } from "vitest";

import {
  dayWords,
  distanceKm,
  isAhead,
  nearestPlace,
  startFromPhoto,
  usualStart,
  withClock,
  withDay,
  withinLengths,
} from "./session-logic";

describe("when a session that is written now is taken to have begun", () => {
  it("is an hour and a half before, on a round five minutes", () => {
    const now = new Date(2026, 9, 3, 11, 13, 40).getTime();
    expect(usualStart(now).getTime()).toBe(new Date(2026, 9, 3, 9, 40).getTime());
  });

  it("is never later than a quarter of an hour ahead of the clock", () => {
    const now = new Date(2026, 9, 3, 11, 0).getTime();
    expect(isAhead(new Date(2026, 9, 3, 11, 15), now)).toBe(false);
    expect(isAhead(new Date(2026, 9, 3, 11, 20), now)).toBe(true);
  });

  it("is the first photo's moment, on five minutes, when it is of the past", () => {
    const now = new Date(2026, 9, 19, 12, 0).getTime();
    expect(startFromPhoto(new Date(2026, 9, 19, 8, 12, 33), now)?.getTime()).toBe(
      new Date(2026, 9, 19, 8, 10).getTime(),
    );
    expect(startFromPhoto(new Date(2026, 9, 19, 13, 0), now)).toBeNull();
    expect(startFromPhoto(new Date(2001, 0, 1), now)).toBeNull();
    expect(startFromPhoto(null, now)).toBeNull();
  });
});

describe("the day and the hour of a session, each set by its own picker", () => {
  it("keep each other as one changes", () => {
    const start = new Date(2026, 9, 18, 7, 45);
    expect(withDay(start, new Date(2026, 9, 12, 23, 0)).getTime()).toBe(
      new Date(2026, 9, 12, 7, 45).getTime(),
    );
    expect(withClock(start, new Date(2026, 0, 1, 16, 5)).getTime()).toBe(
      new Date(2026, 9, 18, 16, 5).getTime(),
    );
  });

  it("are said as today or yesterday by the calendar, whatever the hours", () => {
    const now = new Date(2026, 9, 3, 11, 0).getTime();
    expect(dayWords(new Date(2026, 9, 3, 0, 5), now)).toBe("Today");
    expect(dayWords(new Date(2026, 9, 2, 23, 55), now)).toBe("Yesterday");
    expect(dayWords(new Date(2026, 9, 1, 8, 0), now)).not.toBe("Yesterday");
  });
});

describe("a length of one's own", () => {
  it("is five minutes at a time, from a quarter of an hour to eight hours", () => {
    expect(withinLengths(5)).toBe(15);
    expect(withinLengths(97)).toBe(95);
    expect(withinLengths(600)).toBe(480);
  });
});

describe("where a new session most likely was", () => {
  const places = [
    { id: "parlementia", latitude: 43.4189, longitude: -1.6078 },
    { id: "avalanche", latitude: 43.4159, longitude: -1.6055 },
    { id: "hossegor", latitude: 43.6646, longitude: -1.4461 },
  ];

  it("is the nearest of the places offered, within twenty kilometres", () => {
    expect(nearestPlace(places, { latitude: 43.4161, longitude: -1.6058 })?.id).toBe("avalanche");
    expect(nearestPlace(places, { latitude: 43.66, longitude: -1.44 })?.id).toBe("hossegor");
  });

  it("is none when the phone is far from all of them, or says nothing", () => {
    expect(nearestPlace(places, { latitude: 48.85, longitude: 2.35 })).toBeNull();
    expect(nearestPlace(places, null)).toBeNull();
    expect(nearestPlace([], { latitude: 43.4, longitude: -1.6 })).toBeNull();
  });

  it("is measured on the earth", () => {
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
      111.2,
      1,
    );
  });
});
