import { describe, expect, it } from "vitest";

import { endOfLastWholeDay, goingTo, levelsOf, seaArrowsReader, seaTimeAt, seaTimes } from "./sea";

const HOUR = 60 * 60 * 1000;
const STEP = 3 * HOUR;

// The reader's own clock, as the timeline reads it: the dates are local ones, in a month that no
// change of the clocks crosses.
const local = (day: number, hour: number) => new Date(2026, 5, day, hour).getTime();

describe("the moments the sea is shown at", () => {
  const fields = {
    start: new Date(local(19, 0)),
    end: new Date(local(29, 3)),
    stepSeconds: 3 * 3600,
  };

  it("is the model's latest field that is not in the future", () => {
    const times = seaTimes(fields, local(19, 10) + 30 * 60 * 1000);
    expect(times?.present).toBe(local(19, 9));
    expect(seaTimeAt(times!)).toBe(local(19, 9));
    expect(times?.stepMs).toBe(STEP);
  });

  it("goes a day back, and no further than the model's first field", () => {
    expect(seaTimes(fields, local(21, 10))?.earliest).toBe(local(20, 9));
    expect(seaTimes(fields, local(19, 10))?.earliest).toBe(local(19, 0));
  });

  it("stops at the last whole day of the model, and shows it once past", () => {
    const times = seaTimes(fields, local(29, 3) + 30 * HOUR)!;
    // The field of 3 o'clock on the 29th spills into a day the model does not finish.
    expect(times.latest).toBe(local(28, 21));
    expect(seaTimeAt(times)).toBe(local(28, 21));
  });

  it("moves a step at a time, within those bounds", () => {
    const times = seaTimes(fields, local(20, 10))!;
    expect(seaTimeAt(times, 2)).toBe(local(20, 15));
    expect(seaTimeAt(times, -100)).toBe(times.earliest);
    expect(seaTimeAt(times, 1000)).toBe(times.latest);
  });

  it("keeps a last field that ends its day", () => {
    expect(endOfLastWholeDay(local(28, 21), STEP)).toBe(local(28, 21));
  });

  it("is none for a model that says no step", () => {
    expect(seaTimes({ ...fields, stepSeconds: 0 }, Date.now())).toBeUndefined();
    expect(seaTimes(undefined, Date.now())).toBeUndefined();
  });
});

describe("the arrows on the sea", () => {
  const tiles = {
    tileUrlTemplate: "https://d/{z}/{x}/{y}?time={time}",
    encoding: { degreesByLevel: Array.from({ length: 256 }, (_, level) => (level * 360) / 256) },
  };
  const view = { west: -10, south: 40, east: 0, north: 48, zoom: 5 };
  const time = new Date("2026-10-19T09:00:00Z");
  // A tile of 4 by 4 pixels from the west, 270°, but for one pixel that has no sea.
  const westerly = () => {
    const levels = new Int16Array(16).fill(192);
    levels[0] = -1;
    return levels;
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("asks for the tiles it needs once, and draws from them as they come", async () => {
    const asked: string[] = [];
    const arrows = seaArrowsReader(async (address) => {
      asked.push(address);
      return westerly();
    });
    let loaded = 0;
    expect(arrows(view, time, tiles, () => loaded++)).toEqual([]);
    expect(arrows(view, time, tiles, () => loaded++)).toEqual([]);
    await settle();
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked[0]).toContain("time=2026-10-19T09%3A00%3A00.000Z");
    expect(loaded).toBe(asked.length);

    const drawn = arrows(view, time, tiles, () => loaded++);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((arrow) => arrow.fromDegrees === 270)).toBe(true);
    expect(goingTo(drawn[0]!.fromDegrees)).toBe(90);
  });

  it("draws across the antimeridian, where the view's west is greater than its east", async () => {
    const arrows = seaArrowsReader(async () => westerly());
    const pacific = { west: 175, south: -20, east: -175, north: -10, zoom: 5 };
    arrows(pacific, time, tiles, () => {});
    await settle();
    const drawn = arrows(pacific, time, tiles, () => {});
    expect(drawn.length).toBeGreaterThan(0);
    // Both sides of the line, the east counted past 180 as the map counts it there.
    expect(drawn.some((arrow) => arrow.longitude < 180)).toBe(true);
    expect(drawn.some((arrow) => arrow.longitude > 180)).toBe(true);
    expect(drawn.every((arrow) => arrow.longitude >= 175 && arrow.longitude <= 185)).toBe(true);
  });

  it("draws nothing from a tile that could not be read", async () => {
    const arrows = seaArrowsReader(async () => {
      throw new Error("no answer");
    });
    arrows(view, time, tiles, () => {});
    await settle();
    expect(arrows(view, time, tiles, () => {})).toEqual([]);
  });

  it("reads a transparent pixel as no sea", () => {
    expect([...levelsOf([10, 10, 10, 255, 0, 0, 0, 0])]).toEqual([10, -1]);
  });
});
