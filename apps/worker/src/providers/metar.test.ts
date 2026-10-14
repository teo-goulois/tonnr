import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { openFile, parseReports, parseStationNames } from "./metar";

const now = new Date("2026-10-14T14:00:00Z");

const HEADER =
  "raw_text,station_id,observation_time,latitude,longitude,temp_c,dewpoint_c," +
  "wind_dir_degrees,wind_speed_kt,wind_gust_kt,visibility_statute_mi,sky_cover,sky_cover";

function report(
  id: string,
  direction: string,
  speed: string,
  gust = "",
  time = "2026-10-14T13:30:00.000Z",
) {
  return `"METAR ${id} 141330Z",${id},${time},43.4690,-1.5340,27,17,${direction},${speed},${gust},6+,FEW,BKN`;
}

const names = parseStationNames([
  { id: "LFBZ", icaoId: "LFBZ", site: "Biarritz/Parme Arpt", lat: 43.469, lon: -1.534 },
  { id: "32012", icaoId: null, site: "Woods Hole Stratus Wave Station" },
]);

function parse(...rows: string[]) {
  if (names instanceof FormatError) throw names;
  // The cache's file ends with no line break.
  const snapshot = parseReports([HEADER, ...rows].join("\n"), names, now);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseReports", () => {
  it("turns an airport's report into a wind reading in metres per second", () => {
    const { stations, readings } = parse(report("LFBZ", "100", "8", "20"));

    expect(stations).toEqual([
      {
        providerStationId: "LFBZ",
        name: "Biarritz/Parme Arpt",
        latitude: 43.469,
        longitude: -1.534,
        licenseType: "public-domain",
        licenseUrl: "https://aviationweather.gov/data/api/",
        attribution: "NOAA Aviation Weather Center",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "LFBZ",
        observedAt: new Date("2026-10-14T13:30:00Z"),
        windSpeedMs: 4.116,
        windGustMs: 10.289,
        windDirectionDeg: 100,
      },
    ]);
  });

  it("gives a calm or a variable wind no direction, and keeps the north", () => {
    const { readings } = parse(report("LFBZ", "0", "3"), report("WADD", "360", "10"));

    expect(readings.map((reading) => reading.windDirectionDeg)).toEqual([null, 360]);
  });

  it("names an airport the list does not know by its code", () => {
    expect(parse(report("WADD", "130", "10")).stations[0]?.name).toBe("WADD");
  });

  it("leaves out a report without wind, and one from more than a day ago", () => {
    const old = report("LEST", "270", "4", "", "2026-10-12T13:30:00.000Z");

    expect(parse(report("LFBZ", "", ""), old)).toEqual({ stations: [], readings: [], rejected: 0 });
  });

  it("rejects a report with no place", () => {
    const placeless = report("LFBZ", "100", "8").replace("43.4690,-1.5340", ",");

    expect(parse(placeless).rejected).toBe(1);
  });

  it("refuses a file whose header lost a column it reads", () => {
    if (names instanceof FormatError) throw names;
    expect(parseReports("raw_text,station_id\n", names, now)).toBeInstanceOf(FormatError);
  });
});

describe("openFile", () => {
  it("opens a compressed file, and reads one that came open", () => {
    expect(openFile(gzipSync("station_id\n"))).toBe("station_id\n");
    expect(openFile(new TextEncoder().encode("station_id\n"))).toBe("station_id\n");
  });
});
