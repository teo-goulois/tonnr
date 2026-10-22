import { BASEMAP_NAME_WIDTH } from "@repo/client/map/view";
import { describe, expect, it } from "vitest";

import { BASEMAP_ATTRIBUTION, creditParts, joinedCredits, readBasemap } from "./basemap";

// The layers of OpenFreeMap's positron that are read, cut down to what is read of them.
const positron = {
  version: 8,
  sources: {
    ne2_shaded: { type: "raster", tiles: ["https://t/{z}/{x}/{y}.png"] },
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "rgb(242,243,240)" } },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      paint: { "fill-color": "rgb(194, 200, 202)" },
    },
    {
      id: "waterway_line_label",
      type: "symbol",
      source: "openmaptiles",
      layout: { "text-field": "{name}", "text-max-width": 5 },
    },
    {
      id: "highway-shield-us-interstate",
      type: "symbol",
      source: "openmaptiles",
      layout: { "icon-image": "us-interstate" },
    },
    {
      id: "label_town",
      type: "symbol",
      source: "openmaptiles",
      layout: { "text-field": "{name}", "text-max-width": 8, "text-size": 12 },
    },
  ],
};

describe("the basemap", () => {
  it("gives every name of the basemap the web's width, and nothing else", () => {
    const basemap = readBasemap(positron)!;
    const layout = (id: string) => basemap.style.layers.find((layer) => layer.id === id)?.layout;
    expect(layout("waterway_line_label")?.["text-max-width"]).toBe(BASEMAP_NAME_WIDTH);
    expect(layout("label_town")).toEqual({
      "text-field": "{name}",
      "text-max-width": BASEMAP_NAME_WIDTH,
      "text-size": 12,
    });
    expect(layout("highway-shield-us-interstate")).toEqual({ "icon-image": "us-interstate" });
    // The style read is left as it came.
    expect(positron.layers[4]?.layout?.["text-max-width"]).toBe(8);
  });

  it("says its first names, its colors and where its tiles are described", () => {
    expect(readBasemap(positron)).toMatchObject({
      firstLabel: "waterway_line_label",
      land: "rgb(242,243,240)",
      water: "rgb(194, 200, 202)",
      tiles: "https://tiles.openfreemap.org/planet",
    });
  });

  it("reads nothing that is not a style", () => {
    expect(readBasemap(null)).toBeUndefined();
    expect(readBasemap({ layers: [] })).toBeUndefined();
    expect(readBasemap("positron")).toBeUndefined();
  });
});

// The credits OpenFreeMap's description gives, as it wrote them on 2026-10-22.
const OPENFREEMAP =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

describe("the map's credits", () => {
  it("reads OpenFreeMap's into its words and its links", () => {
    expect(creditParts(OPENFREEMAP)).toEqual([
      { text: "OpenFreeMap", href: "https://openfreemap.org" },
      { text: " " },
      { text: "© OpenMapTiles", href: "https://www.openmaptiles.org/" },
      { text: " Data from " },
      { text: "OpenStreetMap", href: "https://www.openstreetmap.org/copyright" },
    ]);
  });

  it("names the three sources and nothing else when the description could not be read", () => {
    const parts = creditParts(BASEMAP_ATTRIBUTION);
    expect(parts.filter((part) => part.href).map((part) => part.text)).toEqual([
      "OpenFreeMap",
      "© OpenMapTiles",
      "© OpenStreetMap",
    ]);
    // No words a reader would need in their language.
    expect(parts.filter((part) => !part.href).every((part) => part.text.trim() === "")).toBe(true);
  });

  it("keeps words that are no link, and no link that leads nowhere on the web", () => {
    expect(creditParts("Generated using <b>Copernicus</b> &amp; more")).toEqual([
      { text: "Generated using Copernicus & more" },
    ]);
    expect(creditParts('<a href="javascript:alert(1)">Here</a>')).toEqual([{ text: "Here" }]);
  });

  it("puts the sea's before the basemap's, as the web does", () => {
    const sea = creditParts("Copernicus Marine Service");
    expect(joinedCredits([sea, [], creditParts(BASEMAP_ATTRIBUTION)]).slice(0, 3)).toEqual([
      { text: "Copernicus Marine Service" },
      { text: " | " },
      { text: "OpenFreeMap", href: "https://openfreemap.org" },
    ]);
  });
});
