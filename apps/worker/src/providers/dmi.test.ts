import { describe, expect, it } from "vitest";

import { parseObservations, parseStations } from "./dmi";
import { FormatError } from "./format-error";

function collection(features: unknown[]) {
  return { type: "FeatureCollection", features };
}

function value(stationId: string, observed: string, value: number) {
  return { type: "Feature", properties: { stationId, observed, value } };
}

const stations = collection([
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [8.0828, 55.5575] },
    properties: { stationId: "06081", name: "Blåvandshuk Fyr", status: "Active" },
  },
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-52.8517, 68.7081] },
    properties: { stationId: "04220", name: "Aasiaat", status: "Active" },
  },
]);

function places() {
  const parsed = parseStations(stations);
  if (parsed instanceof FormatError) throw parsed;
  return parsed;
}

function parse(speed: unknown[], direction: unknown[] = [], gust: unknown[] = []) {
  const snapshot = parseObservations(
    {
      wind_speed: collection(speed),
      wind_dir: collection(direction),
      wind_max: collection(gust),
    },
    places(),
  );
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseObservations", () => {
  it("turns a station's speed, direction and gust of one moment into a reading", () => {
    const { stations, readings } = parse(
      [value("06081", "2026-10-14T13:40:00Z", 8.23)],
      [value("06081", "2026-10-14T13:40:00Z", 281)],
      [value("06081", "2026-10-14T13:40:00Z", 10.8)],
    );

    expect(stations).toEqual([
      {
        providerStationId: "06081",
        name: "Blåvandshuk Fyr",
        latitude: 55.5575,
        longitude: 8.0828,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://www.dmi.dk/friedata/guides-til-frie-data/vilkar-for-brug-af-data",
        attribution: "Kilde: DMI",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "06081",
        observedAt: new Date("2026-10-14T13:40:00Z"),
        windSpeedMs: 8.23,
        windGustMs: 10.8,
        windDirectionDeg: 281,
      },
    ]);
  });

  it("keeps every moment of the hour, each station once", () => {
    const { stations, readings } = parse([
      value("06081", "2026-10-14T13:30:00Z", 7.9),
      value("06081", "2026-10-14T13:40:00Z", 8.23),
    ]);

    expect(stations).toHaveLength(1);
    expect(readings.map((reading) => reading.windSpeedMs)).toEqual([7.9, 8.23]);
  });

  it("gives a calm wind no direction", () => {
    const { readings } = parse(
      [value("04220", "2026-10-14T13:10:00Z", 0)],
      [value("04220", "2026-10-14T13:10:00Z", 0)],
    );

    expect(readings[0]).toMatchObject({ windSpeedMs: 0, windDirectionDeg: null });
  });

  it("leaves out a moment with no speed, and a station out of service", () => {
    const { stations } = parse(
      [value("09999", "2026-10-14T13:40:00Z", 5)],
      [value("06081", "2026-10-14T13:40:00Z", 281)],
    );

    expect(stations).toEqual([]);
  });

  it("rejects a value with no moment", () => {
    expect(parse([value("06081", "yesterday", 5)]).rejected).toBe(1);
  });

  it("refuses a page cut at the limit, which would lose values", () => {
    const full = Array.from({ length: 10_000 }, () => value("06081", "2026-10-14T13:40:00Z", 5));

    expect(
      parseObservations(
        { wind_speed: collection(full), wind_dir: collection([]), wind_max: collection([]) },
        places(),
      ),
    ).toBeInstanceOf(FormatError);
  });
});
