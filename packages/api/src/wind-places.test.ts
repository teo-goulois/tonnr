import { describe, expect, it } from "vitest";

import { oneByPlace, type WindPlace } from "./wind-places";

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
    ...overrides,
  };
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
