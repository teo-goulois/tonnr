import { describe, expect, it } from "vitest";

import type { Station } from "../viewer/types";
import {
  BUOY_BOX,
  describeStation,
  describeWind,
  GAUGE,
  GAUGE_CHIP,
  gaugeDashes,
  type MarkerWords,
  MAX_MARKERS,
  opensLeft,
  overlaps,
  placeMarkers,
  rankStations,
  sameMarkers,
  WIND_LIFT,
} from "./markers";

const NOW = Date.UTC(2026, 9, 22, 12);
const MINUTE = 60 * 1000;

const WORDS: MarkerWords = {
  formatHeight: (meters) => `${meters} m`,
  formatSeconds: (seconds) => `${seconds} s`,
  formatWind: (knots) => `${Math.round(knots)} kn`,
  compassPoint: (degrees) => (degrees === 270 ? "W" : "?"),
  formatAgo: (date, now) => `${Math.round((now - date.getTime()) / MINUTE)} min ago`,
  map_from: ({ direction }) => `from ${direction}`,
  map_wind_speed: ({ speed }) => `wind ${speed}`,
};

function station(reading: Record<string, unknown> | null, minutesAgo = 20): Station {
  return {
    id: "brest",
    name: "Brest",
    latitude: 48.3,
    longitude: -4.6,
    exposure: "open",
    latestReading: reading && { observedAt: new Date(NOW - minutesAgo * MINUTE), ...reading },
  } as unknown as Station;
}

describe("what a marker says", () => {
  it("is a buoy's height, period, direction and age, saved or not", () => {
    const described = describeStation(
      station({
        significantHeightMeters: 2.7,
        peakPeriodSeconds: 12,
        peakDirectionDegrees: 270,
      }),
      NOW,
      new Set(["brest"]),
      WORDS,
    );
    expect(described).toMatchObject({
      heightMeters: 2.7,
      periodSeconds: 12,
      directionDegrees: 270,
      freshness: "fresh",
      isSaved: true,
      isSheltered: false,
      label: "Brest, 2.7 m, 12 s, from W, 20 min ago",
    });
  });

  it("is a buoy's name alone once its reading is too old to show", () => {
    const described = describeStation(
      station({ significantHeightMeters: 2.7 }, 7 * 60),
      NOW,
      new Set(),
      WORDS,
    );
    expect(described).toMatchObject({ heightMeters: null, freshness: "none", label: "Brest" });
  });

  it("is a wind's speed in knots and where it comes from, and none once two hours old", () => {
    const blowing = { windSpeedMetersPerSecond: 5, windDirectionDegrees: 270 };
    expect(describeWind(station(blowing), NOW, WORDS)).toMatchObject({
      speedKnots: expect.closeTo(9.72, 2),
      label: "Brest, wind 10 kn, from W",
    });
    expect(describeWind(station(blowing, 121), NOW, WORDS)).toBeNull();
    expect(describeWind(station({ windSpeedMetersPerSecond: null }), NOW, WORDS)).toBeNull();
  });
});

describe("the gauge of a buoy's pill", () => {
  it("leaves a chip of 19 points inside its ring", () => {
    expect(GAUGE_CHIP).toBe(19);
  });

  it("lights six bars when fresh, four, two, then none, each followed by its gap", () => {
    const sum = (dashes: number[]) => dashes.reduce((total, length) => total + length, 0);
    for (const [freshness, lit] of [
      ["fresh", 6],
      ["aging", 4],
      ["old", 2],
    ] as const) {
      const dashes = gaugeDashes(freshness).lit!;
      expect(dashes).toHaveLength(lit * 2);
      // The dashes go once round the circle, measured in bars.
      expect(sum(dashes)).toBeCloseTo(GAUGE.bars);
    }
    expect(gaugeDashes("none").lit).toBeNull();
    expect(gaugeDashes("aging").track).toEqual([0.85, 0.15]);
    expect(gaugeDashes("aging").offset).toBeCloseTo(-0.075);
  });

  it("measures the same dashes in points where a circle cannot be measured in bars", () => {
    const slot = 10;
    expect(gaugeDashes("old", slot).lit).toEqual([8.5, 1.5, 8.5, 41.5]);
    expect(gaugeDashes("old", slot).offset).toBeCloseTo(-0.75);
  });
});

