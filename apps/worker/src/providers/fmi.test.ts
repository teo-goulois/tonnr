import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { parseWaveObservations } from "./fmi";

type Point = [time: string, value: string];

const SUOMENLINNA = {
  id: "103976",
  name: "Helsinki Suomenlinna aaltopoiju",
  pos: "60.12333 24.97283 ",
};
const SANTAPANKKI = { id: "103807", name: "Oulu Santapankki", pos: "65.18083 25.03250 " };

// One member of the answer, cut down to the elements the parser reads.
function member(station: typeof SUOMENLINNA, parameter: string, points: Point[]) {
  return `<wfs:member>
    <omso:PointTimeSeriesObservation>
      <target:Location gml:id="obsloc-fmisid-${station.id}-pos-${parameter}">
        <gml:identifier codeSpace="http://xml.fmi.fi/namespace/stationcode/fmisid">${station.id}</gml:identifier>
        <gml:name codeSpace="http://xml.fmi.fi/namespace/locationcode/name">${station.name}</gml:name>
        <gml:name codeSpace="http://xml.fmi.fi/namespace/locationcode/geoid">-${station.id}</gml:name>
      </target:Location>
      <gml:Point gml:id="point-fmisid-${station.id}-1-1-${parameter}">
        <gml:name>${station.name}</gml:name>
        <gml:pos>${station.pos}</gml:pos>
      </gml:Point>
      <om:result>
        <wml2:MeasurementTimeseries gml:id="obs-obs-1-1-${parameter}">
          ${points
            .map(
              ([time, value]) => `<wml2:point>
            <wml2:MeasurementTVP>
              <wml2:time>${time}</wml2:time>
              <wml2:value>${value}</wml2:value>
            </wml2:MeasurementTVP>
          </wml2:point>`,
            )
            .join("\n")}
        </wml2:MeasurementTimeseries>
      </om:result>
    </omso:PointTimeSeriesObservation>
  </wfs:member>`;
}

