import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseLatestTime, parseStationTable, parseWindMap } from "./jma";

const observedAt = new Date("2026-10-14T13:40:00Z");

const table = {
  "11001": {
    type: "C",
    elems: "11112010",
    lat: [45, 31.2],
    lon: [141, 56.1],
    alt: 26,
    kjName: "宗谷岬",
    knName: "ソウヤミサキ",
    enName: "Cape Soya",
  },
  "11016": { type: "A", lat: [45, 24.9], lon: [141, 40.7], kjName: "稚内", enName: "" },
};

function places() {
  const parsed = parseStationTable(table);
  if (parsed instanceof FormatError) throw parsed;
  return parsed;
}

function parse(values: unknown) {
  const snapshot = parseWindMap(values, observedAt, places());
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseLatestTime", () => {
  it("reads the moment of the last values and the name of their file", () => {
    expect(parseLatestTime("2026-10-14T22:40:00+09:00\n")).toEqual({
      observedAt,
      file: "20261014224000",
    });
  });

  it("refuses a time written in another zone, which would name another file", () => {
    expect(parseLatestTime("2026-10-14T13:40:00Z")).toBeInstanceOf(FormatError);
  });
});

describe("parseWindMap", () => {
  it("turns a station's speed and point of the compass into a wind reading", () => {
    const { stations, readings } = parse({
      "11001": { temp: [8.8, 0], windDirection: [11, 0], wind: [10.7, 0] },
    });

    expect(stations).toEqual([
      {
        providerStationId: "11001",
        name: "Cape Soya",
        latitude: 45.52,
        longitude: 141.935,
        licenseType: "pdl-1.0",
        licenseUrl: "https://www.jma.go.jp/jma/en/copyright.html",
        attribution:
          "Source: Japan Meteorological Agency website (https://www.jma.go.jp/bosai/map.html#contents=amedas)",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "11001",
        observedAt,
        windSpeedMs: 10.7,
        windGustMs: null,
        windDirectionDeg: 247.5,
      },
    ]);
  });

  it("names a station in Japanese when it has no English name", () => {
    expect(parse({ "11016": { wind: [3, 0], windDirection: [16, 0] } }).stations[0]).toMatchObject({
      name: "稚内",
    });
  });

  it("reads the sixteenth point as north, and a calm as no direction", () => {
    const { readings } = parse({
      "11001": { wind: [3, 0], windDirection: [16, 0] },
      "11016": { wind: [0, 0], windDirection: [0, 0] },
    });

    expect(readings.map((reading) => reading.windDirectionDeg)).toEqual([360, null]);
  });

  it("leaves out a station that measures no wind, and a speed the agency flagged", () => {
    const { stations } = parse({
      "11001": { temp: [8.8, 0], precipitation1h: [0, 0] },
      "11016": { wind: [12, 6], windDirection: [11, 6] },
    });

    expect(stations).toEqual([]);
  });

  it("leaves out a station the table does not place", () => {
    expect(parse({ "99999": { wind: [3, 0] } }).stations).toEqual([]);
  });
});
