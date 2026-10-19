import { WAVE_HEIGHT_SCALE } from "@repo/client/sea-scales";
import { describe, expect, it } from "vitest";

import {
  IMAGES,
  type MapStation,
  placeFeatures,
  pressed,
  scaleExpression,
  stationFeatures,
  windFeatures,
  withRecents,
} from "./features";

const buoy: MapStation = {
  id: "62001",
  name: "Gascogne",
  latitude: 45.2,
  longitude: -5,
  heightMeters: 3.4,
  periodSeconds: 12,
  directionDegrees: 290,
  freshness: "fresh",
  isSheltered: false,
  figures: "3.4 m · 12 s",
};

describe("what the map draws", () => {
  it("gives a buoy its arrow, turned the way the waves go, in an ink that reads on its color", () => {
    const [feature] = stationFeatures([buoy]).features;
    expect(feature?.properties).toMatchObject({
      kind: "station",
      id: "62001",
      height: 3.4,
      rotate: 110,
      arrow: IMAGES.arrowDark,
      figures: "3.4 m · 12 s",
    });
    const [flat] = stationFeatures([{ ...buoy, heightMeters: 0.2 }]).features;
    expect(flat?.properties?.arrow).toBe(IMAGES.arrowLight);
  });

  it("draws no arrow where the buoy says nothing of the waves, and no height without a reading", () => {
    const [silent] = stationFeatures([
      { ...buoy, heightMeters: null, directionDegrees: null, freshness: "none" },
    ]).features;
    expect(silent?.properties).toMatchObject({ height: -1, arrow: "", fade: 1 });
    const [sheltered] = stationFeatures([{ ...buoy, isSheltered: true }]).features;
    expect(sheltered?.properties?.arrow).toBe("");
  });

  it("writes the wind's speed in an ink that reads on its color", () => {
    const [calm] = windFeatures([
      {
        id: "w",
        name: "Biarritz",
        latitude: 43.47,
        longitude: -1.53,
        speedKnots: 5,
        directionDegrees: null,
        figure: "5",
      },
    ]).features;
    expect(calm?.properties).toMatchObject({ kind: "station", figure: "5", arrow: "" });
  });

  it("colors a value as the web's scale does", () => {
    expect(scaleExpression("height", WAVE_HEIGHT_SCALE).slice(0, 5)).toEqual([
      "interpolate",
      ["linear"],
      ["get", "height"],
      0,
      "#3b6fd4",
    ]);
  });
});

describe("the breaks looked at lately", () => {
  const inView = [{ id: "a", name: "Avalanche", latitude: 43.41, longitude: -1.6 }];
  const recents = [
    { kind: "break" as const, id: "p", name: "Parlementia", latitude: 43.42, longitude: -1.61 },
    { kind: "station" as const, id: "s", name: "Anglet", latitude: 43.5, longitude: -1.5 },
  ];

  it("stand out, whether they are among those in view or not", () => {
    expect(withRecents(inView, recents, false)).toEqual([
      ...inView,
      { id: "p", name: "Parlementia", latitude: 43.42, longitude: -1.61, recent: true },
    ]);
  });

  it("are not added to a list shown alone", () => {
    expect(withRecents(inView, recents, true)).toEqual(inView);
  });
});

describe("a press on the map", () => {
  const breaks = placeFeatures(
    [
      { id: "near", name: "Near", latitude: 43.4, longitude: -1.6 },
      { id: "far", name: "Far", latitude: 43.5, longitude: -1.6 },
    ],
    "break",
  ).features;

  it("opens what is nearest the finger", () => {
    expect(pressed(breaks, [-1.6, 43.41])).toEqual({
      kind: "break",
      id: "near",
      at: [-1.6, 43.4],
    });
  });

  it("finds nothing among features that are not the map's own", () => {
    const basemap: GeoJSON.Feature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-1.6, 43.4] },
      properties: { name: "Guéthary" },
    };
    expect(pressed([basemap], [-1.6, 43.4])).toBeUndefined();
  });
});
