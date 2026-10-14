import { describe, expect, it } from "vitest";

import { oneByPlace, spreadOut, type WindPlace } from "./wind-places";

const now = new Date("2026-10-14T14:00:00Z");
const lately = new Date("2026-10-14T13:50:00Z");

// A station at Biarritz, moved north by a number of kilometres.
function station(id: string, overrides: Partial<WindPlace> = {}, northKm = 0): WindPlace {
  return {
    id,
    provider: "meteofrance",
    latitude: 43.47 + northKm / 111.2,
    longitude: -1.56,
    measuredAt: lately,
    gust: true,
    shoreKm: 2,
    ...overrides,
  };
}

function kmBetween(one: WindPlace, other: WindPlace) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(other.latitude - one.latitude) / 2) ** 2 +
    Math.cos(radians(one.latitude)) *
      Math.cos(radians(other.latitude)) *
      Math.sin(radians(other.longitude - one.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, a)));
}

const ids = (stations: WindPlace[]) => stations.map((one) => one.id).sort();

describe("oneByPlace", () => {
  it("keeps stations that stand apart", () => {
    expect(ids(oneByPlace([station("a"), station("b", {}, 3)], now))).toEqual(["a", "b"]);
  });

  it("keeps one of the stations at a place", () => {
    const three = [station("a"), station("b", {}, 0.5), station("c", {}, 1)];

    expect(oneByPlace(three, now)).toHaveLength(1);
  });

  it("keeps the one that measured lately over one that stopped", () => {
    const stopped = station("a", { measuredAt: new Date("2026-10-14T09:00:00Z") });
    const live = station("b", { gust: false, provider: "openwindmap" }, 0.5);

    expect(ids(oneByPlace([stopped, live], now))).toEqual(["b"]);
  });

  it("keeps the one that gives the gusts", () => {
    const without = station("a", { gust: false });
    const withGust = station("b", { provider: "ndbc" }, 0.5);

    expect(ids(oneByPlace([without, withGust], now))).toEqual(["b"]);
  });

  it("keeps the one that measures more often", () => {
    const hourly = station("a", { provider: "irish-lights" });
    const often = station("b", { provider: "meteofrance" }, 0.5);

    expect(ids(oneByPlace([hourly, often], now))).toEqual(["b"]);
  });

  it("keeps an official station over a community beacon", () => {
    const beacon = station("a", { provider: "openwindmap" });
    const official = station("b", { provider: "dmi" }, 0.5);

    expect(ids(oneByPlace([beacon, official], now))).toEqual(["b"]);
  });

  it("finds a neighbour across the edge of a cell, far north", () => {
    const north = { latitude: 69.65, longitude: 18.95 };
    const one = station("a", north);
    // 1.5 km east, where a degree of longitude is 38 km.
    const other = station("b", { ...north, longitude: 18.95 + 1.5 / 38.6, gust: false });

    expect(ids(oneByPlace([one, other], now))).toEqual(["a"]);
  });

  it("keeps a chain of stations every 1.5 km at every other one", () => {
    const chain = [0, 1.5, 3, 4.5].map((km, index) => station(`s${index}`, {}, km));

    expect(ids(oneByPlace(chain, now))).toEqual(["s0", "s2"]);
  });
});

