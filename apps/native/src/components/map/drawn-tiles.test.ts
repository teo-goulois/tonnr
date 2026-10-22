import { describe, expect, it } from "vitest";

import { landTiles, paletteName, readTile, seaTiles } from "./drawn-tiles";

const SEA = "https://wave.example/wmts?layer=VHM0&time={time}&tilematrix={z}&col={x}&row={y}";
const BASEMAP = "https://tiles.example/planet/20261015/{z}/{x}/{y}.pbf";
const moment = new Date("2026-10-22T06:00:00Z");

// MapLibre fills an address's own `{z}`, `{x}` and `{y}`, and no other.
const filled = (template: string, z: number, x: number, y: number) =>
  template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

describe("the address of a tile the app draws", () => {
  it("leaves MapLibre nothing to fill but its own place", () => {
    const template = seaTiles(SEA, moment, "p1");
    expect(template.startsWith("https://map-tiles.invalid/sea/{z}/{x}/{y}.png?")).toBe(true);
    expect(template.split("{").length - 1).toBe(3);
  });

  it("reads back the sea's tile it was filled with, at the moment it shows", () => {
    const tile = readTile(filled(seaTiles(SEA, moment, "p1"), 5, 15, 11));
    expect(tile).toMatchObject({ kind: "sea", z: 5, x: 15, y: 11 });
    expect(tile?.source).toBe(
      "https://wave.example/wmts?layer=VHM0&time=2026-10-22T06%3A00%3A00.000Z&tilematrix=5&col=15&row=11",
    );
    expect(tile?.params.get("palette")).toBe("p1");
  });

  it("reads back the basemap's tile and the colors of its land and water", () => {
    const template = landTiles(BASEMAP, { land: "rgb(242, 242, 242)", water: "#c9d2d3" });
    const tile = readTile(filled(template, 9, 250, 175));
    expect(tile).toMatchObject({ kind: "land", z: 9, x: 250, y: 175 });
    expect(tile?.source).toBe("https://tiles.example/planet/20261015/9/250/175.pbf");
    expect(tile?.params.get("land")).toBe("rgb(242, 242, 242)");
    expect(tile?.params.get("water")).toBe("#c9d2d3");
  });

  it("is none of another host's, or of a kind the app does not draw", () => {
    expect(readTile("https://tiles.example/planet/9/250/175.pbf")).toBeNull();
    expect(readTile("https://map-tiles.invalid/roads/9/250/175.png?source=x")).toBeNull();
    expect(readTile("https://map-tiles.invalid/sea/9/250/175.png")).toBeNull();
    expect(readTile("not an address")).toBeNull();
  });
});

describe("the name of a palette", () => {
  const colors = new Uint8ClampedArray(256 * 4).map((_, index) => index % 251);

  it("is the same for the same colors, and another for others", () => {
    expect(paletteName(colors)).toBe(paletteName(colors.slice()));
    const other = colors.slice();
    other[517] = 0;
    expect(paletteName(colors)).not.toBe(paletteName(other));
  });
});
