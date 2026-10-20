import { describe, expect, it } from "vitest";

import { goesOn, keyOf, matching, OWN_MOST, whereOf } from "./found";

describe("what a search reads of what is typed", () => {
  const spots = [
    { id: "1", name: "Guéthary, la gauche", latitude: 43.42, longitude: -1.61 },
    { id: "2", name: "Parlementia", latitude: 43.42, longitude: -1.6 },
  ];

  it("finds a name whatever its case and its marks", () => {
    expect(matching("spot", spots, "GUETHARY").map((one) => one.id)).toEqual(["1"]);
    expect(matching("spot", spots, "  parle ")).toEqual([
      { kind: "spot", id: "2", name: "Parlementia", latitude: 43.42, longitude: -1.6 },
    ]);
  });

  it("asks nothing of one letter", () => {
    expect(matching("spot", spots, "g")).toEqual([]);
  });

  it("shows a few of each kind", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
      name: `Buoy ${index}`,
      latitude: 0,
      longitude: 0,
    }));
    expect(matching("station", many, "buoy")).toHaveLength(OWN_MOST);
  });

  it("keeps the answer before while what is typed goes on from it, or back to it", () => {
    expect(goesOn("cap", "capb")).toBe(true);
    expect(goesOn("capbreton", "cap")).toBe(true);
    expect(goesOn("Guéthary", "guethary p")).toBe(true);
    expect(goesOn("cap", "hossegor")).toBe(false);
    expect(goesOn("c", "ca")).toBe(false);
  });

  it("says where a place lies, the nearest first", () => {
    expect(whereOf(["France", "Nouvelle-Aquitaine", "Pyrénées-Atlantiques", "Guéthary"])).toBe(
      "Guéthary, Pyrénées-Atlantiques, Nouvelle-Aquitaine",
    );
    expect(whereOf([])).toBeUndefined();
    expect(whereOf(null)).toBeUndefined();
  });

  it("tells a place by its name and its point when it has no id", () => {
    expect(keyOf({ kind: "place", name: "Biarritz", latitude: 43.48, longitude: -1.56 })).toBe(
      "place Biarritz:43.48,-1.56",
    );
    expect(keyOf({ kind: "break", id: "b1", name: "Avalanche", latitude: 0, longitude: 0 })).toBe(
      "break b1",
    );
  });
});
