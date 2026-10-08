import { fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, StationInput } from "./provider";
import { parseUtcTime } from "./utc-date";

// The Instituto Hidrográfico, the hydrographic institute of the Portuguese navy, runs Datawell
// wave buoys off mainland Portugal, Madeira, and the Azores. Its API lists the buoys and serves
// each one's last fifteen days, a reading every thirty minutes.
const COLLECTION_URL = "https://ogcapi.hidrografico.pt/collections/buoys_datawell";
const BUOYS_URL = `${COLLECTION_URL}/items?f=json&limit=100`;

// The last twelve hours of each buoy. A reading shows up about two hours after its time.
const WINDOW_MS = 12 * 60 * 60 * 1000;

// Each parameter with the unit the parser was written for. A change of unit would store wrong
// values silently.
const PARAMETERS: Record<string, { measurement: Measurement; unit: string }> = {
  wave_hm0: { measurement: "significantHeightM", unit: "m" },
  wave_hmax: { measurement: "maxHeightM", unit: "m" },
  wave_tp: { measurement: "peakPeriodS", unit: "s" },
  // The spectral mean period, Tm02.
  wave_tm02: { measurement: "meanPeriodS", unit: "s" },
  // The API does not say whether this is counted from true or from magnetic north. The two are
  // one or two degrees apart off mainland Portugal and about eight in the Azores.
  wave_thtp: { measurement: "peakDirectionDeg", unit: "deg" },
  wave_sprtp: { measurement: "directionalSpreadDeg", unit: "deg" },
  sea_water_temperature: { measurement: "waterTemperatureC", unit: "Cel" },
};

// The flags of SeaDataNet that leave a value usable: not checked, good, and probably good.
const USABLE_FLAGS = new Set([0, 1, 2]);
const GOOD_FLAG = 1;

type Buoy = { id: string; name: string; latitude: number; longitude: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "hidrografico", message });
}

/** The address of a buoy's observations over the window that ends now. */
export function observationsUrl(buoyId: string, now: Date) {
  const instant = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;
  const names = Object.keys(PARAMETERS).flatMap((name) => [name, `${name}_qc`]);

  return (
    `${COLLECTION_URL}/instances/nrt/locations/${encodeURIComponent(buoyId)}?f=json` +
    `&datetime=${instant(new Date(now.getTime() - WINDOW_MS))}/${instant(now)}` +
    `&parameter-name=${names.join(",")}`
  );
}

/** Reads the list of buoys and returns those the institute marks as active. */
export function parseBuoys(json: unknown): { buoys: Buoy[]; rejected: number } | FormatError {
  if (!isRecord(json) || !Array.isArray(json.features)) {
    return formatError("the answer has no list of buoys");
  }
  if (typeof json.numberMatched === "number" && json.numberMatched > json.features.length) {
    return formatError("the list of buoys does not fit in one page");
  }

  const buoys: Buoy[] = [];
  let rejected = 0;

  for (const feature of json.features) {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};
    if (properties.status !== "active" && properties.status !== "inactive") {
      return formatError("a buoy has a status other than active or inactive");
    }
    if (properties.status === "inactive") continue;

    const geometry = isRecord(feature) && isRecord(feature.geometry) ? feature.geometry : {};
    const [longitude, latitude]: unknown[] = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];
    const id = typeof properties.id_est === "number" ? String(properties.id_est) : "";
    if (
      !/^\d+$/.test(id) ||
      buoys.some((buoy) => buoy.id === id) ||
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !isPosition(latitude, longitude)
    ) {
      rejected += 1;
      continue;
    }

    // The institute names a buoy by where it is moored, such as "Continente - Leixões".
    const area = typeof properties.area === "string" ? properties.area.trim() : "";
    buoys.push({ id, name: area || `Station ${id}`, latitude, longitude });
  }

  return { buoys, rejected };
}

/**
 * Reads a buoy's observations: a series of times, and for each parameter a series of values and
 * a series of quality flags of the same length. A value flagged as bad or missing is left out.
 */
