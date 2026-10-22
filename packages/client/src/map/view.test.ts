import { describe, expect, it } from "vitest";

import {
  BASEMAP_SOURCE,
  DEFAULT_VIEW,
  firstLabelOf,
  FIT_MAX_ZOOM,
  FIT_PADDING,
  fitPadding,
  fitted,
  isBasemapName,
  latitudeOf,
  MAX_ZOOM,
  mercatorY,
  readView,
  wrapLongitude,
  writeView,
} from "./view";

describe("the view a device keeps", () => {
  it("reads back what it wrote, and the default for anything else", () => {
    const view = { center: [-1.6, 43.5] as [number, number], zoom: 9.5 };
    expect(readView(writeView(view))).toEqual(view);
    expect(readView(null)).toBe(DEFAULT_VIEW);
    expect(readView("[1, 2]")).toBe(DEFAULT_VIEW);
    expect(readView("[1, 95, 4]")).toBe(DEFAULT_VIEW);
    expect(readView("[1, 45, 30]")).toBe(DEFAULT_VIEW);
    expect(readView("not json")).toBe(DEFAULT_VIEW);
  });

  it("keeps a view of the whole world, which the web zooms out to", () => {
    expect(readView("[0, 0, -1.5]").zoom).toBe(-1.5);
  });

  it("keeps a view as close as the map comes, and none closer", () => {
    expect(readView(`[0, 0, ${MAX_ZOOM}]`).zoom).toBe(MAX_ZOOM);
    expect(readView(`[0, 0, ${MAX_ZOOM + 0.5}]`)).toBe(DEFAULT_VIEW);
  });

  it("brings a longitude dragged past the edge back into the world", () => {
    expect(readView("[200, 10, 3]").center).toEqual([-160, 10]);
    expect(wrapLongitude(-540)).toBe(-180);
    // One in the world is kept to the last figure.
    expect(wrapLongitude(-1.234567)).toBe(-1.234567);
  });

  it("opens on France's Atlantic coast, as the web does", () => {
    expect(DEFAULT_VIEW).toEqual({ center: [-2.5, 46.3], zoom: 4.8 });
  });
});

describe("the basemap's style", () => {
  const layers = [
    { id: "background", type: "background" },
    { id: "water", type: "fill", source: BASEMAP_SOURCE },
    { id: "highway-shield", type: "symbol", source: BASEMAP_SOURCE, layout: {} },
    {
      id: "place-city",
      type: "symbol",
      source: BASEMAP_SOURCE,
      layout: { "text-field": "{name}" },
    },
    { id: "ours", type: "symbol", source: "stations", layout: { "text-field": "{name}" } },
  ];

  it("gives its width to the names of the basemap and to nothing else", () => {
    expect(layers.filter(isBasemapName).map((layer) => layer.id)).toEqual(["place-city"]);
  });

  it("draws the arrows of the sea under its first symbol, whatever it writes", () => {
    expect(firstLabelOf(layers)).toBe("highway-shield");
    expect(firstLabelOf(layers.slice(0, 2))).toBeUndefined();
  });
});

describe("a list fitted on the map", () => {
  const phone = { width: 390, height: 844 };
  const padding = fitPadding({ top: 47, bottom: 83 });

  it("leaves room for the markers inside what the bars cover", () => {
    expect(padding).toEqual({
      top: 47 + FIT_PADDING.top,
      right: FIT_PADDING.right,
      bottom: 83 + FIT_PADDING.bottom,
      left: FIT_PADDING.left,
    });
  });

  it("fills the room left with the box, as MapLibre fits it", () => {
    // The Bay of Biscay, wider than it is tall on the screen.
    const { zoom, center, capped } = fitted([-5, 43, -1, 48], phone, padding);
    expect(capped).toBe(false);
    const width = 390 - 56 * 2;
    expect(zoom).toBeCloseTo(Math.log2(width / ((4 / 360) * 512)), 6);
    expect(center[0]).toBe(-3);
    // The middle on the screen, which is north of the middle in degrees.
    expect(center[1]).toBeGreaterThan(45.5);
    expect(mercatorY(center[1])).toBeCloseTo((mercatorY(43) + mercatorY(48)) / 2, 9);
  });

  it("shows one point, or a few on one beach, no closer than a bay", () => {
    const one = fitted([-1.6, 43.4, -1.6, 43.4], phone, padding);
    expect(one.zoom).toBe(FIT_MAX_ZOOM);
    expect(one.capped).toBe(true);
    expect(one.center[0]).toBe(-1.6);
    expect(one.center[1]).toBeCloseTo(43.4, 9);
    expect(fitted([-1.61, 43.4, -1.6, 43.41], phone, padding).capped).toBe(true);
  });

  it("fits a box across the antimeridian the short way", () => {
    const { center, zoom } = fitted([170, -20, -170, -10], phone, padding);
    expect(Math.abs(center[0])).toBeCloseTo(180, 9);
    expect(zoom).toBeCloseTo(Math.log2((390 - 112) / ((20 / 360) * 512)), 6);
  });

  it("reads Mercator back into a latitude", () => {
    for (const latitude of [-60, 0, 43.5, 70]) {
      expect(latitudeOf(mercatorY(latitude))).toBeCloseTo(latitude, 9);
    }
  });
});
