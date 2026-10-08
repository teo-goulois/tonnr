import { fetchText } from "@repo/upstream";
import { Effect } from "effect";

import { fieldNumber, parseCsvLine } from "./csv";
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
const REQUIRED_COLUMNS = ["Site", "SiteNumber", "Seconds", "Latitude", "Longitude", "Hs"];

const MEASUREMENT_BY_COLUMN: Record<string, Measurement> = {
  Hs: "significantHeightM",
  Hmax: "maxHeightM",
  Tp: "peakPeriodS",
  Tz: "meanPeriodS",
  SST: "waterTemperatureC",
  Direction: "peakDirectionDeg",
};

/**
 * Reads the wave file. Its first line is a note, its second the column names. "Seconds" is the
 * time in seconds since 1970 in UTC, and -99.9 stands for a missing value.
 */
export function parseWaveFile(text: string, now = new Date()): Snapshot | FormatError {
  const lines = text.split(/\r?\n/);
  const columns = parseCsvLine(lines[1] ?? "");
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
  let rejected = 0;

  for (const line of lines.slice(2)) {
    if (line.trim() === "") continue;
    const fields = parseCsvLine(line);
    const field = (column: string) => fields[columns.indexOf(column)] ?? "";

    const id = field("SiteNumber");
    const observedAt = new Date(fieldNumber(field("Seconds")) * 1000);
    const latitude = fieldNumber(field("Latitude"));
    const longitude = fieldNumber(field("Longitude"));
    if (id === "" || !isObservationTime(observedAt) || !isPosition(latitude, longitude)) {
      rejected += 1;
      continue;
    }
    if (now.getTime() - observedAt.getTime() > RECENT_MS) continue;

    const reading: ReadingInput = { providerStationId: id, observedAt };
    for (const [column, measurement] of Object.entries(MEASUREMENT_BY_COLUMN)) {
      // The file marks a missing value with -99.9, which no range accepts.
      reading[measurement] = plausible(measurement, fieldNumber(field(column)));
    }
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
