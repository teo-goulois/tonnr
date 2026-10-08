import { describe, expect, it } from "vitest";

import {
  classifyExposure,
  nextExposure,
  wholeDaysBefore,
  type DailyHeight,
  type Site,
} from "./exposure";

// Six buoys along an open coast, five kilometres apart, and one site up an estuary.
const coast: Site[] = Array.from({ length: 6 }, (_, index) => ({
  id: `sea-${index}`,
  latitude: 51.5 + index * 0.05,
  longitude: 3,
}));
const estuary: Site = { id: "estuary", latitude: 51.6, longitude: 3.3 };
const ROUGH_DAYS = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"] as const;

function day(
  date: string,
  seaM: number,
  others: Record<string, number> = {},
  sea: readonly Site[] = coast,
): DailyHeight[] {
  return [
    ...sea.map((site) => ({ stationId: site.id, day: date, heightM: seaM })),
    ...Object.entries(others).map(([stationId, heightM]) => ({ stationId, day: date, heightM })),
  ];
}

/** The verdict on the estuary after as many days of a 2 m sea as it has heights. */
function estuaryAfter(heights: number[], sea: readonly Site[] = coast, seaM = 2) {
  const days = heights.flatMap((heightM, index) =>
    day(ROUGH_DAYS[index] ?? "", seaM, { estuary: heightM }, sea),
  );
  return classifyExposure([...sea, estuary], days).get("estuary");
}

