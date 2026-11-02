import { describe, expect, it } from "vitest";

import { daylightOf } from "./daylight";

// The reader's clock is Paris's, whichever machine runs the test.
process.env.TZ = "Europe/Paris";

// Brest.
const PLACE = { latitude: 48.39, longitude: -4.49 };
const MINUTE = 60 * 1000;

const clock = (date: Date | null) =>
  date?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

describe("daylightOf", () => {
  it("gives today's first light, sunrise, sunset and last light, in that order", () => {
    // 2 November 2026, at noon in Paris.
    const day = daylightOf(new Date(2026, 10, 2, 12).getTime(), PLACE);
    expect(day.day).toBe("today");
    // What Apple's Weather said for Brest that day.
    expect([day.firstLight, day.sunrise, day.sunset, day.lastLight].map(clock)).toEqual([
      "07:32",
      "08:05",
      "17:57",
      "18:30",
    ]);
    const moments = [day.firstLight, day.sunrise, day.sunset, day.lastLight].map((moment) =>
      moment!.getTime(),
    );
    expect(moments).toEqual([...moments].sort((a, b) => a - b));
    // Civil twilight lasts about half an hour there in November.
    const dawn = (moments[1]! - moments[0]!) / MINUTE;
    expect(dawn).toBeGreaterThan(30);
    expect(dawn).toBeLessThan(40);
  });

  it("gives tomorrow's once today's last light is gone", () => {
    const evening = new Date(2026, 10, 2, 22).getTime();
    const day = daylightOf(evening, PLACE);
    expect(day.day).toBe("tomorrow");
    expect(day.firstLight!.getDate()).toBe(3);
    expect(day.firstLight!.getTime()).toBeGreaterThan(evening);
  });

  it("says nothing of a crossing the sun does not make", () => {
    // Midsummer in Tromsø: the sun never sets, and the night never comes.
    const day = daylightOf(new Date(2026, 5, 21, 12).getTime(), {
      latitude: 69.65,
      longitude: 18.96,
    });
    expect(day).toEqual({
      firstLight: null,
      sunrise: null,
      sunset: null,
      lastLight: null,
      day: "today",
    });
  });
});
