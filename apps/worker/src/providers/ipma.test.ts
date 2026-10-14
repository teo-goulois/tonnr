import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseObservations, parseStations } from "./ipma";

const places = parseStations([
  {
    geometry: { type: "Point", coordinates: [-8.62705278, 41.529375] },
    type: "Feature",
    properties: { idEstacao: 1210881, localEstacao: "Barcelos (CIM)" },
  },
]);

function values(speed: number, direction: number) {
  return {
    intensidadeVentoKM: speed * 3.6,
    temperatura: 26.4,
    idDireccVento: direction,
    intensidadeVento: speed,
    radiacao: 0,
  };
}

function parse(json: unknown) {
  if (places instanceof FormatError) throw places;
  const snapshot = parseObservations(json, places);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseObservations", () => {
  it("turns each hour of a station into a wind reading", () => {
    const { stations, readings } = parse({
      "2026-10-14T12:00": { "1210881": values(4.1, 7) },
      "2026-10-14T13:00": { "1210881": values(5.3, 2) },
    });

    expect(stations).toEqual([
      {
        providerStationId: "1210881",
        name: "Barcelos (CIM)",
        latitude: 41.529375,
        longitude: -8.62705278,
        licenseType: "ipma-terms",
        licenseUrl: "https://api.ipma.pt/",
        attribution: "IPMA",
        commercialUse: false,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "1210881",
        observedAt: new Date("2026-10-14T12:00:00Z"),
        windSpeedMs: 4.1,
        windGustMs: null,
        windDirectionDeg: 270,
      },
      {
        providerStationId: "1210881",
        observedAt: new Date("2026-10-14T13:00:00Z"),
        windSpeedMs: 5.3,
        windGustMs: null,
        windDirectionDeg: 45,
      },
    ]);
  });

  it("reads 1 and 9 as north, and 0 as no direction", () => {
    const { readings } = parse({
      "2026-10-14T11:00": { "1210881": values(3, 1) },
      "2026-10-14T12:00": { "1210881": values(3, 9) },
      "2026-10-14T13:00": { "1210881": values(0, 0) },
    });

    expect(readings.map((reading) => reading.windDirectionDeg)).toEqual([360, 360, null]);
  });

  it("leaves out an hour a station did not send, a speed it does not have, and a station it does not place", () => {
    const { readings } = parse({
      "2026-10-14T11:00": { "1210881": null },
      "2026-10-14T12:00": { "1210881": values(-99, 0) },
      "2026-10-14T13:00": { "1200579": values(3, 2) },
    });

    expect(readings).toEqual([]);
  });

  it("rejects an hour that cannot be", () => {
    expect(parse({ "2026-02-31T13:00": { "1210881": values(3, 2) } }).rejected).toBe(1);
  });
});
