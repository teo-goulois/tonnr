import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseActiveStations, parseLatestObservations } from "./ndbc";

const activeStations = `<?xml version="1.0" encoding="utf-8"?><stations created="2026-10-08T07:10:04UTC" count="3">
  <station id="46071" lat="51.035" lon="179.808" name="WESTERN ALEUTIANS" owner="NDBC" pgm="NDBC Meteorological/Ocean" type="buoy" met="y"/>
  <station id="42044" lat="26.191" lon="-97.051" name="PS-1126 TABS J" owner="Texas A&amp;M University" pgm="IOOS Partners" type="buoy" met="y"/>
  <station id="22101" lat="37.23" lon="126.02" name="" owner="Korean Meteorological Administration" pgm="International Partners" type="buoy" met="y"/>
</stations>`;

const latestObservations = `#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE
#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft
15009     0.000   -3.051 2026 10 08 06 00 199   6.0    MM   MM  MM   MM  MM 1012.9    MM  25.6  26.6    MM   MM     MM
46071    51.035  179.808 2026 10 08 06 50 230  14.0  18.0  6.4  12  8.7 225 1001.2    MM   7.1    MM    MM   MM     MM
22101    37.24   126.02  2026 10 08 06 00 360   2.0    MM  0.5   6   MM  MM     MM    MM  20.2  22.8    MM   MM     MM
42044    26.191  -97.051 2026 10 08 06 30  MM    MM    MM  1.1   7  5.2 110     MM    MM    MM  28.4    MM   MM     MM
`;

function parse() {
  const snapshot = parseLatestObservations(latestObservations, parseActiveStations(activeStations));
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseActiveStations", () => {
  it("reads each station's name, owner, and program", () => {
    const details = parseActiveStations(activeStations);

    expect(details.size).toBe(3);
    expect(details.get("42044")).toEqual({
      name: "PS-1126 TABS J",
      owner: "Texas A&M University",
      program: "IOOS Partners",
    });
  });
});

describe("parseLatestObservations", () => {
  it("keeps only the stations that report a wave height", () => {
    const { stations, readings } = parse();

    expect(stations.map((station) => station.providerStationId)).toEqual([
      "46071",
      "22101",
      "42044",
    ]);
    expect(readings).toHaveLength(3);
  });

  it("maps the columns to measurements, with null for a missing one", () => {
    const [reading] = parse().readings;

    expect(reading).toEqual({
      providerStationId: "46071",
      observedAt: new Date("2026-10-08T06:50:00Z"),
      significantHeightM: 6.4,
      peakPeriodS: 12,
      meanPeriodS: 8.7,
      peakDirectionDeg: 225,
      waterTemperatureC: null,
      windSpeedMs: 14,
      windGustMs: 18,
      windDirectionDeg: 230,
    });
  });

  it("marks NOAA's own buoys as public domain", () => {
    const [station] = parse().stations;

    expect(station).toMatchObject({
      name: "WESTERN ALEUTIANS",
      licenseType: "public-domain",
      attribution: "NOAA National Data Buoy Center",
      commercialUse: true,
    });
  });

  it("credits a partner's buoy to its owner and leaves commercial use unknown", () => {
    const station = parse().stations.find((candidate) => candidate.providerStationId === "42044");

    expect(station).toMatchObject({
      licenseType: "ndbc-partner",
      attribution: "Texas A&M University, relayed by the NOAA National Data Buoy Center",
      commercialUse: null,
    });
  });

  it("names a station after its id when NDBC gives no name", () => {
    const station = parse().stations.find((candidate) => candidate.providerStationId === "22101");

    expect(station?.name).toBe("Station 22101");
  });

  it("treats a station without a known NOAA program as a partner's", () => {
    const details = parseActiveStations('<station id="46071" name="Test" owner="Private Owner"/>');
    const snapshot = parseLatestObservations(latestObservations, details);
    if (snapshot instanceof FormatError) throw snapshot;

    expect(snapshot.stations[0]).toMatchObject({
      licenseType: "ndbc-partner",
      attribution: "Private Owner, relayed by the NOAA National Data Buoy Center",
      commercialUse: null,
    });
  });

  it("rejects a row dated on a day that does not exist", () => {
    const text = latestObservations.replace("2026 10 08 06 50", "2026 02 31 06 50");
    const snapshot = parseLatestObservations(text, new Map());
    if (snapshot instanceof FormatError) throw snapshot;

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.readings.map((reading) => reading.providerStationId)).toEqual([
      "22101",
      "42044",
    ]);
  });

  it("ignores a wave height that is not a finite number", () => {
    const text = latestObservations.replace("18.0  6.4", "18.0  Infinity");
    const snapshot = parseLatestObservations(text, new Map());
    if (snapshot instanceof FormatError) throw snapshot;

    expect(snapshot.readings.map((reading) => reading.providerStationId)).toEqual([
      "22101",
      "42044",
    ]);
  });

  it("treats a measurement the sea cannot produce as missing", () => {
    // A wave height too large for the database, and a wind direction past 360 degrees.
    const text = latestObservations
      .replace("18.0  6.4", "18.0  1e39")
      .replace(
        "22101    37.24   126.02  2026 10 08 06 00 360",
        "22101    37.24   126.02  2026 10 08 06 00 999",
      );
    const snapshot = parseLatestObservations(text, new Map());
    if (snapshot instanceof FormatError) throw snapshot;

    expect(snapshot.readings.map((reading) => reading.providerStationId)).toEqual([
      "22101",
      "42044",
    ]);
    expect(snapshot.readings[0]?.windDirectionDeg).toBeNull();
  });

  it("rejects a row whose position is not on Earth", () => {
    const text = latestObservations.replace("51.035  179.808", "151.035  179.808");
    const snapshot = parseLatestObservations(text, new Map());
    if (snapshot instanceof FormatError) throw snapshot;

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.stations.map((station) => station.providerStationId)).toEqual([
      "22101",
      "42044",
    ]);
  });

  it("reports a changed file format instead of guessing", () => {
    const result = parseLatestObservations("#STN LAT LON\n46071 51.0 179.8\n", new Map());

    expect(result).toBeInstanceOf(FormatError);
  });
});