describe("classifyExposure", () => {
  it("calls a site sheltered when it stays low on three rough days among five places", () => {
    const verdicts = classifyExposure(
      [...coast, estuary],
      ROUGH_DAYS.slice(0, 3).flatMap((date) => day(date, 2.8, { estuary: 0.15 })),
    );

    expect(verdicts.get("estuary")).toBe("sheltered");
    expect(coast.every((site) => verdicts.get(site.id) === "open")).toBe(true);
  });

  it("says nothing on calm days, when a low site looks like every other", () => {
    const verdicts = classifyExposure(
      [...coast, estuary],
      ROUGH_DAYS.flatMap((date) => day(date, 0.4, { estuary: 0.05 })),
    );

    expect(verdicts.size).toBe(0);
  });

  it("waits for three low days before calling a site sheltered", () => {
    expect(estuaryAfter([0.1, 0.1])).toBeUndefined();
    expect(estuaryAfter([0.1, 0.1, 0.1])).toBe("sheltered");
  });

  it("calls a site sheltered under a fifth of its neighbours' waves, not at a fifth", () => {
    expect(estuaryAfter([0.1, 0.1, 0.39])).toBe("sheltered");
    expect(estuaryAfter([0.1, 0.1, 0.4])).toBe("unclear");
  });

  it("doubts a site as soon as one rough day was not low", () => {
    expect(estuaryAfter([0.6])).toBe("unclear");
    expect(estuaryAfter([0.1, 0.1, 0.1, 0.6])).toBe("unclear");
  });

  it("calls a site open on its second day at half its neighbours' waves", () => {
    expect(estuaryAfter([1])).toBe("unclear");
    // In the lee of the land for two swells, in the open for two others.
    expect(estuaryAfter([0.1, 1, 0.1, 1])).toBe("open");
    expect(estuaryAfter([1, 0.99])).toBe("unclear");
  });

  it("asks for five rough places before a low day counts", () => {
    expect(estuaryAfter([0.1, 0.1, 0.1], coast.slice(0, 4))).toBeUndefined();
    expect(estuaryAfter([0.1, 0.1, 0.1], coast.slice(0, 5))).toBe("sheltered");
  });

  it("asks for three rough places before a day says anything", () => {
    expect(estuaryAfter([2, 2], coast.slice(0, 2))).toBeUndefined();
    expect(estuaryAfter([2, 2], coast.slice(0, 3))).toBe("open");
  });

  it("counts a place as rough from one metre", () => {
    expect(estuaryAfter([0.99, 0.99], coast, 0.99)).toBeUndefined();
    expect(estuaryAfter([1, 1], coast, 1)).toBe("open");
  });

  it("is not moved by one loud neighbour among quiet ones", () => {
    const heights = ROUGH_DAYS.flatMap((date) =>
      day(date, 0.1, { "sea-2": 2, estuary: 0.6 }, coast.slice(0, 2)),
    );

    expect(classifyExposure([...coast.slice(0, 3), estuary], heights).has("estuary")).toBe(false);
  });

  it("compares a site with the rough places only, so sheltered neighbours do not lower the bar", () => {
    const basin: Site[] = Array.from({ length: 8 }, (_, index) => ({
      id: `basin-${index}`,
      latitude: 51.55 + index * 0.03,
      longitude: 3.4,
    }));
    const low = Object.fromEntries(basin.map((site) => [site.id, 0.2]));
    const verdicts = classifyExposure(
      [...coast, ...basin],
      ROUGH_DAYS.flatMap((date) => day(date, 2.8, low)),
    );

    expect(basin.every((site) => verdicts.get(site.id) === "sheltered")).toBe(true);
    expect(coast.every((site) => verdicts.get(site.id) === "open")).toBe(true);
  });

  it("looks only at the places within sixty kilometres", () => {
    // 0.53 degrees of latitude is 59 km, and 0.55 is 61 km.
    const sea = (latitude: number): Site[] =>
      coast
        .slice(0, 3)
        .map((site) => ({ ...site, latitude, longitude: 3 + Number(site.id.at(-1)) * 0.05 }));
    const site: Site = { id: "estuary", latitude: 51, longitude: 3.05 };
    const verdictWith = (neighbours: Site[]) =>
      classifyExposure(
        [...neighbours, site],
        ROUGH_DAYS.flatMap((date) => day(date, 2, { estuary: 2 }, neighbours)),
      ).get("estuary");

    expect(verdictWith(sea(51.53))).toBe("open");
    expect(verdictWith(sea(51.55))).toBeUndefined();
  });

  it("compares a site with the median of the rough places, not the highest or the lowest", () => {
    const [first] = coast;
    const verdictWith = (firstM: number, estuaryM: number) =>
      classifyExposure(
        [...coast, estuary],
        ROUGH_DAYS.slice(0, 2).flatMap((date) =>
          day(date, 2, { [first?.id ?? ""]: firstM, estuary: estuaryM }),
        ),
      ).get("estuary");

    expect(verdictWith(6, 1)).toBe("open");
    expect(verdictWith(1, 0.9)).toBe("unclear");
  });

  it("takes the middle of the two middle places when their number is even", () => {
    const sea = coast.slice(0, 4);
    const days = ROUGH_DAYS.slice(0, 2).flatMap((date) =>
      sea.map((site, index) => ({
        stationId: site.id,
        day: date,
        heightM: [1, 2, 4, 6][index] ?? 0,
      })),
    );
    const verdictWith = (estuaryM: number) =>
      classifyExposure(
        [...sea, estuary],
        [
          ...days,
          ...ROUGH_DAYS.slice(0, 2).flatMap((date) => day(date, 0, { estuary: estuaryM }, [])),
        ],
      ).get("estuary");

    // Half of 3 m, the middle of 2 m and 4 m.
    expect(verdictWith(1.5)).toBe("open");
    expect(verdictWith(1.49)).toBe("unclear");
  });

  it("doubts a site on a day that is not low, even among three places", () => {
    expect(estuaryAfter([0.6], coast.slice(0, 3))).toBe("unclear");
    expect(estuaryAfter([0.1], coast.slice(0, 3))).toBeUndefined();
  });

  it("counts stations within two kilometres as one place", () => {
    // 0.01 degrees of latitude is 1.1 km, and 0.03 is 3.3 km.
    const spaced = (degrees: number): Site[] =>
      [0, 1, 2].map((index) => ({
        id: `near-${index}`,
        latitude: 51.7 + index * degrees,
        longitude: 3.2,
      }));

    expect(estuaryAfter([2, 2], spaced(0.01))).toBeUndefined();
    expect(estuaryAfter([2, 2], spaced(0.03))).toBe("open");
  });

  it("counts the sensors of one platform as one place", () => {
    const platform: Site[] = ["a", "b", "c"].map((name) => ({
      id: `platform-${name}`,
      latitude: 51.7,
      longitude: 3.2,
    }));

    // Three sensors a few metres apart are one witness, not three.
    expect(estuaryAfter([2, 2], platform)).toBeUndefined();
    expect(estuaryAfter([2, 2], [...platform, ...coast.slice(0, 2)])).toBe("open");
  });

  it("takes the median of a place whose sensors disagree", () => {
    const platform: Site[] = ["a", "b", "c"].map((name) => ({
      id: `platform-${name}`,
      latitude: 51.7,
      longitude: 3.2,
    }));
    const sea = coast.slice(0, 2);
    const verdictWith = (middleM: number) =>
      classifyExposure(
        [...sea, ...platform, estuary],
        ROUGH_DAYS.slice(0, 2).flatMap((date) =>
          day(
            date,
            2,
            { "platform-a": 0.5, "platform-b": middleM, "platform-c": 3, estuary: 2 },
            sea,
          ),
        ),
      ).get("estuary");

    // One sensor at 3 m does not make the platform's day rough.
    expect(verdictWith(0.9)).toBeUndefined();
    expect(verdictWith(1)).toBe("open");
  });

  it("does not compare a station with the sensors of its own place", () => {
    const twins: Site[] = ["a", "b", "c"].map((name) => ({ ...estuary, id: `twin-${name}` }));

    expect(estuaryAfter([2, 2], twins)).toBeUndefined();
  });

  it("makes one place of a chain of stations, each within two kilometres of the next", () => {
    // 1.7 km apart: the ends are 3.3 km from each other, and one place through the middle.
    const chain: Site[] = ["a", "b", "c"].map((name, index) => ({
      id: `chain-${name}`,
      latitude: 51.7 + index * 0.015,
      longitude: 3.2,
    }));
    const [first, middle, last] = chain;
    const ends = [first, last].filter((site) => site !== undefined);
    const sea = coast.slice(0, 1);
    const verdictWith = (sites: Site[]) =>
      classifyExposure(
        [...sea, ...sites, estuary],
        ROUGH_DAYS.slice(0, 2).flatMap((date) => day(date, 2, { estuary: 2 }, [...sea, ...ends])),
      ).get("estuary");

    expect(verdictWith(ends)).toBe("open");
    // The middle station has no reading, and still makes one place of the three.
    expect(verdictWith([...ends, ...(middle ? [middle] : [])])).toBeUndefined();
  });

  it("counts a place through the stations it has within sixty kilometres", () => {
    // Two sensors of one place, 59 km and 60.7 km north of the site.
    const near: Site = { id: "edge-near", latitude: 51.53, longitude: 3.05 };
    const far: Site = { id: "edge-far", latitude: 51.546, longitude: 3.05 };
    const others: Site[] = [
      { id: "other-a", latitude: 51.2, longitude: 3.05 },
      { id: "other-b", latitude: 51, longitude: 3.3 },
    ];
    const site: Site = { id: "estuary", latitude: 51, longitude: 3.05 };
    const verdictWith = (nearM: number, farM: number) =>
      classifyExposure(
        [near, far, ...others, site],
        ROUGH_DAYS.slice(0, 2).flatMap((date) =>
          day(date, 1.2, { "edge-near": nearM, "edge-far": farM, estuary: 0.7 }, others),
        ),
      ).get("estuary");

    expect(verdictWith(1.2, 0.2)).toBe("open");
    expect(verdictWith(0.2, 3)).toBeUndefined();
  });

  it("gives the same verdicts whatever the order of the sites", () => {
    const sites = [...coast, estuary];
    const heights = ROUGH_DAYS.flatMap((date, index) =>
      day(date, 2 + index * 0.3, { "sea-1": 0.5, "sea-4": 1.1, estuary: 0.3 }),
    );
    const verdicts = classifyExposure(sites, heights);

    expect(verdicts.size).toBeGreaterThan(0);
    expect(classifyExposure(sites.toReversed(), heights)).toEqual(verdicts);
  });

  it("leaves out a station with no reading in the window", () => {
    const silent: Site = { id: "silent", latitude: 51.6, longitude: 3.1 };
    const verdicts = classifyExposure(
      [...coast, silent],
      ROUGH_DAYS.flatMap((date) => day(date, 2.8)),
    );

    expect(verdicts.has("silent")).toBe(false);
  });
});

