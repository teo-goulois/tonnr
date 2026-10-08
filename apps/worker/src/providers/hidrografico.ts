import { fetchJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

// The Instituto Hidrográfico, the hydrographic institute of the Portuguese navy, runs Datawell
// wave buoys off mainland Portugal, Madeira, and the Azores. Its API lists the buoys and serves
// their last fifteen days, a reading every thirty minutes.
const COLLECTION_URL = "https://ogcapi.hidrografico.pt/collections/buoys_datawell";
const BUOYS_URL = `${COLLECTION_URL}/items?f=json&limit=100`;

// One query returns every buoy inside an area, twenty at most. This one covers the collection:
// mainland Portugal, Madeira, and the Azores.
const AREA = "POLYGON((-32 32,-7 32,-7 42.5,-32 42.5,-32 32))";
const AREA_BUOY_LIMIT = 20;
// The last twelve hours. A reading shows up about two hours after its time.
const WINDOW_MS = 12 * 60 * 60 * 1000;

// Each parameter with the unit the parser was written for. A change of unit would store wrong
// values silently.
const PARAMETERS: Record<string, { measurement: Measurement; unit: string }> = {
  wave_hm0: { measurement: "significantHeightM", unit: "m" },
  wave_hmax: { measurement: "maxHeightM", unit: "m" },
  wave_tp: { measurement: "peakPeriodS", unit: "s" },
  // The spectral mean period, Tm02.
  wave_tm02: { measurement: "meanPeriodS", unit: "s" },
  // The institute does not say whether this is counted from true or from magnetic north. In
  // October 2026 the two are 1 degree apart off the mainland, 3 at Madeira, and 8 in the Azores.
  wave_thtp: { measurement: "peakDirectionDeg", unit: "deg" },
  wave_sprtp: { measurement: "directionalSpreadDeg", unit: "deg" },
  sea_water_temperature: { measurement: "waterTemperatureC", unit: "Cel" },
};

// The quality flags of SeaDataNet (vocabulary L20). A value keeps its place when nobody checked
// it, when it is good, or when it is probably good. Every other flag leaves it out: probably bad,
// bad, changed, beyond a limit, interpolated, missing, or uncertain.
const KNOWN_FLAGS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "Q"]);
const USABLE_FLAGS = new Set(["0", "1", "2"]);
const GOOD_FLAG = "1";

// Who to credit besides the institute, from each buoy's own record. Téo read the record of
// Leixões on 2026-10-08. The records of the other buoys have not been read.
const ALSO_CREDITED: Record<string, string> = {
  "4": "Administração dos Portos do Douro, Leixões e Viana do Castelo",
};

type Buoy = { id: string; name: string; latitude: number; longitude: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "hidrografico", message });
}

/** The address of every buoy's observations over the window that ends now. */
export function observationsUrl(now: Date) {
  const instant = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;
  const names = Object.keys(PARAMETERS).flatMap((name) => [name, `${name}_qc`]);
  const query = new URLSearchParams({
    f: "json",
    coords: AREA,
    datetime: `${instant(new Date(now.getTime() - WINDOW_MS))}/${instant(now)}`,
    "parameter-name": names.join(","),
  });

  return `${COLLECTION_URL}/instances/nrt/area?${query}`;
}

