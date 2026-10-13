import { describe, expect, it } from "vitest";

import { tideOver } from "./tide";

describe("the tide over a session", () => {
  // Off Brest, where the tide is predicted.
  const brest = { latitude: 48.36, longitude: -4.55 };
  const from = new Date("2026-10-10T09:05:00Z");
  const until = new Date("2026-10-10T10:35:00Z");

  it("holds the heights around the session and the turns on each side", () => {
    const tide = tideOver(brest, from, until);
    if (!tide) throw new Error("no tide");

    expect(tide.heights[0]?.time).toBe("2026-10-10T09:00:00.000Z");
    expect(tide.heights.at(-1)?.time).toBe("2026-10-10T10:45:00.000Z");
    expect(tide.heights).toHaveLength(8);
    // One turn before the session and one after, and they are not the same kind.
    expect(Date.parse(tide.extremes[0]!.time)).toBeLessThanOrEqual(from.getTime());
    expect(Date.parse(tide.extremes.at(-1)!.time)).toBeGreaterThanOrEqual(until.getTime());
    expect(tide.extremes.length).toBeGreaterThanOrEqual(2);
    expect(tide.extremes.length).toBeLessThanOrEqual(3);
    expect(tide.station.distanceKm).toBeLessThan(100);
  });

  it("is none far from any station", () => {
    // In the middle of the south Pacific.
    expect(tideOver({ latitude: -48.9, longitude: -123.4 }, from, until)).toBeNull();
  });
});
