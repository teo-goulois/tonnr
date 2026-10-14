import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { LOCATIONS, QUERY, parseLatestWind } from "./rijkswaterstaat";

const now = new Date("2026-10-14T13:30:00Z");

const A12 = {
  Code: "a12",
  Coordinatenstelsel: "ETRS89",
  Lat: 55.383333,
  Lon: 3.8,
  Naam: "A12 platform",
};

// One entry of the answer, as the service writes it, with what the parser reads of it.
function entry(
  method: string,
  value: number,
  time: string,
  { location = A12, quality = "00" }: { location?: typeof A12; quality?: string } = {},
) {
  return {
    AquoMetadata: {
      Grootheid: { Code: method === "other:F034" ? "WINDRTG" : "WINDSHD" },
      WaardeBepalingsMethode: { Code: method },
    },
    Locatie: location,
    MetingenLijst: [
      {
        Meetwaarde: { Waarde_Alfanumeriek: String(value), Waarde_Numeriek: value },
        Tijdstip: time,
        WaarnemingMetadata: { Kwaliteitswaardecode: quality, Statuswaarde: "Ongecontroleerd" },
      },
    ],
  };
}

function parse(entries: unknown[]) {
  const snapshot = parseLatestWind({ Succesvol: true, WaarnemingenLijst: entries }, now);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseLatestWind", () => {
  it("turns a place's speed and direction into a wind reading", () => {
    const { stations, readings } = parse([
      entry("other:F034", 201.6, "2026-10-14T14:20:00.000+01:00"),
      entry("other:F136", 9.21, "2026-10-14T14:10:00.000+01:00"),
    ]);

    expect(stations).toEqual([
      {
        providerStationId: "a12",
        name: "A12 platform",
        latitude: 55.383333,
        longitude: 3.8,
        licenseType: "cc0-1.0",
        licenseUrl: "https://rijkswaterstaatdata.nl/waterdata/",
        attribution: "Rijkswaterstaat",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "a12",
        observedAt: new Date("2026-10-14T13:10:00Z"),
        windSpeedMs: 9.21,
        windGustMs: null,
        windDirectionDeg: 201.6,
      },
    ]);
  });

  it("prefers the speed corrected to ten metres to the speed at the sensor", () => {
    const { readings } = parse([
      entry("other:F018", 6.45, "2026-10-14T14:20:00.000+01:00"),
      entry("other:F136", 6.62, "2026-10-14T14:10:00.000+01:00"),
    ]);

    expect(readings[0]?.windSpeedMs).toBe(6.62);
  });

  it("reads the speed at the sensor where a place has no other", () => {
    const { readings } = parse([entry("other:F018", 4.42, "2026-10-14T14:20:00.000+01:00")]);

    expect(readings[0]).toMatchObject({ windSpeedMs: 4.42, windDirectionDeg: null });
  });

  it("reads the series that measured last when a place holds several of one kind", () => {
    const { readings } = parse([
      entry("other:F034", 211.1, "2026-10-13T00:50:00.000+01:00"),
      entry("other:F034", 201.6, "2026-10-14T14:10:00.000+01:00"),
      entry("other:F034", 190, "2026-10-12T00:50:00.000+01:00"),
      entry("other:F136", 9.21, "2026-10-14T14:10:00.000+01:00"),
    ]);

    expect(readings[0]?.windDirectionDeg).toBe(201.6);
  });

  it("leaves a direction measured at another time out of the reading", () => {
    const { readings } = parse([
      entry("other:F034", 201.6, "2026-10-14T13:40:00.000+01:00"),
      entry("other:F136", 9.21, "2026-10-14T14:10:00.000+01:00"),
    ]);

    expect(readings[0]?.windDirectionDeg).toBeNull();
  });

  it("leaves out a place silent for more than a week, and one with a direction alone", () => {
    const silent = { ...A12, Code: "europlatform" };
    const { stations } = parse([
      entry("other:F136", 6, "2024-01-31T23:50:00.000+01:00", { location: silent }),
      entry("other:F034", 201.6, "2026-10-14T14:20:00.000+01:00"),
    ]);

    expect(stations).toEqual([]);
  });

  it("rejects the speed the network writes when it measured none", () => {
    const snapshot = parse([entry("other:F018", 999.99, "2026-10-14T14:20:00.000+01:00")]);

    expect(snapshot).toEqual({ stations: [], readings: [], rejected: 1 });
  });

  it("leaves out a value the network does not trust", () => {
    const doubtful = entry("other:F136", 9.21, "2026-10-14T14:10:00.000+01:00", { quality: "99" });

    expect(parse([doubtful]).stations).toEqual([]);
  });

  it("refuses an answer that says it failed", () => {
    expect(parseLatestWind({ Succesvol: false, Foutmelding: "no" })).toBeInstanceOf(FormatError);
  });

  it("asks for the places of the network, and for three series", () => {
    expect(QUERY.LocatieLijst).toHaveLength(LOCATIONS.length);
    expect(QUERY.AquoPlusWaarnemingMetadataLijst).toHaveLength(3);
  });
});
