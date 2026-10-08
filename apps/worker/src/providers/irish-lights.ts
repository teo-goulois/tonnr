import { fetchText } from "@repo/upstream";
import { Effect } from "effect";

import { fieldNumber, parseCsv } from "./csv";
import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseUtcTime } from "./utc-date";

// The Commissioners of Irish Lights publish, every hour, a ten-minute average from each of their
// equipped buoys and lighthouses around Ireland. The last six hours of every site.
const OBSERVATIONS_URL =
  "https://erddap.irishlights.ie/erddap/tabledap/AllMetOcean.csv?&time%3E=now-6hours";

const MS_PER_KNOT = 0.514444;
// The units the parser was written for. A change of unit would store wrong values silently.
const EXPECTED_UNITS: Record<string, string> = {
  longitude: "degrees_east",
  latitude: "degrees_north",
  time: "UTC",
  AverageWindSpeed: "kn",
  GustSpeed: "kn",
  WindDirection: "degrees_true",
  WaveHeight: "m",
  WavePeriod: "s",
  WaterTemperature: "degree_C",
};

function formatError(message: string) {
  return new FormatError({ provider: "irishlights", message });
}

/** Reads the dataset as CSV: a line of column names, a line of units, then one line per hour and site. */
export function parseMetOcean(text: string): Snapshot | FormatError {
  const [header, unitRow, ...rows] = parseCsv(text);
  const columns = header ?? [];
  const units = unitRow ?? [];

  for (const [column, unit] of Object.entries(EXPECTED_UNITS)) {
    const index = columns.indexOf(column);
    if (index === -1) return formatError(`the dataset has no ${column} column`);
    if (units[index] !== unit) {
      return formatError(`${column} is in "${units[index] ?? ""}", not "${unit}"`);
    }
  }
  for (const column of ["mmsi", "LatonName"]) {
    if (!columns.includes(column)) return formatError(`the dataset has no ${column} column`);
  }

  const stations = new Map<string, StationInput>();
  const latestRowAt = new Map<string, Date>();
  const readings: ReadingInput[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  for (const fields of rows) {
    // A row that is cut short would otherwise be stored with its last values missing.
    if (!fields || fields.length !== columns.length) {
      rejected += 1;
      continue;
    }
    const field = (column: string) => fields[columns.indexOf(column)] ?? "";
    // The dataset writes "NaN" for a missing value.
    const number = (column: string) => fieldNumber(field(column));

    const id = field("mmsi");
    const observedAt = parseUtcTime(field("time"));
    const latitude = number("latitude");
    const longitude = number("longitude");
    const key = `${id} ${field("time")}`;
    // A site is known by its MMSI, the number of its radio transmitter. Two rows for one site
    // and hour cannot both be right.
    if (!/^\d+$/.test(id) || seen.has(key) || !observedAt || !isPosition(latitude, longitude)) {
      rejected += 1;
      continue;
    }
    seen.add(key);

    const reading: ReadingInput = {
      providerStationId: id,
      observedAt,
      significantHeightM: plausible("significantHeightM", number("WaveHeight")),
      // The dataset gives the average period.
      meanPeriodS: plausible("meanPeriodS", number("WavePeriod")),
      waterTemperatureC: plausible("waterTemperatureC", number("WaterTemperature")),
      windSpeedMs: plausible("windSpeedMs", number("AverageWindSpeed") * MS_PER_KNOT),
      windGustMs: plausible("windGustMs", number("GustSpeed") * MS_PER_KNOT),
      windDirectionDeg: plausible("windDirectionDeg", number("WindDirection")),
    };
    if (reading.significantHeightM == null && reading.windSpeedMs == null) continue;
    readings.push(reading);

    const latest = latestRowAt.get(id);
    if (!latest || observedAt > latest) {
      latestRowAt.set(id, observedAt);
      stations.set(id, {
        providerStationId: id,
        name: field("LatonName") || `Station ${id}`,
        latitude,
        longitude,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Commissioners of Irish Lights",
        commercialUse: true,
      });
    }
  }

  return {
    stations: [...stations.values()],
    readings,
    rejected,
  };
}

export const irishLights: Provider = {
  id: "irishlights",
  // A site reports once an hour.
  schedule: "25 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const snapshot = parseMetOcean(yield* fetchText(OBSERVATIONS_URL));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