describe("spreadOut", () => {
  // A line of stations every kilometre, 100 km long, going north.
  const line = Array.from({ length: 100 }, (_, km) =>
    station(`s${String(km).padStart(3, "0")}`, {}, km),
  );

  it("keeps one by place when that is few enough", () => {
    const { stations, apartKm } = spreadOut(line, now, 100);

    expect(apartKm).toBe(2);
    // Two stations exactly 2 km apart, as the line's are, stand at one place.
    expect(stations).toHaveLength(34);
  });

  it("keeps them further apart until they are few enough, over the whole line", () => {
    const { stations, apartKm } = spreadOut(line, now, 10);
    const kmNorth = stations
      .map((one) => Math.round((one.latitude - 43.47) * 111.2))
      .sort((a, b) => a - b);

    expect(stations.length).toBeLessThanOrEqual(10);
    expect(apartKm).toBeGreaterThan(2);
    expect(kmNorth[0]).toBeLessThan(16);
    expect(kmNorth.at(-1)).toBeGreaterThan(80);
  });

  it("weighs every station of the box again at each distance", () => {
    // At 2 km c falls behind b. Reading b's survivors alone, 4 km would leave a, though c stands
    // 4.5 km from it: weighed again, c stands alone at 4 km, and one station takes 8.
    const three = [station("a"), station("b", {}, 3), station("c", {}, 4.5)];

    const { stations, apartKm } = spreadOut(three, now, 1);

    expect(ids(stations)).toEqual(["a"]);
    expect(apartKm).toBe(8);
  });

  it("sees a neighbour across the antimeridian", () => {
    const east = station("east", { latitude: 0, longitude: 179.995 });
    const west = station("west", { latitude: 0, longitude: -179.995, gust: false });

    expect(ids(oneByPlace([east, west], now))).toEqual(["east"]);
  });

  it("sees a neighbour across the antimeridian further north, where the last column is short", () => {
    const east = station("east", { latitude: 57, longitude: 179.9755 });
    const west = station("west", { latitude: 57, longitude: -179.9927, gust: false });

    expect(ids(oneByPlace([east, west], now))).toEqual(["east"]);
  });

  it("keeps no two stations closer than the distance, as a search of every pair finds", () => {
    // Stations scattered over the world by a fixed sequence, so that the test always sees the same.
    let seed = 7;
    const next = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    const scattered = Array.from({ length: 400 }, (_, index) =>
      station(`r${index}`, {
        latitude: next() * 170 - 85,
        longitude: next() * 360 - 180,
        gust: next() > 0.5,
      }),
    );

    for (const most of [400, 100, 20]) {
      const { stations, apartKm } = spreadOut(scattered, now, most);
      for (const one of stations) {
        for (const other of stations) {
          if (one !== other) expect(kmBetween(one, other)).toBeGreaterThanOrEqual(apartKm);
        }
      }
      // Every station left out has one kept within the distance.
      for (const left of scattered.filter((one) => !stations.includes(one))) {
        expect(stations.some((kept) => kmBetween(kept, left) < apartKm)).toBe(true);
      }
    }
  });

  it("sees a neighbour near a pole, far round in longitude", () => {
    const one = station("one", { latitude: 87.5, longitude: 0 });
    const other = station("other", { latitude: 87.5, longitude: 120, gust: false });
    const far = station("far", { latitude: 0, longitude: 60 });

    // The two polar stations are some 480 km apart: at 512 km they stand at one place.
    const { stations, apartKm } = spreadOut([one, other, far], now, 2);

    expect(apartKm).toBe(512);
    expect(ids(stations)).toEqual(["far", "one"]);
  });

  it("keeps the station by the sea over the one inland, once they are kept apart", () => {
    const inland = station("inland", { shoreKm: 40 });
    const sea = station("sea", { shoreKm: -3, gust: false, provider: "ndbc" }, 3);

    expect(ids(spreadOut([inland, sea], now, 1, { sea: true }).stations)).toEqual(["sea"]);
    expect(ids(spreadOut([inland, sea], now, 1).stations)).toEqual(["inland"]);
  });

  it("keeps the station by the sea only among those that measured lately", () => {
    const inland = station("inland", { shoreKm: 40 });
    const stopped = station("sea", { shoreKm: 1, measuredAt: new Date("2026-10-14T08:00:00Z") }, 3);

    expect(ids(spreadOut([inland, stopped], now, 1, { sea: true }).stations)).toEqual(["inland"]);
  });

  it("gives a station whose shore is not known no preference", () => {
    const unknown = station("a", { shoreKm: null });
    const inland = station("b", { shoreKm: 40 }, 3);

    expect(ids(spreadOut([unknown, inland], now, 1, { sea: true }).stations)).toEqual(["a"]);
  });

  it("keeps the stations of the inland where none by the sea stands within the distance", () => {
    const coast = Array.from({ length: 5 }, (_, index) =>
      station(`coast${index}`, { shoreKm: 1 }, index * 3),
    );
    const inland = station("inland", { shoreKm: 50, longitude: 3 }, 0);

    const { stations } = spreadOut([...coast, inland], now, 4, { sea: true });

    expect(ids(stations)).toContain("inland");
  });
});