export function parseObservations(
  json: unknown,
  buoyId: string,
): { readings: ReadingInput[]; rejected: number } | FormatError {
  if (!isRecord(json) || !Array.isArray(json.coverages) || !isRecord(json.parameters)) {
    return formatError(`the observations of buoy ${buoyId} are not a collection of series`);
  }

  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const coverage of json.coverages) {
    const domain = isRecord(coverage) && isRecord(coverage.domain) ? coverage.domain : {};
    const axes = isRecord(domain.axes) ? domain.axes : {};
    const times = isRecord(axes.t) && Array.isArray(axes.t.values) ? axes.t.values : null;
    const ranges = isRecord(coverage) && isRecord(coverage.ranges) ? coverage.ranges : null;
    if (!times || !ranges) return formatError(`a series of buoy ${buoyId} has no times or values`);

    const series: { measurement: Measurement; values: unknown[]; flags: unknown[] }[] = [];
    for (const [name, { measurement, unit }] of Object.entries(PARAMETERS)) {
      const parameter = json.parameters[name];
      const symbol =
        isRecord(parameter) && isRecord(parameter.unit) && isRecord(parameter.unit.symbol)
          ? parameter.unit.symbol.value
          : undefined;
      if (symbol !== unit) {
        return formatError(`${name} is in "${String(symbol)}", not "${unit}"`);
      }

      const range = ranges[name];
      const flagRange = ranges[`${name}_qc`];
      const values = isRecord(range) && Array.isArray(range.values) ? range.values : null;
      const flags =
        isRecord(flagRange) && Array.isArray(flagRange.values) ? flagRange.values : null;
      if (values?.length !== times.length || flags?.length !== times.length) {
        return formatError(
          `${name} of buoy ${buoyId} does not have one value and one flag per time`,
        );
      }
      series.push({ measurement, values, flags });
    }

    for (const [index, time] of times.entries()) {
      const observedAt = typeof time === "string" ? parseUtcTime(time) : null;
      if (!observedAt) {
        rejected += 1;
        continue;
      }

      const reading: ReadingInput = { providerStationId: buoyId, observedAt };
      let unreadable = false;
      for (const { measurement, values, flags } of series) {
        const value = values[index];
        const flag = flags[index];
        // A missing value comes as null, with or without a flag.
        if (value === null) {
          reading[measurement] = null;
        } else if (typeof value !== "number" || typeof flag !== "number") {
          unreadable = true;
        } else {
          reading[measurement] = USABLE_FLAGS.has(flag) ? plausible(measurement, value) : null;
          if (measurement === "significantHeightM") reading.validated = flag === GOOD_FLAG;
        }
      }
      if (unreadable) {
        rejected += 1;
        continue;
      }
      if (reading.significantHeightM != null) readings.push(reading);
    }
  }

  return { readings, rejected };
}

export const hidrografico: Provider = {
  id: "hidrografico",
  // A buoy reports every thirty minutes.
  schedule: "20,50 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const listed = parseBuoys(yield* fetchJson(BUOYS_URL));
    if (listed instanceof FormatError) return yield* listed;

    const now = new Date();
    // One request per active buoy, two at a time, to stay light on the institute's server.
    const series = yield* Effect.forEach(
      listed.buoys,
      (buoy) =>
        Effect.gen(function* () {
          const observations = parseObservations(
            yield* fetchJson(observationsUrl(buoy.id, now)),
            buoy.id,
          );
          if (observations instanceof FormatError) return yield* observations;
          return { buoy, ...observations };
        }).pipe(
          Effect.catch((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`hidrografico: skipped buoy ${buoy.id}`, error);
              return null;
            }),
          ),
        ),
      { concurrency: 2 },
    );

    const read = series.filter((entry) => entry !== null);
    if (listed.buoys.length > 0 && read.length === 0) {
      return yield* formatError("no buoy's observations could be read");
    }

    // An active buoy with no wave height in the window is not stored as a station.
    const reporting = read.filter((entry) => entry.readings.length > 0);
    const stations: StationInput[] = reporting.map(({ buoy }) => ({
      providerStationId: buoy.id,
      name: buoy.name,
      latitude: buoy.latitude,
      longitude: buoy.longitude,
      // The institute licenses the list of buoys under CC BY and their observations under CC BY-NC.
      licenseType: "cc-by-nc-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
      attribution: "Instituto Hidrográfico",
      commercialUse: false,
    }));

    return {
      stations,
      readings: reporting.flatMap((entry) => entry.readings),
      rejected: listed.rejected + read.reduce((total, entry) => total + entry.rejected, 0),
    };
  }),
};