describe("nextExposure", () => {
  it("takes what the days say of a station nothing was known of", () => {
    expect(nextExposure(null, "open")).toBe("open");
    expect(nextExposure(null, "sheltered")).toBe("sheltered");
    expect(nextExposure(null, "unclear")).toBeNull();
    expect(nextExposure(null, undefined)).toBeNull();
  });

  it("keeps what was known when the days say nothing or say the same", () => {
    expect(nextExposure("open", undefined)).toBe("open");
    expect(nextExposure("sheltered", undefined)).toBe("sheltered");
    expect(nextExposure("open", "open")).toBe("open");
    expect(nextExposure("sheltered", "sheltered")).toBe("sheltered");
  });

  it("takes sheltered back on one day that was not low", () => {
    expect(nextExposure("sheltered", "unclear")).toBeNull();
    expect(nextExposure("sheltered", "open")).toBe("open");
  });

  it("keeps a station open until the days show it sheltered", () => {
    expect(nextExposure("open", "unclear")).toBe("open");
    expect(nextExposure("open", "sheltered")).toBe("sheltered");
  });
});

describe("wholeDaysBefore", () => {
  it("stops at the last midnight and goes back thirty days", () => {
    expect(wholeDaysBefore(new Date("2026-10-08T03:47:00Z"))).toEqual({
      since: new Date("2026-09-08T00:00:00Z"),
      until: new Date("2026-10-08T00:00:00Z"),
    });
    expect(wholeDaysBefore(new Date("2026-10-08T00:00:00Z")).until).toEqual(
      new Date("2026-10-08T00:00:00Z"),
    );
    expect(wholeDaysBefore(new Date("2026-10-07T23:59:59.999Z")).until).toEqual(
      new Date("2026-10-07T00:00:00Z"),
    );
  });
});
