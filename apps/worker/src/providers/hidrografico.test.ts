import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import { observationsUrl, parseBuoys, parseObservations } from "./hidrografico";

function buoy(properties: Record<string, unknown> = {}, coordinates: unknown = [-8.9825, 41.3155]) {
  return {
    type: "Feature",
    id: 4,
    geometry: { type: "Point", coordinates },
    properties: {
      id_est: 4,
      name: "CSA92/D",
      area: "Continente - Leixões",
      status: "active",
      nrt: "near-real-time data available",
      last_sea: "2026-10-08T09:32:16+00:00",
      ...properties,
    },
  };
}

function listed(...features: unknown[]) {
  const result = parseBuoys({
    type: "FeatureCollection",
    features,
    numberMatched: features.length,
  });
  if (result instanceof FormatError) throw result;
  return result;
}

const UNITS: Record<string, string> = {
  wave_hm0: "m",
  wave_hmax: "m",
  wave_tp: "s",
  wave_tm02: "s",
  wave_thtp: "deg",
  wave_sprtp: "deg",
  sea_water_temperature: "Cel",
};

const TIMES = ["2026-10-08T09:02:16Z", "2026-10-08T09:32:16Z"];
const VALUES: Record<string, unknown[]> = {
  wave_hm0: [2.09, 2.2],
  wave_hmax: [2.83, 3.76],
  wave_tp: [10, 10],
  wave_tm02: [5.7, 6],
  wave_thtp: [335, 332],
  wave_sprtp: [17, 20],
  sea_water_temperature: [16.4, 16.4],
};

// An answer as the API gives it, cut down to what the parser reads.
function observations(
  overrides: {
    times?: unknown[];
    values?: Record<string, unknown[]>;
    flags?: Record<string, unknown[]>;
    units?: Record<string, string>;
  } = {},
) {
  const times = overrides.times ?? TIMES;
  const parameters: Record<string, unknown> = {};
  const ranges: Record<string, unknown> = {};
  for (const [name, unit] of Object.entries({ ...UNITS, ...overrides.units })) {
    parameters[name] = { type: "Parameter", unit: { symbol: { value: unit } } };
    parameters[`${name}_qc`] = { type: "Parameter" };
    ranges[name] = { type: "NdArray", values: overrides.values?.[name] ?? VALUES[name] };
    ranges[`${name}_qc`] = {
      type: "NdArray",
      values: overrides.flags?.[name] ?? times.map(() => 1),
    };
  }

  return {
    type: "CoverageCollection",
    domainType: "PointSeries",
    parameters,
    coverages: [
      {
        type: "Coverage",
        id: "4",
        domain: {
          type: "Domain",
          axes: { x: { values: [-8.9825] }, y: { values: [41.3155] }, t: { values: times } },
        },
        ranges,
      },
    ],
  };
}

function parse(json: unknown) {
  const result = parseObservations(json, "4");
  if (result instanceof FormatError) throw result;
  return result;
}

describe("parseBuoys", () => {
  it("keeps the active buoys, named after where they are moored", () => {
    const { buoys, rejected } = listed(
      buoy(),
      buoy({ id_est: 20, area: "Continente - Faro", status: "inactive" }, [-7.89779, 36.904495]),
      buoy({ id_est: 19, area: " Continente - Sines " }, [-8.9286, 37.9211]),
    );

    expect(rejected).toBe(0);
    expect(buoys).toEqual([
      { id: "4", name: "Continente - Leixões", latitude: 41.3155, longitude: -8.9825 },
      { id: "19", name: "Continente - Sines", latitude: 37.9211, longitude: -8.9286 },
    ]);
  });

  it("rejects a buoy without an id, listed twice, or without a position on Earth", () => {
    const { buoys, rejected } = listed(
      buoy(),
      buoy(),
      buoy({ id_est: null }),
      buoy({ id_est: 5 }, [-8.98, 141.3]),
      buoy({ id_est: 6 }, null),
    );

    expect(rejected).toBe(4);
    expect(buoys.map((entry) => entry.id)).toEqual(["4"]);
  });

  it("reports a status it does not know instead of guessing", () => {
    const result = parseBuoys({ features: [buoy({ status: "maintenance" })] });

    expect(result).toBeInstanceOf(FormatError);
  });

  it("reports a list cut by paging, and an answer that is not a list", () => {
    expect(parseBuoys({ features: [buoy()], numberMatched: 120 })).toBeInstanceOf(FormatError);
    expect(parseBuoys({ code: "NotFound" })).toBeInstanceOf(FormatError);
    expect(parseBuoys("<html></html>")).toBeInstanceOf(FormatError);
  });
});

