import { describe, expect, it } from "vitest";

import { UpstreamError } from "@repo/upstream";

import { isRefusal, parseStations, parseWind } from "./coops";
import { FormatError } from "./format-error";

const SAN_FRANCISCO = {
  id: "9414290",
  name: "San Francisco",
  latitude: 37.8063,
  longitude: -122.4659,
};

function row(t: string, s: string, d = "186.0", g = "2.0", f = "0,0") {
  return { t, s, d, dr: "S", g, f };
}

function parse(json: unknown) {
  const snapshot = parseWind(json, SAN_FRANCISCO);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseStations", () => {
  it("reads each station's id, name and place", () => {
    const parsed = parseStations({
      count: 2,
      stations: [
        { id: "9414290", name: "San Francisco", lat: 37.8063, lng: -122.4659, state: "CA" },
        { id: "../other", name: "Not an id", lat: 0, lng: 0 },
      ],
    });

    expect(parsed).toEqual([SAN_FRANCISCO]);
  });
});

describe("parseWind", () => {
  it("turns each value of the hour into a wind reading", () => {
    const { stations, readings } = parse({
      metadata: { id: "9414290", name: "San Francisco" },
      data: [row("2026-10-14 13:36", "0.9", "203.0", "1.3"), row("2026-10-14 13:42", "1.8")],
    });

    expect(stations).toEqual([
      {
        providerStationId: "9414290",
        name: "San Francisco",
        latitude: 37.8063,
        longitude: -122.4659,
        licenseType: "public-domain",
        licenseUrl: "https://tidesandcurrents.noaa.gov/disclaimers.html",
        attribution: "NOAA CO-OPS",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "9414290",
        observedAt: new Date("2026-10-14T13:36:00Z"),
        windSpeedMs: 0.9,
        windGustMs: 1.3,
        windDirectionDeg: 203,
      },
      {
        providerStationId: "9414290",
        observedAt: new Date("2026-10-14T13:42:00Z"),
        windSpeedMs: 1.8,
        windGustMs: 2,
        windDirectionDeg: 186,
      },
    ]);
  });

  it("reads a station whose sensors give no wind as no station", () => {
    const answer = {
      error: { message: "No data was found. This product may not be offered at this station." },
    };

    expect(parse(answer)).toEqual({ stations: [], readings: [], rejected: 0 });
  });

  it("leaves out a value the station flagged, and one it did not measure", () => {
    const { readings } = parse({
      data: [
        row("2026-10-14 13:36", "48.0", "203.0", "52.0", "1,0"),
        row("2026-10-14 13:42", "", "", ""),
        row("2026-10-14 13:48", "1.8"),
      ],
    });

    expect(readings.map((reading) => reading.windSpeedMs)).toEqual([1.8]);
  });

  it("gives a calm wind no direction, and a value with no gust none", () => {
    const { readings } = parse({ data: [row("2026-10-14 13:42", "0.0", "0.0", "")] });

    expect(readings[0]).toMatchObject({ windSpeedMs: 0, windGustMs: null, windDirectionDeg: null });
  });

  it("rejects a value at a moment that cannot be", () => {
    expect(parse({ data: [row("2026-02-31 13:42", "1.8")] }).rejected).toBe(1);
  });

  it("refuses an answer that is neither data nor an error", () => {
    expect(parseWind({ metadata: {} }, SAN_FRANCISCO)).toBeInstanceOf(FormatError);
  });
});

describe("isRefusal", () => {
  it("tells a refusal of the program from a failure of one station", () => {
    const url = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

    expect(isRefusal(new UpstreamError({ url, status: 403, retryable: false }))).toBe(true);
    expect(isRefusal(new UpstreamError({ url, status: 429, retryable: true }))).toBe(true);
    expect(isRefusal(new UpstreamError({ url, status: 502, retryable: true }))).toBe(false);
  });
});
