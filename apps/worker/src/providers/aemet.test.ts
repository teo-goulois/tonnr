import { describe, expect, it } from "vitest";

import { decodeData, endOf, parseDataAddress, parseObservations, stationName } from "./aemet";
import { FormatError } from "./format-error";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    idema: "1111X",
    lon: -3.8,
    lat: 43.428,
    alt: 52,
    ubi: "SANTANDER, CMT",
    fint: "2026-10-14T13:00:00+0000",
    prec: 0,
    vv: 6.2,
    vmax: 11.4,
    dv: 290,
    dmax: 300,
    ta: 21.3,
    ...overrides,
  };
}

function parse(entries: unknown[]) {
  const snapshot = parseObservations(entries);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseDataAddress", () => {
  it("reads where the data waits", () => {
    const answer = {
      descripcion: "exito",
      estado: 200,
      datos: "https://opendata.aemet.es/opendata/sh/abc123",
      metadatos: "https://opendata.aemet.es/opendata/sh/def456",
    };

    expect(parseDataAddress(answer)).toBe("https://opendata.aemet.es/opendata/sh/abc123");
  });

  it("refuses an answer that says it did not serve the request", () => {
    const refused = { descripcion: "API key invalido", estado: 401 };

    expect(parseDataAddress(refused)).toBeInstanceOf(FormatError);
  });

  it("refuses data that waits on another host", () => {
    const elsewhere = { estado: 200, datos: "https://example.org/opendata/sh/abc123" };

    expect(parseDataAddress(elsewhere)).toBeInstanceOf(FormatError);
  });
});

describe("decodeData", () => {
  it("reads the agency's ISO-8859-15, and UTF-8 should it change", () => {
    const latin = new Uint8Array([0x4d, 0xc1, 0x4c, 0x41, 0x47, 0x41]);

    expect(decodeData(latin)).toBe("MÁLAGA");
    expect(decodeData(new TextEncoder().encode("MÁLAGA"))).toBe("MÁLAGA");
  });
});

describe("stationName", () => {
  it("writes a name in capitals as a place name is written", () => {
    expect(stationName("SAN SEBASTIÁN, IGUELDO")).toBe("San Sebastián, Igueldo");
    expect(stationName("PUERTO DE LA CRUZ")).toBe("Puerto de la Cruz");
  });
});

describe("endOf", () => {
  it("reads the end of an hour as the agency writes it, and in the other ways of UTC", () => {
    const at = new Date("2026-10-14T13:00:00Z");

    expect(endOf("2026-10-14T13:00:00+0000")).toEqual(at);
    expect(endOf("2026-10-14T13:00:00")).toEqual(at);
    expect(endOf("2026-10-14T13:00:00+00:00")).toEqual(at);
    expect(endOf("2026-10-14T13:00:00Z")).toEqual(at);
    expect(endOf("2026-10-14T15:00:00+0200")).toEqual(at);
  });
});

describe("parseObservations", () => {
  it("turns each hour of a station into a wind reading", () => {
    const { stations, readings } = parse([
      entry({ fint: "2026-10-14T12:00:00+0000", vv: 5.1, vmax: 9.8, dv: 280 }),
      entry(),
    ]);

    expect(stations).toEqual([
      {
        providerStationId: "1111X",
        name: "Santander, Cmt",
        latitude: 43.428,
        longitude: -3.8,
        licenseType: "aemet-terms",
        licenseUrl: "https://www.aemet.es/en/nota_legal",
        attribution: "© AEMET",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "1111X",
        observedAt: new Date("2026-10-14T12:00:00Z"),
        windSpeedMs: 5.1,
        windGustMs: 9.8,
        windDirectionDeg: 280,
      },
      {
        providerStationId: "1111X",
        observedAt: new Date("2026-10-14T13:00:00Z"),
        windSpeedMs: 6.2,
        windGustMs: 11.4,
        windDirectionDeg: 290,
      },
    ]);
  });

  it("leaves out a station with no anemometer, and gives a calm wind no direction", () => {
    const { stations, readings } = parse([
      entry({ idema: "2222", vv: undefined, vmax: undefined, dv: undefined }),
      entry({ vv: 0, vmax: 0.4, dv: 0 }),
    ]);

    expect(stations.map((station) => station.providerStationId)).toEqual(["1111X"]);
    expect(readings[0]).toMatchObject({ windSpeedMs: 0, windDirectionDeg: null });
  });

  it("rejects an hour that cannot be, and a station with no place", () => {
    const { rejected } = parse([
      entry({ fint: "2026-02-31T13:00:00+0000" }),
      entry({ lat: undefined }),
      entry(),
    ]);

    expect(rejected).toBe(2);
  });

  it("says what the first row held when no row could be read", () => {
    const error = parseObservations([entry({ fint: "14/10/2026 13:00" })]);

    expect(error).toBeInstanceOf(FormatError);
    expect(String((error as FormatError).message)).toContain('fint "14/10/2026 13:00"');
  });
});
