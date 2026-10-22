import { WAVE_HEIGHT_SCALE } from "@repo/client/sea-scales";
import { describe, expect, it } from "vitest";

import {
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
  isSaved: false,
  label: "Gascogne, 3.4 m, 12 s",
};

describe("what the map draws", () => {
  it("gives a buoy's dot its height, and a buoy that measured nothing lately none", () => {
    const [feature] = stationFeatures([buoy]).features;
    expect(feature?.properties).toEqual({
      kind: "station",
      id: "62001",
      height: 3.4,
      sheltered: false,
    });
    const [silent] = stationFeatures([{ ...buoy, heightMeters: null, freshness: "none" }]).features;
    expect(silent?.properties?.height).toBe(-1);
    const [sheltered] = stationFeatures([{ ...buoy, isSheltered: true }]).features;
    expect(sheltered?.properties?.sheltered).toBe(true);
  });

  it("gives a wind station's dot its speed, which its color reads", () => {
    const [calm] = windFeatures([
      {
        id: "w",
        name: "Biarritz",
        latitude: 43.47,
        longitude: -1.53,
        speedKnots: 5,
        directionDegrees: null,
        label: "Biarritz, wind 5 kn",
      },
    ]).features;
    expect(calm?.properties).toEqual({ kind: "station", id: "w", speed: 5 });
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
