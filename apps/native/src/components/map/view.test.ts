import { describe, expect, it } from "vitest";

import { DEFAULT_LAYERS, layersForList, layersFrom } from "./layers";
import {
  boundsAround,
  DEFAULT_VIEW,
  metersBetween,
  middleOf,
  nearestWithin,
  readView,
  visibleBounds,
  writeView,
} from "./view";

describe("the view the phone keeps", () => {
  it("reads back what it wrote, and the default for anything else", () => {
    const view = { center: [-1.6, 43.5] as [number, number], zoom: 9.5 };
    expect(readView(writeView(view))).toEqual(view);
    expect(readView(null)).toBe(DEFAULT_VIEW);
    expect(readView("[1, 2]")).toBe(DEFAULT_VIEW);
    expect(readView("[1, 95, 4]")).toBe(DEFAULT_VIEW);
    expect(readView("not json")).toBe(DEFAULT_VIEW);
  });

  it("brings a longitude dragged past the edge back into the world", () => {
    expect(readView("[200, 10, 3]").center).toEqual([-160, 10]);
  });
});

describe("the area the API is asked about", () => {
  it("widens the view to a tenth of a degree, so that small moves ask the same", () => {
    expect(visibleBounds([-1.234, 43.21, -1.01, 43.49])).toEqual([-1.3, 43.2, -1, 43.5]);
    expect(visibleBounds([-1.26, 43.24, -1.02, 43.46])).toEqual([-1.3, 43.2, -1, 43.5]);
  });

  it("asks for the whole world when the view is wider than it", () => {
    expect(visibleBounds([-250, -80, 190, 80])).toEqual([-180, -80, 180, 80]);
  });

  it("keeps west greater than east for a view across the antimeridian", () => {
    const [west, , east] = visibleBounds([170, -20, 190, -10]);
    expect(west).toBe(170);
    expect(east).toBe(-170);
    expect(middleOf([170, -20, -170, -10])).toBeUndefined();
  });

  it("says the middle of the view and how close it is", () => {
    expect(middleOf([-2, 43, 0, 45])).toEqual({ latitude: 44, longitude: -1, zoom: 7 });
  });
});

describe("what stands near a point", () => {
  const guethary = { latitude: 43.4245, longitude: -1.6125 };

  it("measures a beach's length on a flat earth", () => {
    const north = { latitude: guethary.latitude + 0.001, longitude: guethary.longitude };
    expect(metersBetween(guethary, north)).toBeCloseTo(111.3, 0);
    expect(
      metersBetween({ latitude: 0, longitude: 179.9995 }, { latitude: 0, longitude: -179.9995 }),
    ).toBeCloseTo(111.3, 0);
  });

  it("finds the nearest within the distance, and none beyond", () => {
    const near = {
      id: "near",
      latitude: guethary.latitude + 0.0005,
      longitude: guethary.longitude,
    };
    const nearer = { id: "nearer", latitude: guethary.latitude, longitude: -1.6127 };
    const far = { id: "far", latitude: 43.6, longitude: -1.4 };
    expect(nearestWithin([far, near, nearer], guethary, 150)?.id).toBe("nearer");
    expect(nearestWithin([far], guethary, 150)).toBeUndefined();
    expect(nearestWithin(undefined, guethary, 150)).toBeUndefined();
  });

  it("holds every point in one box", () => {
    expect(
      boundsAround([
        { latitude: 1, longitude: 2 },
        { latitude: -1, longitude: 5 },
      ]),
    ).toEqual([2, -1, 5, 1]);
    expect(boundsAround([])).toBeUndefined();
  });
});

describe("the layers the legend switches", () => {
  it("reads what the browser kept, and fills in what came later", () => {
    expect(layersFrom(JSON.stringify({ sea: false, buoys: true, wind: true }))).toEqual({
      ...DEFAULT_LAYERS,
      sea: false,
      wind: true,
    });
    expect(layersFrom("{}")).toBe(DEFAULT_LAYERS);
    expect(layersFrom(null)).toBe(DEFAULT_LAYERS);
  });

  it("draws everything a list holds, whatever the switches say", () => {
    const off = { sea: false, arrows: false, buoys: false, wind: false, breaks: false };
    expect(layersForList(off)).toEqual({ ...off, buoys: true, wind: true, breaks: true });
  });
});
