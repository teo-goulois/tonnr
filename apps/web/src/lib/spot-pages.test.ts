import { describe, expect, it } from "vitest";

import type { SpotPage } from "./pages-api";
import {
  breadcrumbJsonLd,
  jsonLdScript,
  spotCrumbs,
  spotDescription,
  spotJsonLd,
  spotPath,
  spotsCount,
  wordsOf,
} from "./spot-pages";

const site = "https://site.example";

// An invented break, well filled, and one of which only the place is known.
const nothing: SpotPage["break"]["characteristics"] = {
  breakTypes: null,
  waveDirections: null,
  bottomTypes: null,
  abilityLevels: null,
  boardTypes: null,
  bestSeasons: null,
  bestTides: null,
  bestSwellDirections: null,
  bestWindDirections: null,
  offshoreDirectionDegrees: 140,
  waveSizeMeters: null,
};

const page = (characteristics: SpotPage["break"]["characteristics"]): SpotPage => ({
  moved: false,
  break: {
    id: "6e0d6c0a-0000-4000-8000-000000000002",
    name: "Anse du Phare",
    latitude: 47.8,
    longitude: -4.38,
    characteristics,
    location: ["France", "Bretagne", "Plomeur"],
    timezone: "Europe/Paris",
    page: "/spots/france/bretagne/anse-du-phare",
    description: null,
    source: { provider: null, url: null, attribution: null, license: null },
  },
  listed: true,
  places: [
    { name: "France", page: "/spots/france" },
    { name: "Bretagne", page: "/spots/france/bretagne" },
    { name: "Plomeur", page: null },
  ],
  waves: null,
  wind: null,
  tide: null,
  week: null,
  texts: [],
  nearby: [],
});

const filled = page({
  ...nothing,
  breakTypes: ["beach", "rivermouth"],
  bottomTypes: ["sand"],
  bestTides: ["mid", "mid_high"],
  bestSwellDirections: ["W", "WNW"],
});

describe("spotPath", () => {
  it("writes the address of a break's page under its country and its region", () => {
    expect(spotPath({ country: "spain", region: "basque-country", slug: "mundaka" })).toBe(
      "/spots/spain/basque-country/mundaka",
    );
  });
});

describe("wordsOf", () => {
  it("reads the words of a characteristic in the order of the catalogue, and the points by name", () => {
    expect(wordsOf("breakTypes", ["rivermouth", "beach"])).toEqual(["Beach break", "Rivermouth"]);
    expect(wordsOf("bestSwellDirections", ["WNW", "W"])).toEqual(["W", "WNW"]);
    expect(wordsOf("bottomTypes", null)).toEqual([]);
  });
});

describe("spotDescription", () => {
  it("says where the break is, what it is like, and what the page holds", () => {
    const description = spotDescription(filled);
    expect(description).toContain("Anse du Phare is a surf spot in Bretagne, France.");
    expect(description).toContain("Type: Beach break, Rivermouth.");
    expect(description).toContain("Bottom: Sand.");
    expect(description).toContain("Best tide: Mid, Mid to high.");
    expect(description).toContain("Best swell from the W, WNW.");
    expect(description).toMatch(/on Tonnr\.$/);
  });

  it("says the place and the page alone of a break of which nothing else is known", () => {
    expect(spotDescription(page(nothing))).toBe(
      "Anse du Phare is a surf spot in Bretagne, France. The forecast for 7 days, the sea now and the next tides, on Tonnr.",
    );
  });
});

describe("spotCrumbs and spotsCount", () => {
  it("puts the root of the spots before the places", () => {
    expect(spotCrumbs(filled).map((crumb) => crumb.page)).toEqual([
      "/spots",
      "/spots/france",
      "/spots/france/bretagne",
      null,
    ]);
  });

  it("counts the spots of a hub in words", () => {
    expect(spotsCount(1)).toBe("1 spot");
    expect(spotsCount(12)).toBe("12 spots");
  });
});

describe("spotJsonLd", () => {
  const [place, crumbs] = spotJsonLd(
    site,
    filled,
    "/spots/france/bretagne/anse-du-phare",
  ) as unknown as [Record<string, unknown>, { itemListElement: { name: string; item: string }[] }];

  it("describes the place with where it is", () => {
    expect(place).toMatchObject({
      "@type": "Place",
      name: "Anse du Phare",
      url: "https://site.example/spots/france/bretagne/anse-du-phare",
      geo: { "@type": "GeoCoordinates", latitude: 47.8, longitude: -4.38 },
      address: { "@type": "PostalAddress", addressCountry: "France", addressRegion: "Bretagne" },
    });
    expect(place.description).toBe(spotDescription(filled));
  });

  it("walks the path of hubs down to the page, and leaves out a place with no hub", () => {
    expect(crumbs.itemListElement.map((step) => [step.name, step.item])).toEqual([
      ["Surf spots", "https://site.example/spots"],
      ["France", "https://site.example/spots/france"],
      ["Bretagne", "https://site.example/spots/france/bretagne"],
      ["Anse du Phare", "https://site.example/spots/france/bretagne/anse-du-phare"],
    ]);
  });
});

describe("breadcrumbJsonLd and jsonLdScript", () => {
  it("numbers the steps from one", () => {
    const list = breadcrumbJsonLd(site, [{ name: "Surf spots", page: "/spots" }], {
      name: "Spain",
      page: "/spots/spain",
    });
    expect(list.itemListElement.map((step) => step.position)).toEqual([1, 2]);
  });

  it("writes a script that nothing in a name can close", () => {
    const script = jsonLdScript({ name: "</script><b>" });
    expect(script.type).toBe("application/ld+json");
    expect(script.children).not.toContain("</script>");
    expect(JSON.parse(script.children)).toEqual({ name: "</script><b>" });
  });
});
