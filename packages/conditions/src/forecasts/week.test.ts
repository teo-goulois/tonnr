import { describe, expect, it } from "vitest";

import { type ForecastHour, localDayOf, weekOf } from "./week";

const HOUR_MS = 60 * 60 * 1000;

// Hours from a moment on, one an hour, with a sea that grows through the first day and a wind
// that turns at noon.
function hoursFrom(start: Date, count: number): ForecastHour[] {
  return Array.from({ length: count }, (_, index) => {
    const time = new Date(start.getTime() + index * HOUR_MS);
    const hour = time.getUTCHours();
    return {
      time,
      waveHeightMeters: index < 48 ? 1 + index / 24 : null,
      wavePeriodSeconds: 8,
      wavePeakPeriodSeconds: 10 + (index % 3),
      waveDirectionDegrees: 290,
      primarySwellHeightMeters: 0.8,
      primarySwellDirectionDegrees: 300,
      windSpeedMetersPerSecond: hour,
      windGustMetersPerSecond: hour + 2,
      windDirectionDegrees: hour < 12 ? 90 : 270,
      cloudCoverPercent: 50,
      precipitationMillimeters: 0.1,
      airTemperatureCelsius: 15,
    };
  });
}

describe("a day in a time zone", () => {
  it("is read in that zone", () => {
    const time = new Date("2026-10-15T23:30:00Z");
    expect(localDayOf(time, "UTC")).toEqual({ day: "2026-10-15", hour: 23 });
    expect(localDayOf(time, "Europe/Madrid")).toEqual({ day: "2026-10-16", hour: 1 });
    expect(localDayOf(time, "Pacific/Honolulu")).toEqual({ day: "2026-10-15", hour: 13 });
  });
});

describe("a week of forecast", () => {
  const now = new Date("2026-10-15T09:00:00Z");

  it("gives one line a day, from today, with the largest wave and the wind at noon", () => {
    const week = weekOf(hoursFrom(new Date("2026-10-14T00:00:00Z"), 24 * 9), "UTC", now);
    expect(week).toHaveLength(7);
    expect(week[0]).toMatchObject({
      day: "2026-10-15",
      hours: 24,
      // The sea grows through the day: its largest wave is the last hour's.
      wave: { time: new Date("2026-10-15T23:00:00Z"), heightMeters: 1 + 47 / 24 },
      wind: {
        time: new Date("2026-10-15T12:00:00Z"),
        speedMetersPerSecond: 12,
        directionDegrees: 270,
      },
      precipitationMillimeters: 2.4,
    });
    // The third day has no sea in the forecast: its wave is null, its wind is not.
    expect(week[2]).toMatchObject({
      day: "2026-10-17",
      wave: null,
      wind: { speedMetersPerSecond: 12 },
    });
  });

  it("cuts the days at the place's midnight, and leaves out a day with no hour", () => {
    const week = weekOf(hoursFrom(new Date("2026-10-15T00:00:00Z"), 30), "Europe/Madrid", now);
    // 00:00 UTC is 02:00 in Madrid: the first day has 22 hours, the second the 8 that are left.
    expect(week.map(({ day, hours }) => [day, hours])).toEqual([
      ["2026-10-15", 22],
      ["2026-10-16", 8],
    ]);
    // Noon in Madrid is 10:00 UTC, which is where the wind is read.
    expect(week[0]?.wind?.time).toEqual(new Date("2026-10-15T10:00:00Z"));
  });

  it("reads a time zone it does not know as UTC", () => {
    const week = weekOf(hoursFrom(new Date("2026-10-15T00:00:00Z"), 24), "Mars/Olympus", now);
    expect(week).toEqual([expect.objectContaining({ day: "2026-10-15", hours: 24 })]);
  });

  it("is empty when every hour is before today", () => {
    expect(weekOf(hoursFrom(new Date("2026-10-13T00:00:00Z"), 24), "UTC", now)).toEqual([]);
  });
});
