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
      ...properties,
    },
  };
}

function list(features: unknown[], more: Record<string, unknown> = {}) {
  return { type: "FeatureCollection", features, numberMatched: features.length, ...more };
}

function listed(...features: unknown[]) {
  const result = parseBuoys(list(features));
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

type Series = {
  id?: unknown;
  times?: unknown[];
  values?: Record<string, unknown[]>;
  flags?: Record<string, unknown[]>;
};

// One buoy's series as the API gives it, cut down to what the parser reads.
function coverage({ id = "4", times = TIMES, values = {}, flags = {} }: Series = {}) {
  const ranges: Record<string, Record<string, unknown>> = {};
  for (const name of Object.keys(UNITS)) {
    const shape = [times.length];
    ranges[name] = {
      type: "NdArray",
      axisNames: ["t"],
      shape,
      values: values[name] ?? VALUES[name]?.slice(0, times.length),
    };
    ranges[`${name}_qc`] = {
      type: "NdArray",
      axisNames: ["t"],
      shape,
      values: flags[name] ?? times.map(() => 1),
    };
  }

  return {
    type: "Coverage",
    id,
    domain: {
      type: "Domain",
      domainType: "PointSeries",
      axes: { x: { values: [-8.9825] }, y: { values: [41.3155] }, t: { values: times } },
    },
    ranges,
  };
}

function parameters(units: Record<string, string> = {}) {
  const result: Record<string, unknown> = {};
  for (const [name, unit] of Object.entries({ ...UNITS, ...units })) {
    result[name] = { type: "Parameter", unit: { symbol: { value: unit } } };
    result[`${name}_qc`] = { type: "Parameter" };
  }
  return result;
}

function collection(coverages: unknown[], units: Record<string, string> = {}) {
  return {
    type: "CoverageCollection",
    domainType: "PointSeries",
    parameters: parameters(units),
    coverages,
  };
}

function parse(json: unknown) {
  const result = parseObservations(json);
  if (result instanceof FormatError) throw result;
  return result;
}

function parseOne(series: Series = {}) {
  return parse(collection([coverage(series)]));
}

describe("parseBuoys", () => {
  it("names each buoy after where it is moored, whatever its status", () => {
    const { buoys, rejected } = listed(
      buoy(),
      buoy({ id_est: 20, area: "Continente - Faro", status: "inactive" }, [-7.89779, 36.904495]),
      buoy({ id_est: 19, area: " Continente - Sines " }, [-8.9286, 37.9211]),
    );

    expect(rejected).toBe(0);
    expect(buoys).toEqual([
      { id: "4", name: "Continente - Leixões", latitude: 41.3155, longitude: -8.9825 },
      { id: "20", name: "Continente - Faro", latitude: 36.904495, longitude: -7.89779 },
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

  it("reports a list that is not whole", () => {
    const next = {
      rel: "next",
      href: "https://ogcapi.hidrografico.pt/collections/buoys_datawell/items?offset=1",
    };

    expect(parseBuoys(list([buoy()], { numberMatched: 120 }))).toBeInstanceOf(FormatError);
    expect(parseBuoys(list([buoy()], { numberReturned: 2 }))).toBeInstanceOf(FormatError);
    expect(parseBuoys({ features: [buoy()], links: [next] })).toBeInstanceOf(FormatError);
  });

  it("accepts a list that gives no count, and reports an answer that is not a list", () => {
    expect(parseBuoys({ features: [buoy()], links: [{ rel: "self" }] })).not.toBeInstanceOf(
      FormatError,
    );
    expect(parseBuoys({ code: "NotFound" })).toBeInstanceOf(FormatError);
    expect(parseBuoys("<html></html>")).toBeInstanceOf(FormatError);
  });
});

describe("parseObservations", () => {
  it("turns each time of each buoy into a reading", () => {
    const { readings, rejected } = parse(
      collection([coverage(), coverage({ id: "19", times: [TIMES[1]] })]),
    );

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
      {
        providerStationId: "19",
        observedAt: new Date("2026-10-08T09:32:16Z"),
        significantHeightM: 2.09,
        maxHeightM: 2.83,
        peakPeriodS: 10,
        meanPeriodS: 5.7,
        peakDirectionDeg: 335,
        directionalSpreadDeg: 17,
        waterTemperatureC: 16.4,
        validated: true,
      },
    ]);
  });

  it("reads one buoy that comes as a single series, not as a collection", () => {
    const single = { ...coverage(), parameters: parameters() };

    expect(parse(single).readings.map((reading) => reading.providerStationId)).toEqual(["4", "4"]);
  });

  it("leaves out a value whose flag says not to use it, and keeps the rest of the reading", () => {
    const { readings, rejected } = parseOne({
      flags: { wave_tp: [4, 9], wave_thtp: [3, "A"], wave_sprtp: [8, 5], wave_hmax: [6, 7] },
    });

    expect(rejected).toBe(0);
    expect(readings).toHaveLength(2);
    for (const reading of readings) {
      expect(reading).toMatchObject({
        peakPeriodS: null,
        peakDirectionDeg: null,
        directionalSpreadDeg: null,
        maxHeightM: null,
        waterTemperatureC: 16.4,
        validated: true,
      });
    }
  });

  it("marks a reading as validated only when every value it keeps is flagged good", () => {
    const { readings } = parseOne({
      times: [...TIMES, "2026-10-08T10:02:16Z", "2026-10-08T10:32:16Z"],
      values: Object.fromEntries(Object.keys(UNITS).map((name) => [name, [1, 1, 1, 1]])),
      flags: {
        // Good, not checked, probably good, and no flag at all.
        wave_tp: [1, 0, 2, null],
        // A value left out for a bad flag says nothing about the values that stay.
        wave_thtp: [4, 1, 1, 1],
      },
    });

    expect(readings.map((reading) => reading.validated)).toEqual([true, false, false, false]);
    expect(readings.map((reading) => reading.peakPeriodS)).toEqual([1, 1, 1, 1]);
  });

  it("reads a flag written as text like the same flag written as a number", () => {
    const { readings } = parseOne({ flags: { wave_tp: ["1", "4"] } });

    expect(readings.map((reading) => reading.peakPeriodS)).toEqual([10, null]);
    expect(readings.map((reading) => reading.validated)).toEqual([true, true]);
  });

  it("leaves out a time without a usable wave height", () => {
    const missing = parseOne({ values: { wave_hm0: [null, 2.2] } });
    expect(missing.readings.map((reading) => reading.significantHeightM)).toEqual([2.2]);
    expect(missing.rejected).toBe(0);

    const bad = parseOne({ flags: { wave_hm0: [4, 1] } });
    expect(bad.readings.map((reading) => reading.significantHeightM)).toEqual([2.2]);
  });

  it("treats a value the sea cannot produce as missing", () => {
    const { readings } = parseOne({ values: { wave_thtp: [999, 332] } });

    expect(readings.map((reading) => reading.peakDirectionDeg)).toEqual([null, 332]);
  });

  it("rejects a time it cannot read, a value that is not a number, and a flag it does not know", () => {
    const badTime = parseOne({ times: ["2026-02-31T09:02:16Z", TIMES[1]] });
    expect(badTime.rejected).toBe(1);
    expect(badTime.readings).toHaveLength(1);

    const badValue = parseOne({ values: { wave_tp: ["10,0", 10] } });
    expect(badValue.rejected).toBe(1);
    expect(badValue.readings.map((reading) => reading.peakPeriodS)).toEqual([10]);

    const badFlag = parseOne({ flags: { wave_tp: ["Z", 1] } });
    expect(badFlag.rejected).toBe(1);
    expect(badFlag.readings).toHaveLength(1);
  });

  it("reads a time written with another zone or without seconds", () => {
    const { readings } = parseOne({ times: ["2026-10-08T10:02:16+01:00", "2026-10-08T09:32Z"] });

    expect(readings.map((reading) => reading.observedAt)).toEqual([
      new Date("2026-10-08T09:02:16Z"),
      new Date("2026-10-08T09:32:00Z"),
    ]);
  });

  it("rejects a second value for the same buoy and moment", () => {
    const first = coverage({ times: [TIMES[0]] });
    const again = coverage({ times: ["2026-10-08T09:02:16+00:00"], values: { wave_hm0: [7] } });
    const { readings, rejected } = parse(collection([first, again]));

    expect(rejected).toBe(1);
    expect(readings.map((reading) => reading.significantHeightM)).toEqual([2.09]);
  });

  it("reports a change of unit instead of storing wrong values", () => {
    const result = parseObservations(collection([coverage()], { wave_hm0: "cm" }));

    expect(result).toBeInstanceOf(FormatError);
    expect(result).toMatchObject({ message: expect.stringContaining("wave_hm0") });
  });

  it("reports a series whose values do not follow its times", () => {
    const shortValues = coverage({ values: { wave_tp: [10] } });
    const shortFlags = coverage({ flags: { wave_tp: [1] } });
    const wrongShape = coverage();
    (wrongShape.ranges.wave_tp as Record<string, unknown>).shape = [9];
    const otherAxis = coverage();
    (otherAxis.ranges.wave_tp as Record<string, unknown>).axisNames = ["z"];

    for (const broken of [shortValues, shortFlags, wrongShape, otherAxis]) {
      expect(parseObservations(collection([broken]))).toBeInstanceOf(FormatError);
    }
  });

  it("reports a series that does not say which buoy it is, or is not a series over time", () => {
    const grid = coverage();
    (grid.domain as Record<string, unknown>).domainType = "Grid";

    expect(parseObservations(collection([coverage({ id: null })]))).toBeInstanceOf(FormatError);
    expect(parseObservations(collection([coverage({ id: 4 })]))).toBeInstanceOf(FormatError);
    expect(parseObservations(collection([grid]))).toBeInstanceOf(FormatError);
  });

  it("reports a parameter that went missing, and an answer that is not a series", () => {
    const whole = coverage();
    const { wave_tp: _, ...ranges } = whole.ranges;

    expect(parseObservations(collection([{ ...whole, ranges }]))).toBeInstanceOf(FormatError);
    expect(parseObservations({ code: "NoMatch", description: "no data" })).toBeInstanceOf(
      FormatError,
    );
  });

  it("reports an answer that reached the most buoys one query returns", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => coverage({ id: String(index + 1) }));

    expect(parseObservations(collection(twenty))).toBeInstanceOf(FormatError);
    expect(parseObservations(collection(twenty.slice(1)))).not.toBeInstanceOf(FormatError);
  });

  it("accepts an answer with no buoy, and a buoy with no observation in the window", () => {
    const empty = Object.fromEntries(Object.keys(UNITS).map((name) => [name, []]));

    expect(parse(collection([]))).toEqual({ readings: [], rejected: 0 });
    expect(parseOne({ times: [], values: empty })).toEqual({ readings: [], rejected: 0 });
  });
});

describe("observationsUrl", () => {
  it("asks for every buoy over the twelve hours that end now, with each parameter and its flag", () => {
    const url = new URL(observationsUrl(new Date("2026-10-08T11:48:40.123Z")));

    expect(url.pathname).toBe("/collections/buoys_datawell/instances/nrt/area");
    expect(url.searchParams.get("datetime")).toBe("2026-10-07T23:48:40Z/2026-10-08T11:48:40Z");
    expect(url.searchParams.get("coords")).toMatch(/^POLYGON\(\(/);
    expect(url.searchParams.get("parameter-name")?.split(",")).toEqual(
      Object.keys(UNITS).flatMap((name) => [name, `${name}_qc`]),
    );
  });
});
