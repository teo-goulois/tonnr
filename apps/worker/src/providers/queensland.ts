import { fetchText } from "@repo/upstream";
import { Effect } from "effect";

import { parseCsv } from "./csv";
import { parseDecimal } from "./decimal";
import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { isObservationTime } from "./utc-date";

// The Queensland Government's wave buoys: seven days of every site in one file.
const WAVES_URL = "https://apps.des.qld.gov.au/data-sets/waves/wave-7dayopdata.csv";
const ATTRIBUTION =
  "© State of Queensland (Department of the Environment, Tourism, Science and Innovation)";

// Each run reads the same seven days again, so only the recent part is kept.
const RECENT_MS = 48 * 60 * 60 * 1000;

const MEASUREMENT_BY_COLUMN: Record<string, Measurement> = {
  Hs: "significantHeightM",
  Hmax: "maxHeightM",
  Tp: "peakPeriodS",
  // The zero-upcrossing period.
  Tz: "meanPeriodS",
  SST: "waterTemperatureC",
  Direction: "peakDirectionDeg",
};
// A measurement column that goes missing is a change of format, not a missing value.
const REQUIRED_COLUMNS = [
  "Site",
  "SiteNumber",
  "Seconds",
  "Latitude",
  "Longitude",
  ...Object.keys(MEASUREMENT_BY_COLUMN),
];

/**
 * Reads the wave file. Its first line is a note, its second the column names. "Seconds" is the
 * time in seconds since 1970 in UTC, and -99.9 stands for a missing value.
 */
export function parseWaveFile(text: string, now = new Date()): Snapshot | FormatError {
  const [, header, ...rows] = parseCsv(text);
  const columns = header ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return new FormatError({
      provider: "queensland",
      message: `the wave file has no ${missing.join(", ")} column`,
    });
  }

  const stations = new Map<string, StationInput>();
  const latestRowAt = new Map<string, Date>();
  const readings: ReadingInput[] = [];
  const seen = new Set<string>();
  let rejected = 0;

  for (const fields of rows) {
    // A row that is cut short, as when the file is read while it is being written, would
    // otherwise be stored with its last values missing.
    if (!fields || fields.length !== columns.length) {
      rejected += 1;
      continue;
    }
    const field = (column: string) => fields[columns.indexOf(column)] ?? "";
    // A number written in a way this parser does not know makes the whole row suspect.
    let unreadable = false;
    const number = (column: string) => {
      const value = parseDecimal(field(column));
      if (value === null) unreadable = true;
      return value ?? Number.NaN;
    };

    const id = field("SiteNumber");
    const observedAt = new Date(number("Seconds") * 1000);
    const latitude = number("Latitude");
    const longitude = number("Longitude");
    const reading: ReadingInput = { providerStationId: id, observedAt };
    for (const [column, measurement] of Object.entries(MEASUREMENT_BY_COLUMN)) {
      // The file marks a missing value with -99.9, which no range accepts.
      reading[measurement] = plausible(measurement, number(column));
    }

    const key = `${id} ${observedAt.getTime()}`;
    if (
      id === "" ||
      unreadable ||
      seen.has(key) ||
      !isObservationTime(observedAt) ||
      !isPosition(latitude, longitude)
    ) {
      rejected += 1;
      continue;
    }
    seen.add(key);
    if (now.getTime() - observedAt.getTime() > RECENT_MS) continue;

    if (reading.significantHeightM == null) continue;
    readings.push(reading);

    // A buoy drifts a little on its mooring. The station takes its latest position.
    const latest = latestRowAt.get(id);
    if (!latest || observedAt > latest) {
      latestRowAt.set(id, observedAt);
      stations.set(id, {
        providerStationId: id,
        name: field("Site") || `Station ${id}`,
        latitude,
        longitude,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: ATTRIBUTION,
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

export const queensland: Provider = {
  id: "queensland",
  schedule: "15,45 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const snapshot = parseWaveFile(yield* fetchText(WAVES_URL));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
