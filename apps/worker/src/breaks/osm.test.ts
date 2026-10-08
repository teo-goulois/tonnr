import { describe, expect, it } from "vitest";

import { FormatError } from "../providers/format-error";
import { isSurfBreak, parseSurfingObjects } from "./osm";

function node(tags: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    type: "node",
    id: 4172398201,
    lat: 30.5451566,
    lon: -9.7266502,
    tags: { sport: "surfing", ...tags },
    ...overrides,
  };
}

function parse(elements: unknown[]) {
  const list = parseSurfingObjects({ elements });
  if (list instanceof FormatError) throw list;
  return list;
}

describe("isSurfBreak", () => {
  it("keeps a named place with nothing but the sport", () => {
    expect(isSurfBreak({ sport: "surfing", name: "Anchor Point" })).toBe(true);
  });

  it("keeps a beach, a reef, and a surfing area drawn as a pitch", () => {
    expect(isSurfBreak({ sport: "surfing", name: "Praia do Baleal", natural: "beach" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Middle Reef", natural: "reef" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Capo Mannu", leisure: "pitch" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Gerupuk Inside", tourism: "attraction" })).toBe(
      true,
    );
  });

  it("drops a shop, a school, a club and a building", () => {
    expect(isSurfBreak({ sport: "surfing", name: "Boardriders", shop: "sports" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Atlantic", amenity: "surf_school" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Hossegor Surf", club: "sport" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Le hangar", building: "yes" })).toBe(false);
  });

  it("keeps a beach that has a website, opening hours or an address", () => {
    const beach = { sport: "surfing", natural: "beach", name: "Praia de Traba" };

    expect(isSurfBreak({ ...beach, website: "https://example.org" })).toBe(true);
    expect(isSurfBreak({ ...beach, opening_hours: "24/7" })).toBe(true);
    expect(isSurfBreak({ ...beach, "addr:street": "Rua do Mar" })).toBe(true);
  });

  it("drops a beach that is also a business", () => {
    expect(isSurfBreak({ sport: "surfing", natural: "beach", name: "Lido", amenity: "bar" })).toBe(
      false,
    );
  });

  it("drops a bare point whose description sells something", () => {
    const description = "Surf lessons, surf rentals, hot food, camping.";

    expect(isSurfBreak({ sport: "surfing", name: "Wyo Point", description })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", natural: "beach", name: "Wyo", description })).toBe(
      true,
    );
  });

  it("drops a place that gives a way to reach its owner", () => {
    expect(isSurfBreak({ sport: "surfing", name: "Nature", website: "https://example.org" })).toBe(
      false,
    );
    expect(isSurfBreak({ sport: "surfing", name: "Nature", phone: "+33 5 00 00 00 00" })).toBe(
      false,
    );
    expect(isSurfBreak({ sport: "surfing", name: "Nature", opening_hours: "Mo-Su" })).toBe(false);
  });

  it("drops a sports centre, a wave pool and a holiday camp", () => {
    expect(isSurfBreak({ sport: "surfing", name: "Surftown", leisure: "sports_centre" })).toBe(
      false,
    );
    expect(isSurfBreak({ sport: "surfing", name: "The Wave", leisure: "water_park" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Les Pins", tourism: "camp_site" })).toBe(false);
  });

  it("drops a river wave and a lake", () => {
    expect(isSurfBreak({ sport: "surfing", name: "Eisbach", waterway: "river" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Abiquiu", whitewater: "yes" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Papendaalheide", natural: "water" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Bremgartner Welle" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Scout Surf Wave" })).toBe(false);
  });

  it("drops a business that only its name gives away", () => {
    expect(isSurfBreak({ sport: "surfing", name: "Escuela de Surf Salty Sol" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Kitespot Farø" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Madeira Surf Center" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Banana Water Sports" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Sóller SUP" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Kook Proof", school: "kitesurf" })).toBe(false);
  });

  it("keeps a break whose name only contains such a word", () => {
    // "camp", "center", "welle" and "sup" count as whole words, and "wave" only at the end.
    expect(isSurfBreak({ sport: "surfing", name: "Praia do Campeche" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Playa Centinela" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Wellenreiter Bay" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Supertubos" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Wavecrest" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Jordan River Point" })).toBe(true);
    expect(isSurfBreak({ sport: "surfing", name: "Lighthouse" })).toBe(true);
  });

  it("drops a place with no name, or with a name that only says what it is", () => {
    expect(isSurfBreak({ sport: "surfing" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "  " })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Surf Spot" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Surfing spot" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Spot de surf" })).toBe(false);
    expect(isSurfBreak({ sport: "surfing", name: "Surf spot - Les Sablettes" })).toBe(true);
  });
});

describe("parseSurfingObjects", () => {
  it("turns a node into a break with a link to its page", () => {
    expect(parse([node({ name: "Anchor Point" })])).toEqual({
      breaks: [
        {
          ref: "node/4172398201",
          name: "Anchor Point",
          latitude: 30.5451566,
          longitude: -9.7266502,
          url: "https://www.openstreetmap.org/node/4172398201",
        },
      ],
      rejected: 0,
    });
  });

  it("places a line or an area at its centre", () => {
    const beach = {
      type: "way",
      id: 228543601,
      center: { lat: 39.3378982, lon: -9.3635568 },
      tags: { sport: "surfing", natural: "beach", name: "Praia da Consolação" },
    };

    expect(parse([beach]).breaks).toEqual([
      {
        ref: "way/228543601",
        name: "Praia da Consolação",
        latitude: 39.3378982,
        longitude: -9.3635568,
        url: "https://www.openstreetmap.org/way/228543601",
      },
    ]);
  });

  it("leaves out what is not a break without counting it as rejected", () => {
    const list = parse([
      node({ name: "Anchor Point" }),
      node({ name: "Surf Maroc", shop: "sports" }, { id: 2 }),
      node({}, { id: 3 }),
    ]);

    expect(list.breaks.map((found) => found.ref)).toEqual(["node/4172398201"]);
    expect(list.rejected).toBe(0);
  });

  it("stores a name without control characters or doubled spaces", () => {
    expect(parse([node({ name: " La\tNord \n" })]).breaks[0]?.name).toBe("La Nord");
  });

  it("rejects a break with no position, a position off the globe, or a name too long", () => {
    const list = parse([
      node({ name: "No position" }, { lat: undefined, lon: undefined }),
      node({ name: "Off the globe" }, { lat: 91 }),
      node({ name: "x".repeat(81) }),
      { type: "area", id: 9, lat: 1, lon: 1, tags: { sport: "surfing", name: "Unknown type" } },
    ]);

    expect(list).toEqual({ breaks: [], rejected: 4 });
  });

  it("refuses an answer that is not a list of objects", () => {
    expect(parseSurfingObjects({ version: 0.6 })).toBeInstanceOf(FormatError);
    expect(parseSurfingObjects("<html>")).toBeInstanceOf(FormatError);
  });

  it("refuses an answer Overpass cut short", () => {
    const answer = {
      elements: [node({ name: "Anchor Point" })],
      remark: 'runtime error: Query timed out in "query" at line 1 after 61 seconds.',
    };

    expect(parseSurfingObjects(answer)).toBeInstanceOf(FormatError);
  });
});