describe("parseObservations", () => {
  it("turns each time into a reading", () => {
    const { readings, rejected } = parse(observations());

    expect(rejected).toBe(0);
    expect(readings).toEqual([
      {
        providerStationId: "4",
        observedAt: new Date("2026-10-08T09:02:16Z"),
        significantHeightM: 2.09,
        maxHeightM: 2.83,
        peakPeriodS: 10,
        meanPeriodS: 5.7,
        peakDirectionDeg: 335,
        directionalSpreadDeg: 17,
        waterTemperatureC: 16.4,
        validated: true,
      },
      {
        providerStationId: "4",
        observedAt: new Date("2026-10-08T09:32:16Z"),
        significantHeightM: 2.2,
        maxHeightM: 3.76,
        peakPeriodS: 10,
        meanPeriodS: 6,
        peakDirectionDeg: 332,
        directionalSpreadDeg: 20,
        waterTemperatureC: 16.4,
        validated: true,
      },
    ]);
  });

  it("leaves out a value flagged as bad or missing, and keeps the rest of the reading", () => {
    const { readings } = parse(
      observations({
        flags: { wave_tp: [4, 9], wave_thtp: [3, 2], sea_water_temperature: [1, 0] },
      }),
    );

    expect(readings[0]).toMatchObject({
      peakPeriodS: null,
      peakDirectionDeg: null,
      significantHeightM: 2.09,
    });
    expect(readings[1]).toMatchObject({
      peakPeriodS: null,
      peakDirectionDeg: 332,
      waterTemperatureC: 16.4,
    });
  });

  it("marks a reading as validated only when its wave height is flagged good", () => {
    const { readings } = parse(observations({ flags: { wave_hm0: [0, 2] } }));

    expect(readings.map((reading) => reading.validated)).toEqual([false, false]);
    expect(readings.map((reading) => reading.significantHeightM)).toEqual([2.09, 2.2]);
  });

  it("leaves out a time without a usable wave height", () => {
    const missing = parse(observations({ values: { ...VALUES, wave_hm0: [null, 2.2] } }));
    expect(missing.readings.map((reading) => reading.significantHeightM)).toEqual([2.2]);
    expect(missing.rejected).toBe(0);

    const bad = parse(observations({ flags: { wave_hm0: [4, 1] } }));
    expect(bad.readings.map((reading) => reading.significantHeightM)).toEqual([2.2]);
  });

  it("treats a value the sea cannot produce as missing", () => {
    const { readings } = parse(observations({ values: { ...VALUES, wave_thtp: [999, 332] } }));

    expect(readings.map((reading) => reading.peakDirectionDeg)).toEqual([null, 332]);
  });

  it("rejects a time it cannot read, and a value that is not a number", () => {
    const badTime = parse(
      observations({ times: ["2026-02-31T09:02:16Z", "2026-10-08T09:32:16Z"] }),
    );
    expect(badTime.rejected).toBe(1);
    expect(badTime.readings).toHaveLength(1);

    const badValue = parse(observations({ values: { ...VALUES, wave_tp: ["10,0", 10] } }));
    expect(badValue.rejected).toBe(1);
    expect(badValue.readings.map((reading) => reading.peakPeriodS)).toEqual([10]);

    const badFlag = parse(observations({ flags: { wave_tp: ["A", 1] } }));
    expect(badFlag.rejected).toBe(1);
    expect(badFlag.readings).toHaveLength(1);
  });

  it("reports a change of unit instead of storing wrong values", () => {
    const result = parseObservations(observations({ units: { wave_hm0: "cm" } }), "4");

    expect(result).toBeInstanceOf(FormatError);
    expect(result).toMatchObject({ message: expect.stringContaining("wave_hm0") });
  });

  it("reports a series cut short: fewer values or flags than times", () => {
    const shortValues = observations({ values: { ...VALUES, wave_tp: [10] } });
    const shortFlags = observations({ flags: { wave_tp: [1] } });

    expect(parseObservations(shortValues, "4")).toBeInstanceOf(FormatError);
    expect(parseObservations(shortFlags, "4")).toBeInstanceOf(FormatError);
  });

  it("reports a parameter that went missing, and an answer that is not a series", () => {
    const whole = observations();
    const withoutPeriod = {
      ...whole,
      coverages: whole.coverages.map((coverage) => {
        const { wave_tp: _, ...ranges } = coverage.ranges as Record<string, unknown>;
        return { ...coverage, ranges };
      }),
    };

    expect(parseObservations(withoutPeriod, "4")).toBeInstanceOf(FormatError);
    expect(parseObservations({ code: "NoMatch", description: "no data" }, "4")).toBeInstanceOf(
      FormatError,
    );
  });

  it("accepts a buoy with no observation in the window", () => {
    const empty = observations({
      times: [],
      values: Object.fromEntries(Object.keys(UNITS).map((name) => [name, []])),
    });

    expect(parse(empty)).toEqual({ readings: [], rejected: 0 });
    expect(parse({ type: "CoverageCollection", parameters: {}, coverages: [] })).toEqual({
      readings: [],
      rejected: 0,
    });
  });
});

describe("observationsUrl", () => {
  it("asks for the twelve hours that end now, with every parameter and its flag", () => {
    const url = observationsUrl("4", new Date("2026-10-08T11:48:40.123Z"));

    expect(url).toContain("/collections/buoys_datawell/instances/nrt/locations/4?f=json");
    expect(url).toContain("datetime=2026-10-07T23:48:40Z/2026-10-08T11:48:40Z");
    expect(url).toContain("wave_hm0,wave_hm0_qc,");
    expect(url).toContain("sea_water_temperature,sea_water_temperature_qc");
  });
});
