import { PbfWriter } from "pbf";
import { describe, expect, it } from "vitest";

import { waterOf } from "./land";

type Water = { class: string; brunnel?: string; ring: [number, number][] };

const zigzag = (value: number) => (value << 1) ^ (value >> 31);

// A basemap tile of the OpenMapTiles schema, written by hand: one layer, `water`, of polygons.
function basemapTile(water: Water[], layer = "water") {
  const keys = ["class", "brunnel"];
  const values = [...new Set(water.flatMap((piece) => [piece.class, piece.brunnel ?? ""]))];
  const pbf = new PbfWriter();
  const message = (tag: number, write: () => void) => pbf.writeMessage(tag, write, undefined);
  message(3, () => {
    pbf.writeVarintField(15, 2);
    pbf.writeStringField(1, layer);
    for (const piece of water) {
      message(2, () => {
        const tags = [0, values.indexOf(piece.class)];
        if (piece.brunnel) tags.push(1, values.indexOf(piece.brunnel));
        pbf.writePackedVarint(2, tags);
        pbf.writeVarintField(3, 3);
        const geometry: number[] = [];
        let [x, y] = [0, 0];
        piece.ring.forEach(([px, py], corner) => {
          if (corner === 0) geometry.push((1 & 0x7) | (1 << 3));
          if (corner === 1) geometry.push((2 & 0x7) | ((piece.ring.length - 1) << 3));
          geometry.push(zigzag(px - x), zigzag(py - y));
          [x, y] = [px, py];
        });
        geometry.push(7 | (1 << 3));
        pbf.writePackedVarint(4, geometry);
      });
    }
    for (const key of keys) pbf.writeStringField(3, key);
    for (const value of values) message(4, () => pbf.writeStringField(1, value));
    pbf.writeVarintField(5, 4096);
  });
  return pbf.finish();
}

// What `waterOf` reads is what `LAND_DRAWING` names: a test that changes here changes it.
describe("the water of a basemap tile", () => {
  it("is the ocean, which the land is cut from, apart from the lakes, in the tile's pixels", () => {
    const water = waterOf(
      basemapTile([
        {
          class: "ocean",
          ring: [
            [0, 0],
            [4096, 0],
            [4096, 2048],
            [0, 2048],
          ],
        },
        {
          class: "lake",
          ring: [
            [1024, 3072],
            [2048, 3072],
            [2048, 4096],
          ],
        },
      ]),
      512,
    );
    expect(water?.ocean).toBe("M0 0L512 0L512 256L0 256L0 0Z");
    expect(water?.lakes).toBe("M128 384L256 384L256 512L128 384Z");
  });

  it("leaves out the water that runs in a tunnel", () => {
    const water = waterOf(
      basemapTile([
        {
          class: "river",
          brunnel: "tunnel",
          ring: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
        },
      ]),
      512,
    );
    expect(water).toEqual({ ocean: "", lakes: "" });
  });

  it("is none in a tile with no water", () => {
    expect(waterOf(basemapTile([], "landcover"), 512)).toBeNull();
  });
});
