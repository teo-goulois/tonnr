import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseLiveStations } from "./openwindmap";

const now = new Date("2026-10-08T08:25:00Z");

function station(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    meta: { name: "Sauveterre" },
    location: { latitude: 43.456832, longitude: 0.846397, success: true },
    measurements: {
      date: "2026-10-08T08:19:47.000Z",
      wind_heading: 315,
      wind_speed_avg: 18,
      wind_speed_max: 36,
      wind_speed_min: 2.75,
    },
    status: { state: "on" },
    ...overrides,
  };
}

function parse(data: unknown[]) {
  const snapshot = parseLiveStations({ data }, now);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseLiveStations", () => {
  it("turns a station into a wind reading in metres per second", () => {
    const { stations, readings } = parse([station()]);

    expect(stations).toEqual([
      {
        providerStationId: "41",
        name: "Sauveterre",
        latitude: 43.456832,
        longitude: 0.846397,
        licenseType: "openwindmap-community",
        licenseUrl: "https://developers.pioupiou.fr/data-licensing/",
        attribution:
          "Wind data (c) contributors of the OpenWindMap wind network <https://openwindmap.org>",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "41",
        observedAt: new Date("2026-10-08T08:19:47Z"),
        windSpeedMs: 5,
        windGustMs: 10,
        windDirectionDeg: 315,
      },
    ]);
  });

  it("leaves out a station that has no position or no wind speed yet", () => {
    const noPosition = station({ id: 1, location: { latitude: null, longitude: null } });
    const noSpeed = station({
      id: 2,
      measurements: { date: "2026-10-08T08:19:47.000Z", wind_speed_avg: null },
    });

    expect(parse([noPosition, noSpeed])).toEqual({ stations: [], readings: [], rejected: 0 });
  });

  it("leaves out a station silent for more than a week", () => {
    const silent = station({
      measurements: { date: "2026-09-20T10:00:00.000Z", wind_speed_avg: 12 },
    });

    expect(parse([silent]).stations).toEqual([]);
  });

  it("rejects an entry it cannot make sense of", () => {
    const farFuture = station({
      measurements: { date: "2126-10-08T08:19:47.000Z", wind_speed_avg: 12 },
    });
    const notAStation = "station";
    const impossibleSpeed = station({
      id: 3,
      measurements: { date: "2026-10-08T08:19:47.000Z", wind_speed_avg: 4000 },
    });

    expect(parse([farFuture, notAStation, impossibleSpeed])).toEqual({
      stations: [],
      readings: [],
      rejected: 3,
    });
  });

  it("names a station after its id when it has no name", () => {
    expect(parse([station({ meta: {} })]).stations[0]?.name).toBe("Station 41");
  });

  it("reports a feed without a station list", () => {
    expect(parseLiveStations({ stations: [] }, now)).toBeInstanceOf(FormatError);
  });
});
