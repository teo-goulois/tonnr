import { fetchText } from "@repo/upstream";
import { Effect } from "effect";

import { parseDecimal } from "./decimal";
import { parseErddapCsv } from "./erddap";
import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

// The Commissioners of Irish Lights publish, every hour, a ten-minute average from each of their
// equipped buoys and lighthouses around Ireland. The last six hours of every site.
const OBSERVATIONS_URL =
  "https://erddap.irishlights.ie/erddap/tabledap/AllMetOcean.csv?&time%3E=now-6hours";

const MS_PER_KNOT = 0.514444;
// The units the parser was written for. A change of unit would store wrong values silently.
const EXPECTED_UNITS: Record<string, string> = {
  mmsi: "",
  LatonName: "",
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
  const table = parseErddapCsv(text, EXPECTED_UNITS);
  if (typeof table === "string") return formatError(table);

  const stations = new Map<string, StationInput>();
  const latestRowAt = new Map<string, Date>();
  const readings: ReadingInput[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  for (const field of table.rows) {
    // A row that is cut short would otherwise be stored with its last values missing.
    if (!field) {
      rejected += 1;
      continue;
    }
    // The dataset writes "NaN" for a missing value. A number written in a way this parser does
    // not know makes the whole row suspect.
    let unreadable = false;
    const number = (column: string) => {
      const value = parseDecimal(field(column));
      if (value === null) unreadable = true;
      return value ?? Number.NaN;
    };

    const id = field("mmsi");
    const observedAt = parseZonedTime(field("time"));
    const latitude = number("latitude");
    const longitude = number("longitude");
    if (!/^\d+$/.test(id) || !observedAt || !isPosition(latitude, longitude)) {
      rejected += 1;
      continue;
    }

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
    // A site is known by its MMSI, the number of its radio transmitter. Two rows for one site
    // and moment cannot both be right.
    const key = `${id} ${observedAt.getTime()}`;
    if (unreadable || seen.has(key)) {
      rejected += 1;
      continue;
    }
    seen.add(key);
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
