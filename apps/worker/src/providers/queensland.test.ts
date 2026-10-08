import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseWaveFile } from "./queensland";

const now = new Date("2026-10-08T09:00:00Z");

const NOTE = "Wave Data provided @ 18:40hrs on 08-10-2026";
const HEADER =
  "Site, SiteNumber, Seconds, DateTime, Latitude, Longitude, Hs, Hmax, Tp, Tz, SST, Direction, Current Speed, Current Direction";
// 1791444000 is 07:20 UTC on 8 October 2026, which the file also writes as 17:20 local time.
const CALOUNDRA_0720 =
  "Caloundra,54,1791444000,2026-10-08T17:20:00,-26.84737,153.15553,0.807,1.370,7.140,5.263,21.20,81.60,-99.90,-99.90";
const MACKAY_0740 =
  "Mackay Harbour (east of southern breakwater),4740htx,1791445200,2026-10-08 17:40:00,-21.11280,149.24250,0.340,0.500,3.100,2.900,24.40,125.22,-99.90,-99.90";

function file(...rows: string[]) {
  return [NOTE, HEADER, ...rows, ""].join("\n");
}

function parse(...rows: string[]) {
  const snapshot = parseWaveFile(file(...rows), now);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseWaveFile", () => {
  it("turns a row into a reading, dated from its seconds in UTC", () => {
    const { stations, readings } = parse(CALOUNDRA_0720);

    expect(stations).toEqual([
      {
        providerStationId: "54",
        name: "Caloundra",
        latitude: -26.84737,
        longitude: 153.15553,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution:
          "© State of Queensland (Department of the Environment, Tourism, Science and Innovation)",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "54",
        observedAt: new Date("2026-10-08T07:20:00Z"),
        significantHeightM: 0.807,
        maxHeightM: 1.37,
        peakPeriodS: 7.14,
        meanPeriodS: 5.263,
        waterTemperatureC: 21.2,
        peakDirectionDeg: 81.6,
      },
    ]);
  });

  it("keeps a site number that is not a number", () => {
    const { stations } = parse(MACKAY_0740);

    expect(stations[0]).toMatchObject({
      providerStationId: "4740htx",
      name: "Mackay Harbour (east of southern breakwater)",
    });
  });

  it("reads -99.9 as a missing value", () => {
    const { readings } = parse(CALOUNDRA_0720.replace("7.140,5.263,21.20", "-99.90,5.263,-99.90"));

    expect(readings[0]).toMatchObject({
      significantHeightM: 0.807,
      peakPeriodS: null,
      meanPeriodS: 5.263,
      waterTemperatureC: null,
    });
  });

  it("leaves out a row without a wave height, and a site that has no other row", () => {
    const { stations, readings } = parse(
      CALOUNDRA_0720.replace(",0.807,", ",-99.90,"),
      MACKAY_0740,
    );

    expect(stations.map((station) => station.providerStationId)).toEqual(["4740htx"]);
    expect(readings).toHaveLength(1);
  });

  it("keeps the last two days only", () => {
    // 1791270000 is 07:00 UTC on 6 October 2026, two hours too old.
    const { stations, readings } = parse(
      CALOUNDRA_0720.replace("1791444000", "1791270000"),
      MACKAY_0740,
    );

    expect(stations.map((station) => station.providerStationId)).toEqual(["4740htx"]);
    expect(readings).toHaveLength(1);
  });

  it("places a site where its latest row puts it", () => {
    const earlier = CALOUNDRA_0720.replace("1791444000", "1791442800").replace(
      "-26.84737,153.15553",
      "-26.84700,153.15500",
    );
    const { stations, readings } = parse(CALOUNDRA_0720, earlier);

    expect(readings).toHaveLength(2);
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({ latitude: -26.84737, longitude: 153.15553 });
  });

  it("rejects a row without a time or with a position that is not on Earth", () => {
    const snapshot = parse(
      CALOUNDRA_0720.replace("1791444000", ""),
      CALOUNDRA_0720.replace("-26.84737", "-126.84737"),
      CALOUNDRA_0720.replace("-26.84737,153.15553", ","),
      MACKAY_0740,
    );

    expect(snapshot.rejected).toBe(3);
    expect(snapshot.readings.map((reading) => reading.providerStationId)).toEqual(["4740htx"]);
  });

  it("finds the columns by name, wherever they are", () => {
    const text = [
      NOTE,
      "SiteNumber, Site, Hs, Seconds, Longitude, Latitude",
      "54,Caloundra,0.807,1791444000,153.15553,-26.84737",
    ].join("\n");
    const snapshot = parseWaveFile(text, now);
    if (snapshot instanceof FormatError) throw snapshot;

    expect(snapshot.readings).toEqual([
      {
        providerStationId: "54",
        observedAt: new Date("2026-10-08T07:20:00Z"),
        significantHeightM: 0.807,
        maxHeightM: null,
        peakPeriodS: null,
        meanPeriodS: null,
        waterTemperatureC: null,
        peakDirectionDeg: null,
      },
    ]);
    expect(snapshot.stations[0]).toMatchObject({ latitude: -26.84737, longitude: 153.15553 });
  });

  it("reports a file without the columns it needs instead of guessing", () => {
    const result = parseWaveFile(
      [NOTE, "Site, SiteNumber, DateTime, Hs", "Caloundra,54,2026-10-08T17:20:00,0.8"].join("\n"),
      now,
    );

    expect(result).toBeInstanceOf(FormatError);
    expect(result).toMatchObject({ message: expect.stringContaining("Seconds") });
  });
});
