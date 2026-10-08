import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseWeatherBuoys } from "./marine-institute";

const NAMES =
  "station_id,longitude,latitude,time,WindDirection,WindSpeed,Gust,WaveHeight,WavePeriod,Hmax,SeaTemperature,ThTp,Tp,QC_Flag";
const UNITS =
  ",degrees_east,degrees_north,UTC,degrees true,knots,knots,meters,seconds,meters,degrees_C,degrees_true,seconds,";
const M3_0800 =
  "M3,-10.548261,51.215956,2026-10-08T08:00:00Z,277.0,14.003,17.874,2.695,7.5,4.219,15.269,310.781,11.719,0";
const M2_0800 =
  "M2,-5.4302,53.4836,2026-10-08T08:00:00Z,290.0,16.849,20.151,1.172,4.219,2.031,14.711,90.0,5.039,0";

function dataset(...rows: string[]) {
  return [NAMES, UNITS, ...rows, ""].join("\n");
}

function parse(...rows: string[]) {
  const snapshot = parseWeatherBuoys(dataset(...rows));
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

function ids(rows: { providerStationId: string }[]) {
  return rows.map((row) => row.providerStationId);
}

describe("parseWeatherBuoys", () => {
  it("turns a row into a reading, with the wind in metres per second", () => {
    const { stations, readings } = parse(M3_0800);

    expect(stations).toEqual([
      {
        providerStationId: "M3",
        name: "M3",
        latitude: 51.215956,
        longitude: -10.548261,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Marine Institute, Irish Weather Buoy Network",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "M3",
        observedAt: new Date("2026-10-08T08:00:00Z"),
        significantHeightM: 2.695,
        maxHeightM: 4.219,
        peakPeriodS: 11.719,
        meanPeriodS: 7.5,
        peakDirectionDeg: 310.781,
        waterTemperatureC: 15.269,
        windSpeedMs: 7.204,
        windGustMs: 9.195,
        windDirectionDeg: 277,
        validated: false,
      },
    ]);
  });

  it("marks a row the institute flags as good, and leaves out one it flags as missing", () => {
    const { stations, readings } = parse(
      M3_0800.replace(/,0$/, ",1"),
      M2_0800.replace(/,0$/, ",9"),
    );

    expect(ids(stations)).toEqual(["M3"]);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ providerStationId: "M3", validated: true });
  });

  it("rejects a row with a flag it does not know", () => {
    const snapshot = parse(M3_0800.replace(/,0$/, ",4"), M3_0800.replace(/,0$/, ",NaN"), M2_0800);

    expect(snapshot.rejected).toBe(2);
    expect(ids(snapshot.readings)).toEqual(["M2"]);
  });

  it("rejects a row with a number written in a way it does not know", () => {
    // The first would read as 16 metres, the second as a missing period.
    const snapshot = parse(
      M3_0800.replace(",2.695,", ",0x10,"),
      M3_0800.replace(/,11\.719,0$/, ',"11,719",0'),
      M2_0800,
    );

    expect(snapshot.rejected).toBe(2);
    expect(ids(snapshot.readings)).toEqual(["M2"]);
  });

  it("stores the intact row that follows an unreadable one for the same buoy and hour", () => {
    const snapshot = parse(M3_0800.replace(",11.719,", ",unavailable,"), M3_0800);

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.readings).toHaveLength(1);
    expect(snapshot.readings[0]).toMatchObject({ peakPeriodS: 11.719 });
  });

  it("reads NaN and an empty field as missing values", () => {
    const { readings } = parse(
      M3_0800.replace("2.695,7.5,4.219", "NaN,NaN,NaN").replace(
        "277.0,14.003,17.874",
        "277.0,14.003,",
      ),
    );

    expect(readings[0]).toMatchObject({
      significantHeightM: null,
      meanPeriodS: null,
      maxHeightM: null,
      windSpeedMs: 7.204,
      windGustMs: null,
    });
  });

  it("leaves out a row with neither waves nor wind, and a buoy that has no other row", () => {
    const { stations, readings } = parse(
      M2_0800.replace("290.0,16.849,20.151,1.172", "NaN,NaN,NaN,NaN"),
      M3_0800,
    );

    expect(ids(stations)).toEqual(["M3"]);
    expect(readings).toHaveLength(1);
  });

  it("places a buoy where its latest row puts it", () => {
    const earlier = M3_0800.replace("08:00:00Z", "07:00:00Z").replace(
      "-10.548261,51.215956",
      "-10.540000,51.210000",
    );
    const { stations, readings } = parse(M3_0800, earlier);

    expect(readings).toHaveLength(2);
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({ latitude: 51.215956, longitude: -10.548261 });
  });

  it("rejects a row without a buoy, a real time, or a position on Earth", () => {
    const snapshot = parse(
      M3_0800.replace("M3,", ","),
      M3_0800.replace("2026-10-08T08:00:00Z", "2026-02-31T08:00:00Z"),
      M3_0800.replace("-10.548261,51.215956", "99999.0,99999.0"),
      M2_0800,
    );

    expect(snapshot.rejected).toBe(3);
    expect(ids(snapshot.readings)).toEqual(["M2"]);
  });

  it("rejects a second row for the same buoy and moment, however the time is written", () => {
    const snapshot = parse(
      M3_0800,
      M3_0800.replace("08:00:00Z", "08:00:00+00:00").replace(",2.695,", ",9.000,"),
    );

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.readings).toHaveLength(1);
    expect(snapshot.readings[0]).toMatchObject({ significantHeightM: 2.695 });
  });

  it("rejects a row cut short instead of storing a part of it", () => {
    const middle = parse("M3,-10.548261,51.215956,2026-10-08T08:00:00Z,277.0,14.003", M2_0800);
    expect(middle.rejected).toBe(1);
    expect(ids(middle.readings)).toEqual(["M2"]);

    // Every field is there, but the last one may be cut in the middle of a number.
    const end = parseWeatherBuoys([NAMES, UNITS, M2_0800, M3_0800].join("\n"));
    if (end instanceof FormatError) throw end;
    expect(end.rejected).toBe(1);
    expect(ids(end.readings)).toEqual(["M2"]);
  });

  it("reports a change of unit instead of storing wrong values", () => {
    for (const [from, to, column] of [
      ["knots,knots", "m s-1,m s-1", "WindSpeed"],
      ["meters,seconds,meters", "feet,seconds,meters", "WaveHeight"],
      ["degrees_east,degrees_north", "degrees_east,radians", "latitude"],
    ] as const) {
      const result = parseWeatherBuoys([NAMES, UNITS.replace(from, to), M3_0800, ""].join("\n"));

      expect(result).toBeInstanceOf(FormatError);
      expect(result).toMatchObject({ message: expect.stringContaining(column) });
    }
  });

  it("reports a dataset without a column it needs, or an answer that is not the dataset", () => {
    const withoutPeriod = parseWeatherBuoys(
      [NAMES.replace(",Tp,", ",PeakPeriod,"), UNITS, M3_0800, ""].join("\n"),
    );
    expect(withoutPeriod).toBeInstanceOf(FormatError);
    expect(withoutPeriod).toMatchObject({ message: expect.stringContaining("Tp") });

    expect(parseWeatherBuoys("<html><body>Service unavailable</body></html>\n")).toBeInstanceOf(
      FormatError,
    );
    expect(parseWeatherBuoys("")).toBeInstanceOf(FormatError);
  });

  it("accepts a dataset with no rows", () => {
    expect(parse()).toEqual({ stations: [], readings: [], rejected: 0 });
  });
});
