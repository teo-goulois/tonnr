import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseMetOcean } from "./irish-lights";

const NAMES =
  "longitude,latitude,time,LatonName,mmsi,AverageWindSpeed,GustSpeed,WindDirection,AirTemperature,RelativeHumidity,AirPressure,WaveHeight,WavePeriod,WaterTemperature";
const UNITS =
  "degrees_east,degrees_north,UTC,,,kn,kn,degrees_true,degree_C,percent,hPa,m,s,degree_C";
const BRIGGS_0700 =
  "-5.59553,54.68637,2026-10-08T07:00:00Z,Briggs AIS,992351133,15.0,18.0,255.0,NaN,NaN,NaN,0.6,3.0,14.1";
// Wind and water temperature, no waves.
const BARRELS_0700 =
  "-6.36847,52.13938,2026-10-08T07:00:00Z,Barrels AIS,992501070,12.0,17.0,302.0,NaN,NaN,NaN,NaN,NaN,16.0";
// Waves, no wind.
const FINNIS_0700 =
  "-9.47058,53.04683,2026-10-08T07:00:00Z,Finnis AIS,992501196,NaN,NaN,NaN,NaN,NaN,NaN,1.4,9.0,13.9";

function dataset(...rows: string[]) {
  return [NAMES, UNITS, ...rows, ""].join("\n");
}

function parse(...rows: string[]) {
  const snapshot = parseMetOcean(dataset(...rows));
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("parseMetOcean", () => {
  it("turns a row into a reading, with the wind in metres per second", () => {
    const { stations, readings } = parse(BRIGGS_0700);

    expect(stations).toEqual([
      {
        providerStationId: "992351133",
        name: "Briggs AIS",
        latitude: 54.68637,
        longitude: -5.59553,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Commissioners of Irish Lights",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "992351133",
        observedAt: new Date("2026-10-08T07:00:00Z"),
        significantHeightM: 0.6,
        meanPeriodS: 3,
        waterTemperatureC: 14.1,
        windSpeedMs: 7.717,
        windGustMs: 9.26,
        windDirectionDeg: 255,
      },
    ]);
  });

  it("keeps a site with wind only and a site with waves only", () => {
    const { readings } = parse(BARRELS_0700, FINNIS_0700);

    expect(readings[0]).toMatchObject({
      providerStationId: "992501070",
      significantHeightM: null,
      meanPeriodS: null,
      windSpeedMs: 6.173,
    });
    expect(readings[1]).toMatchObject({
      providerStationId: "992501196",
      significantHeightM: 1.4,
      windSpeedMs: null,
      windDirectionDeg: null,
    });
  });

  it("leaves out a row with neither waves nor wind, and a site that has no other row", () => {
    const { stations, readings } = parse(
      BARRELS_0700.replace("12.0,17.0,302.0", "NaN,NaN,NaN"),
      BRIGGS_0700,
    );

    expect(stations.map((station) => station.providerStationId)).toEqual(["992351133"]);
    expect(readings).toHaveLength(1);
  });

  it("reads an empty field as a missing value, not as zero", () => {
    const { readings } = parse(BRIGGS_0700.replace("15.0,18.0,255.0", ",,"));

    expect(readings[0]).toMatchObject({
      windSpeedMs: null,
      windGustMs: null,
      windDirectionDeg: null,
      significantHeightM: 0.6,
    });
  });

  it("names and places a site after its latest row", () => {
    const earlier = BRIGGS_0700.replace("07:00:00Z,Briggs AIS", "06:00:00Z,Briggs").replace(
      "-5.59553,54.68637",
      "-5.59000,54.68000",
    );
    const { stations, readings } = parse(BRIGGS_0700, earlier);

    expect(readings).toHaveLength(2);
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({ name: "Briggs AIS", latitude: 54.68637 });
  });

  it("rejects a row without a real time, a position, or a site", () => {
    const snapshot = parse(
      BRIGGS_0700.replace("2026-10-08T07:00:00Z", "2026-02-31T07:00:00Z"),
      BRIGGS_0700.replace("-5.59553,54.68637", "NaN,NaN"),
      BRIGGS_0700.replace("992351133", ""),
      FINNIS_0700,
    );

    expect(snapshot.rejected).toBe(3);
    expect(snapshot.readings.map((reading) => reading.providerStationId)).toEqual(["992501196"]);
  });

  it("rejects a row whose site has no MMSI", () => {
    const snapshot = parse(BRIGGS_0700.replace("992351133", "NaN"), FINNIS_0700);

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.stations.map((station) => station.providerStationId)).toEqual(["992501196"]);
  });

  it("rejects a second row for the same site and hour", () => {
    // Barrels reports wind only. A row of Briggs under Barrels' MMSI must not make it a wave site.
    const snapshot = parse(BARRELS_0700, BRIGGS_0700.replace("992351133", "992501070"));

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.stations).toHaveLength(1);
    expect(snapshot.stations[0]).toMatchObject({ name: "Barrels AIS", latitude: 52.13938 });
    expect(snapshot.readings).toHaveLength(1);
    expect(snapshot.readings[0]).toMatchObject({ significantHeightM: null, windSpeedMs: 6.173 });
  });

  it("rejects a row cut short instead of storing a part of it", () => {
    const afterWindSpeed = "-6.36847,52.13938,2026-10-08T07:00:00Z,Barrels AIS,992501070,15.0";

    const middle = parse(afterWindSpeed, FINNIS_0700);
    expect(middle.rejected).toBe(1);
    expect(middle.readings.map((reading) => reading.providerStationId)).toEqual(["992501196"]);

    // Every field is there, but the last one may be cut in the middle of a number.
    const end = parseMetOcean([NAMES, UNITS, FINNIS_0700, BRIGGS_0700].join("\n"));
    if (end instanceof FormatError) throw end;
    expect(end.rejected).toBe(1);
    expect(end.readings.map((reading) => reading.providerStationId)).toEqual(["992501196"]);
  });

  it("reports positions that are no longer in degrees", () => {
    const result = parseMetOcean(
      [NAMES, UNITS.replace("degrees_east,degrees_north", "radians,radians"), BRIGGS_0700, ""].join(
        "\n",
      ),
    );

    expect(result).toBeInstanceOf(FormatError);
    expect(result).toMatchObject({ message: expect.stringContaining("longitude") });
  });

  it("reports a change of unit instead of storing wrong values", () => {
    const result = parseMetOcean(
      [NAMES, UNITS.replace("kn,kn", "m s-1,m s-1"), BRIGGS_0700].join("\n"),
    );

    expect(result).toBeInstanceOf(FormatError);
    expect(result).toMatchObject({ message: expect.stringContaining("AverageWindSpeed") });
  });

  it("reports a dataset without a column it needs", () => {
    const result = parseMetOcean([NAMES.replace(",mmsi,", ",id,"), UNITS, BRIGGS_0700].join("\n"));

    expect(result).toBeInstanceOf(FormatError);
    expect(result).toMatchObject({ message: expect.stringContaining("mmsi") });
  });

  it("accepts a dataset with no rows", () => {
    expect(parse()).toEqual({ stations: [], readings: [], rejected: 0 });
  });
});