type Buoy = Parameters<typeof rankStations>[0][number] & { longitude: number; latitude: number };
const buoy = (id: string, heightMeters: number | null, more: Partial<Buoy> = {}): Buoy => ({
  id,
  heightMeters,
  isSaved: false,
  isSheltered: false,
  longitude: 0,
  latitude: 0,
  ...more,
});

describe("which buoys have a marker first", () => {
  it("is the selected one, the saved ones, the open sea, then the biggest seas", () => {
    const ranked = rankStations(
      [
        buoy("small", 0.5),
        buoy("big", 4),
        buoy("harbour", 6, { isSheltered: true }),
        buoy("saved", 0.2, { isSaved: true }),
        buoy("silent", null),
        buoy("selected", 0.1),
      ],
      "selected",
    );
    expect(ranked.map((one) => one.id)).toEqual(["selected", "saved", "big", "small", "harbour"]);
  });
});

describe("where the markers stand", () => {
  const size = { width: 390, height: 844 };
  const middle = { x: size.width / 2, y: size.height / 2 };
  // A projection that puts each point where its longitude and latitude say, in points.
  const flat = (longitude: number, latitude: number) => ({
    x: middle.x + longitude,
    y: middle.y - latitude,
  });

  it("leaves out a marker that would cover one placed before it, and one off the map", () => {
    const placed = placeMarkers({
      buoys: [
        buoy("first", 3),
        buoy("covered", 2, { longitude: BUOY_BOX.width - 1 }),
        buoy("beside", 1, { longitude: BUOY_BOX.width }),
        buoy("away", 1, { longitude: 400 }),
      ],
      wind: null,
      selectedId: undefined,
      project: flat,
      size,
    });
    expect(placed.map((one) => one.key)).toEqual(["buoy:first", "buoy:beside"]);
    expect(placed[0]).toMatchObject({ kind: "buoy", id: "first", ...middle });
  });

  it("always places the selected buoy, and lifts a wind badge over its point", () => {
    const placed = placeMarkers({
      buoys: [buoy("first", 3), buoy("selected", 1, { longitude: 10 })],
      wind: [{ id: "wind", longitude: 0, latitude: 60 }],
      selectedId: "selected",
      project: flat,
      size,
    });
    expect(placed.map((one) => one.key)).toEqual(["buoy:first", "buoy:selected", "wind:wind"]);
    expect(placed[2]).toMatchObject({ x: middle.x, y: middle.y - 60 - WIND_LIFT });
  });

  it("draws no more than the most markers, the selected one aside", () => {
    // Two hundred buoys in a grid, each clear of its neighbours.
    const many = Array.from({ length: 200 }, (_, index) =>
      buoy(`b${index}`, 1, {
        longitude: 200 + (index % 10) * 110,
        latitude: 200 + Math.floor(index / 10) * 40,
      }),
    );
    const placed = placeMarkers({
      buoys: [...many, buoy("selected", 1)],
      wind: null,
      selectedId: "selected",
      project: (longitude, latitude) => ({ x: longitude, y: latitude }),
      size: { width: 10_000, height: 10_000 },
    });
    expect(placed).toHaveLength(MAX_MARKERS + 1);
    expect(placed.at(-1)?.id).toBe("selected");
  });

  it("knows when two layouts draw the same markers", () => {
    const one = { key: "buoy:a", kind: "buoy" as const, id: "a" };
    const other = { key: "wind:b", kind: "wind" as const, id: "b" };
    expect(sameMarkers([one, other], [{ ...one }, { ...other }])).toBe(true);
    expect(sameMarkers([one, other], [other, one])).toBe(false);
    expect(sameMarkers([one], [one, other])).toBe(false);
  });

  it("tells boxes that touch from boxes that cover each other", () => {
    const box = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(overlaps(box, [{ left: 10, top: 0, right: 20, bottom: 10 }])).toBe(false);
    expect(overlaps(box, [{ left: 9, top: 9, right: 20, bottom: 20 }])).toBe(true);
  });
});

describe("the pill of the break in hand", () => {
  it("opens to the left when the right has no room for it and the left has", () => {
    expect(opensLeft({ x: 300, pillWidth: 120, mapWidth: 390 })).toBe(true);
    expect(opensLeft({ x: 200, pillWidth: 120, mapWidth: 390 })).toBe(false);
    expect(opensLeft({ x: 100, pillWidth: 320, mapWidth: 390 })).toBe(false);
    expect(opensLeft({ x: 200, pillWidth: 120, mapWidth: 390, coveredRight: 100 })).toBe(true);
  });
});
