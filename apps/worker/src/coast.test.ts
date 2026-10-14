import { describe, expect, it } from "vitest";

import { coastDistanceKm, coastOf, FAR_KM, isOnLand, shoreDistanceKm, worldCoast } from "./coast";

// A square island of one degree, south-west corner at 10° E, 10° N, drawn as Natural Earth's
// TopoJSON writes it: one arc of moves in steps of the scale.
const island = coastOf({
  transform: { scale: [0.1, 0.1], translate: [10, 10] },
  arcs: [
    [
      [0, 0],
      [10, 0],
      [0, 10],
      [-10, 0],
      [0, -10],
    ],
  ],
  objects: { land: { geometries: [{ type: "Polygon", arcs: [[0]] }] } },
});

describe("an island", () => {
  it("tells a point on land from a point at sea", () => {
    expect(isOnLand(island, 10.5, 10.5)).toBe(true);
    expect(isOnLand(island, 10.5, 12)).toBe(false);
  });

  it("measures the way to the nearest shore, signed by the side it is on", () => {
    // A tenth of a degree of latitude inside the south shore, and as far outside it.
    expect(shoreDistanceKm(island, 10.1, 10.5)).toBeCloseTo(11.1, 0);
    expect(shoreDistanceKm(island, 9.9, 10.5)).toBeCloseTo(-11.1, 0);
  });

  it("stops measuring at a distance that says nothing more", () => {
    expect(coastDistanceKm(island, 10.5, 20)).toBe(FAR_KM);
  });
});

describe("the world's shore", () => {
  const world = worldCoast();

  it("places a station of the coast, one at sea and one inland", () => {
    // Hossegor, the A12 platform in the North Sea, Lyon.
    expect(shoreDistanceKm(world, 43.66, -1.44)).toBeLessThan(2);
    expect(shoreDistanceKm(world, 55.383, 3.8)).toBe(-FAR_KM);
    expect(shoreDistanceKm(world, 45.76, 4.83)).toBe(FAR_KM);
  });

  it("tells land from sea all round the earth, across the antimeridian and at the poles", () => {
    // Inland Siberia and the Norwegian Sea, on the latitude where the land crosses the
    // antimeridian; Chukotka itself; Antarctica, and the Southern Ocean.
    expect(isOnLand(world, 67, 90)).toBe(true);
    expect(isOnLand(world, 67, 0)).toBe(false);
    expect(isOnLand(world, 66, 175)).toBe(true);
    expect(isOnLand(world, -80, 0)).toBe(true);
    expect(isOnLand(world, -60, 0)).toBe(false);
    expect(isOnLand(world, 0, -150)).toBe(false);
    expect(isOnLand(world, 46.2, 6.15)).toBe(true);
  });

  it("finds a shore across the antimeridian, and takes no cut of the map for one", () => {
    // Taveuni, in Fiji, lies across the antimeridian.
    expect(coastDistanceKm(world, -16.85, -179.95)).toBeLessThan(10);
    // Siberia is cut along the antimeridian, far from its shores.
    expect(coastDistanceKm(world, 67, 179.99)).toBeGreaterThan(10);
  });
});