function collection(...members: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection timeStamp="2026-10-08T09:10:13Z" numberMatched="${members.length}" numberReturned="${members.length}">
  ${members.join("\n")}
</wfs:FeatureCollection>`;
}

function parse(...members: string[]) {
  const snapshot = parseWaveObservations(collection(...members));
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

const AT_0730 = "2026-10-08T07:30:00Z";
const AT_0800 = "2026-10-08T08:00:00Z";

describe("parseWaveObservations", () => {
  it("joins the parameters of a buoy into one reading per time", () => {
    const { stations, readings } = parse(
      member(SUOMENLINNA, "WaveHs", [
        [AT_0730, "0.3"],
        [AT_0800, "0.4"],
      ]),
      member(SUOMENLINNA, "ModalWDi", [
        [AT_0730, "241.0"],
        [AT_0800, "236.0"],
      ]),
      member(SUOMENLINNA, "TWATER", [
        [AT_0730, "11.2"],
        [AT_0800, "11.2"],
      ]),
      member(SUOMENLINNA, "WTP", [
        [AT_0730, "2.9"],
        [AT_0800, "3.1"],
      ]),
      member(SUOMENLINNA, "WHDD", [
        [AT_0730, "30.5"],
        [AT_0800, "28.0"],
      ]),
    );

    expect(stations).toEqual([
      {
        providerStationId: "103976",
        name: "Helsinki Suomenlinna aaltopoiju",
        latitude: 60.12333,
        longitude: 24.97283,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Finnish Meteorological Institute open data",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "103976",
        observedAt: new Date(AT_0730),
        significantHeightM: 0.3,
        peakDirectionDeg: 241,
        waterTemperatureC: 11.2,
        peakPeriodS: 2.9,
        directionalSpreadDeg: 30.5,
      },
      {
        providerStationId: "103976",
        observedAt: new Date(AT_0800),
        significantHeightM: 0.4,
        peakDirectionDeg: 236,
        waterTemperatureC: 11.2,
        peakPeriodS: 3.1,
        directionalSpreadDeg: 28,
      },
    ]);
  });

  it("leaves a missing value out of the reading", () => {
    const { readings } = parse(
      member(SUOMENLINNA, "WaveHs", [[AT_0800, "0.4"]]),
      member(SUOMENLINNA, "WTP", [[AT_0800, "NaN"]]),
    );

    expect(readings).toEqual([
      { providerStationId: "103976", observedAt: new Date(AT_0800), significantHeightM: 0.4 },
    ]);
  });

  it("leaves out a buoy that reports no wave height", () => {
    const { stations, readings } = parse(
      member(SUOMENLINNA, "WaveHs", [[AT_0800, "0.4"]]),
      member(SANTAPANKKI, "WaveHs", [[AT_0800, "NaN"]]),
      member(SANTAPANKKI, "TWATER", [[AT_0800, "9.8"]]),
    );

    expect(stations.map((station) => station.providerStationId)).toEqual(["103976"]);
    expect(readings).toHaveLength(1);
  });

  it("ignores a parameter it does not know", () => {
    const { readings } = parse(
      member(SUOMENLINNA, "WaveHs", [[AT_0800, "0.4"]]),
      member(SUOMENLINNA, "WaveSomethingNew", [[AT_0800, "12"]]),
    );

    expect(readings).toEqual([
      { providerStationId: "103976", observedAt: new Date(AT_0800), significantHeightM: 0.4 },
    ]);
  });

  it("treats a value the sea cannot produce as missing", () => {
    const { readings } = parse(
      member(SUOMENLINNA, "WaveHs", [[AT_0800, "0.4"]]),
      member(SUOMENLINNA, "ModalWDi", [[AT_0800, "999"]]),
      member(SUOMENLINNA, "WTP", [[AT_0800, "Infinity"]]),
    );

    expect(readings).toEqual([
      { providerStationId: "103976", observedAt: new Date(AT_0800), significantHeightM: 0.4 },
    ]);
  });

  it("rejects a value at a time that does not exist", () => {
    const snapshot = parse(
      member(SUOMENLINNA, "WaveHs", [
        ["2026-02-31T08:00:00Z", "0.4"],
        [AT_0800, "0.5"],
      ]),
    );

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.readings).toEqual([
      { providerStationId: "103976", observedAt: new Date(AT_0800), significantHeightM: 0.5 },
    ]);
  });

  it("rejects a buoy whose position is not on Earth", () => {
    const snapshot = parse(
      member({ ...SUOMENLINNA, pos: "160.12333 24.97283 " }, "WaveHs", [[AT_0800, "0.4"]]),
    );

    expect(snapshot.rejected).toBe(1);
    expect(snapshot.stations).toEqual([]);
    expect(snapshot.readings).toEqual([]);
  });

  it("reads the entities in a buoy's name", () => {
    const { stations } = parse(
      member({ ...SUOMENLINNA, name: "Hanko &amp; Russarö" }, "WaveHs", [[AT_0800, "0.4"]]),
    );

    expect(stations[0]?.name).toBe("Hanko & Russarö");
  });

  it("accepts an empty collection, as when every buoy is out of the water", () => {
    expect(parse()).toEqual({ stations: [], readings: [], rejected: 0 });
  });

  it("reports an answer that is not a collection of observations", () => {
    const result = parseWaveObservations(
      '<ExceptionReport><Exception exceptionCode="OperationParsingFailed"/></ExceptionReport>',
    );

    expect(result).toBeInstanceOf(FormatError);
  });

  it("reports a member without a position instead of guessing", () => {
    const result = parseWaveObservations(
      collection(member({ ...SUOMENLINNA, pos: "" }, "WaveHs", [[AT_0800, "0.4"]])),
    );

    expect(result).toBeInstanceOf(FormatError);
  });
});
