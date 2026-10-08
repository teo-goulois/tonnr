import { describe, expect, it } from "vitest";

import { parseCurrentReadings } from "./cefas";
import { FormatError } from "./format-error";

const now = new Date("2026-10-08T09:20:00Z");

function usage(owner: string, licence: string, number: number) {
  return `Data provided by "${owner}". Data usage license "${licence}" (see https://wavenet-api.cefas.co.uk/api/Licence/${number}/Download). No re-use without prior agreement. Please include acknowledgement.`;
}

function result(description: string, unit: string, value: string) {
  return { description, unit, values: [value], labelDecimalPlaces: 1 };
}

// A feature as the map answers it, without the fields that only draw it.
function buoy(properties: Record<string, unknown> = {}, results: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-4.276166666666667, 51.0585] },
    properties: {
      id: "223",
      title: "Bideford Bay Waverider",
      source: "EXT",
      reference: "223~EXT",
      provider: "Channel Coastal Observatory",
      timestamp: "2026-10-08T07:31:00",
      results: {
        Hm0: result("Significant Wave Height", "m", "1.16"),
        TEMP: result("Temperature", "°C", "17.45"),
        Tz: result("Average (zero crossing) wave period", "s", "4.0"),
        Tpeak: result("Dominant (peak) wave period", "s", "5.3"),
        W_SPR: result("Wave spread", "°", "18"),
        W_PDIR: result("Dominant (peak) wave direction", "°", "309"),
        ...results,
      },
      usage: usage("Channel Coastal Observatory", "Open Government Licence", 1),
      overdue: "",
      ...properties,
    },
  };
}

function parse(...features: unknown[]) {
  const snapshot = parseCurrentReadings({ type: "FeatureCollection", features }, now);
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

function ids(rows: { providerStationId: string }[]) {
  return rows.map((row) => row.providerStationId);
}

describe("parseCurrentReadings", () => {
  it("turns a buoy into a station and a reading, dated in UTC", () => {
    const { stations, readings } = parse(buoy());

    expect(stations).toEqual([
      {
        providerStationId: "223-EXT",
        name: "Bideford Bay Waverider",
        latitude: 51.0585,
        longitude: -4.276166666666667,
        licenseType: "ogl-3.0",
        licenseUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        attribution:
          "Data provided by Channel Coastal Observatory through Cefas WaveNet. Contains public sector information licensed under the Open Government Licence v3.0.",
        commercialUse: null,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "223-EXT",
        observedAt: new Date("2026-10-08T07:31:00Z"),
        significantHeightM: 1.16,
        peakPeriodS: 5.3,
        meanPeriodS: 4,
        peakDirectionDeg: 309,
        directionalSpreadDeg: 18,
        waterTemperatureC: 17.45,
      },
    ]);
  });

  it("credits a buoy of Cefas to WaveNet alone, and reads a time that names UTC", () => {
    const { stations, readings } = parse(
      buoy({
        id: "ARBROATH",
        source: "INT",
        provider: "Cefas",
        timestamp: "2026-10-08T08:30:00Z",
        usage: usage("Cefas", "Open Government Licence", 1),
      }),
    );

    expect(stations[0]).toMatchObject({
      providerStationId: "ARBROATH-INT",
      attribution:
        "Data provided by Cefas WaveNet. Contains public sector information licensed under the Open Government Licence v3.0.",
    });
    expect(readings[0]?.observedAt).toEqual(new Date("2026-10-08T08:30:00Z"));
  });

  it("leaves out a buoy under any licence but the open one", () => {
    const { stations, readings } = parse(
      buoy({ id: "HINKLY3DWR", usage: usage("Cefas", "EDF Energy non-commercial licence", 3) }),
      buoy({ id: "367", usage: usage("Cefas", "Cefas WaveNet commercial use licence", 4) }),
      buoy({ id: "EAOW", usage: usage("EAOW", "EAOW No Availability Licence", 5) }),
      buoy(),
    );

    expect(ids(stations)).toEqual(["223-EXT"]);
    expect(ids(readings)).toEqual(["223-EXT"]);
  });

  it("leaves out a buoy whose last reading is old, or that has none", () => {
    const { stations, readings } = parse(
      buoy({ id: "40", title: "M4 Buoy", timestamp: "2026-03-29T04:00:00" }),
      buoy({ id: "367", timestamp: null }),
      buoy(),
    );

    expect(ids(stations)).toEqual(["223-EXT"]);
    expect(readings).toHaveLength(1);
  });

  it("reads an empty text as a missing value, and skips a result the buoy does not list", () => {
    const { readings } = parse(
      buoy({}, { W_SPR: result("Wave spread", "°", ""), W_PDIR: undefined }),
    );

    expect(readings[0]).toEqual({
      providerStationId: "223-EXT",
      observedAt: new Date("2026-10-08T07:31:00Z"),
      significantHeightM: 1.16,
      peakPeriodS: 5.3,
      meanPeriodS: 4,
      directionalSpreadDeg: null,
      waterTemperatureC: 17.45,
    });
  });

  it("leaves out a buoy without a wave height", () => {
    const { stations, readings } = parse(
      buoy({}, { Hm0: result("Significant Wave Height", "m", "") }),
    );

    expect(stations).toEqual([]);
    expect(readings).toEqual([]);
  });

  it("treats a value the sea cannot produce as missing", () => {
    const { readings } = parse(
      buoy({}, { W_PDIR: result("Dominant (peak) wave direction", "°", "999") }),
    );

    expect(readings[0]).toMatchObject({ peakDirectionDeg: null, significantHeightM: 1.16 });
  });

  it("keeps apart two buoys with the same id, one of Cefas and one of another body", () => {
    const { stations } = parse(buoy({ id: "40", source: "INT" }), buoy({ id: "40" }));

    expect(ids(stations)).toEqual(["40-INT", "40-EXT"]);
  });

  it("rejects a buoy listed twice, or without an id, a real time, or a position on Earth", () => {
    const snapshot = parse(
      buoy(),
      buoy(),
      buoy({ id: "" }),
      buoy({ id: "1", timestamp: "2026-02-31T07:31:00" }),
      buoy({ id: "2", timestamp: "08/10/2026 07:31" }),
      { ...buoy({ id: "3" }), geometry: { type: "Point", coordinates: [-4.27, 151.05] } },
      { ...buoy({ id: "4" }), geometry: null },
    );

    expect(snapshot.rejected).toBe(6);
    expect(ids(snapshot.stations)).toEqual(["223-EXT"]);
    expect(snapshot.readings).toHaveLength(1);
  });

  it("reports a change of unit instead of storing wrong values", () => {
    const snapshot = parseCurrentReadings(
      { features: [buoy({}, { Hm0: result("Significant Wave Height", "cm", "116") })] },
      now,
    );

    expect(snapshot).toBeInstanceOf(FormatError);
    expect(snapshot).toMatchObject({ message: expect.stringContaining("Hm0") });
  });

  it("reports a buoy that does not state its licence", () => {
    expect(parseCurrentReadings({ features: [buoy({ usage: undefined })] }, now)).toBeInstanceOf(
      FormatError,
    );
    expect(parseCurrentReadings({ features: [null] }, now)).toBeInstanceOf(FormatError);
  });

  it("reports an answer that is not a list of buoys", () => {
    expect(parseCurrentReadings({ message: "Service unavailable" }, now)).toBeInstanceOf(
      FormatError,
    );
    expect(parseCurrentReadings("<html></html>", now)).toBeInstanceOf(FormatError);
  });

  it("accepts an empty list", () => {
    expect(parse()).toEqual({ stations: [], readings: [], rejected: 0 });
  });
});