/** Reads the list of buoys: where each one is, and the name of the place it is moored at. */
export function parseBuoys(json: unknown): { buoys: Buoy[]; rejected: number } | FormatError {
  if (!isRecord(json) || !Array.isArray(json.features)) {
    return formatError("the answer has no list of buoys");
  }
  const { features } = json;
  // The list must be whole: a second page would hold buoys that are then never named.
  const counts = [json.numberMatched, json.numberReturned].filter(
    (count) => typeof count === "number",
  );
  const hasNextPage =
    Array.isArray(json.links) && json.links.some((link) => isRecord(link) && link.rel === "next");
  if (hasNextPage || counts.some((count) => count !== features.length)) {
    return formatError("the list of buoys does not fit in one page");
  }

  const buoys: Buoy[] = [];
  let rejected = 0;

  for (const feature of features) {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};
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

/** A quality flag as its code, or null when it is not one of the vocabulary's. */
function flagCode(flag: unknown) {
  const code = typeof flag === "number" || typeof flag === "string" ? String(flag) : "";
  return KNOWN_FLAGS.has(code) ? code : null;
}

/**
 * Reads the observations: one series per buoy, named by the buoy's id. A series holds its
 * times, and for each parameter as many values and quality flags as it has times.
 */
export function parseObservations(
  json: unknown,
): { readings: ReadingInput[]; rejected: number } | FormatError {
  // One buoy alone may come as a single series instead of a collection of one.
  const collection =
    isRecord(json) && json.type === "Coverage" ? { ...json, coverages: [json] } : json;
  if (
    !isRecord(collection) ||
    !Array.isArray(collection.coverages) ||
    !isRecord(collection.parameters)
  ) {
    return formatError("the observations are not a collection of series");
  }
  if (collection.coverages.length >= AREA_BUOY_LIMIT) {
    return formatError(`the answer holds ${AREA_BUOY_LIMIT} buoys, the most one query returns`);
  }

  const readings: ReadingInput[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  for (const coverage of collection.coverages) {
    const buoyId = isRecord(coverage) && typeof coverage.id === "string" ? coverage.id : "";
    const domain = isRecord(coverage) && isRecord(coverage.domain) ? coverage.domain : {};
    const axes = isRecord(domain.axes) ? domain.axes : {};
    const times = isRecord(axes.t) && Array.isArray(axes.t.values) ? axes.t.values : null;
    const ranges = isRecord(coverage) && isRecord(coverage.ranges) ? coverage.ranges : null;
    if (!/^\d+$/.test(buoyId) || domain.domainType !== "PointSeries" || !times || !ranges) {
      return formatError("a series is not that of one buoy over time");
    }

    // The values of a range along time, or null when the range is laid out any other way.
    const alongTime = (name: string) => {
      const range = ranges[name];
      if (!isRecord(range) || !Array.isArray(range.values)) return null;
      const { axisNames, shape, values } = range;
      const isAlongTime =
        values.length === times.length &&
        (axisNames === undefined || (Array.isArray(axisNames) && axisNames.join() === "t")) &&
        (shape === undefined || (Array.isArray(shape) && shape.join() === `${times.length}`));
      return isAlongTime ? values : null;
    };

    const series: { measurement: Measurement; values: unknown[]; flags: unknown[] }[] = [];
    for (const [name, { measurement, unit }] of Object.entries(PARAMETERS)) {
      const parameter = collection.parameters[name];
      const symbol =
        isRecord(parameter) && isRecord(parameter.unit) && isRecord(parameter.unit.symbol)
          ? parameter.unit.symbol.value
          : undefined;
      if (symbol !== unit) {
        return formatError(`${name} is in "${String(symbol)}", not "${unit}"`);
      }

      const values = alongTime(name);
      const flags = alongTime(`${name}_qc`);
      if (!values || !flags) {
        return formatError(
          `${name} of buoy ${buoyId} does not have one value and one flag per time`,
        );
      }
      series.push({ measurement, values, flags });
    }

    for (const [index, time] of times.entries()) {
      const observedAt = typeof time === "string" ? parseZonedTime(time) : null;
      const key = `${buoyId} ${observedAt?.getTime()}`;
      if (!observedAt || seen.has(key)) {
        rejected += 1;
        continue;
      }

      const reading: ReadingInput = { providerStationId: buoyId, observedAt, validated: true };
      let unreadable = false;
      for (const { measurement, values, flags } of series) {
        const value = values[index];
        const flag = flags[index];
        if (value === null) {
          reading[measurement] = null;
        } else if (typeof value !== "number" || (flag !== null && flagCode(flag) === null)) {
          unreadable = true;
        } else {
          // A value without a flag is kept as one nobody checked.
          const code = flag === null ? "0" : flagCode(flag);
          const kept =
            code !== null && USABLE_FLAGS.has(code) ? plausible(measurement, value) : null;
          reading[measurement] = kept;
          // Validated means that every value the reading keeps was checked and found good.
          if (kept !== null && code !== GOOD_FLAG) reading.validated = false;
        }
      }
      if (unreadable) {
        rejected += 1;
        continue;
      }
      seen.add(key);
      if (reading.significantHeightM != null) readings.push(reading);
    }
  }

  return { readings, rejected };
}

export const hidrografico: Provider = {
  id: "hidrografico",
  // A buoy reports every thirty minutes. Two requests a run: the list, then every buoy's readings.
  schedule: "20,50 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const listed = parseBuoys(yield* fetchJson(BUOYS_URL));
    if (listed instanceof FormatError) return yield* listed;

    const observations = parseObservations(yield* fetchJson(observationsUrl(new Date())));
    if (observations instanceof FormatError) return yield* observations;

    // A reading of a buoy the list does not name cannot be placed.
    const listedIds = new Set(listed.buoys.map((buoy) => buoy.id));
    const readings = observations.readings.filter((reading) =>
      listedIds.has(reading.providerStationId),
    );
    const reporting = new Set(readings.map((reading) => reading.providerStationId));

    const stations: StationInput[] = listed.buoys
      .filter((buoy) => reporting.has(buoy.id))
      .map((buoy) => ({
        providerStationId: buoy.id,
        name: buoy.name,
        latitude: buoy.latitude,
        longitude: buoy.longitude,
        // The institute licenses the list of buoys under CC BY and their observations under
        // CC BY-NC, which asks for the credit, a link to the source, and a word on what changed.
        licenseType: "cc-by-nc-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
        attribution:
          `${["Instituto Hidrográfico", ALSO_CREDITED[buoy.id]].filter(Boolean).join(" and ")}, ` +
          `<${COLLECTION_URL}>. Values flagged as bad or doubtful are left out.`,
        commercialUse: false,
      }));

    return {
      stations,
      readings,
      rejected:
        listed.rejected + observations.rejected + (observations.readings.length - readings.length),
    };
  }),
};
