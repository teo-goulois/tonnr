import { fetchText } from "@repo/upstream";
import { Effect } from "effect";

import { parseDecimal } from "./decimal";
import { parseErddapCsv } from "./erddap";
import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseUtcTime } from "./utc-date";

// The Marine Institute runs Ireland's weather buoys, M2 to M6, with Met Éireann. Each reports
// once an hour. The last six hours of every buoy.
// The dataset also has a spread, `SprTp`, which is left out: three buoys in four fill it with
// values of 130 to 300 degrees, which no spread can take.
const OBSERVATIONS_URL =
  "https://erddap.marine.ie/erddap/tabledap/IWBNetwork.csv" +
  "?station_id,longitude,latitude,time,WindDirection,WindSpeed,Gust" +
  ",WaveHeight,WavePeriod,Hmax,SeaTemperature,ThTp,Tp,QC_Flag" +
  "&time%3E=now-6hours";

const MS_PER_KNOT = 0.514444;
const EXPECTED_UNITS: Record<string, string> = {
  station_id: "",
  longitude: "degrees_east",
  latitude: "degrees_north",
  time: "UTC",
  WindDirection: "degrees true",
  WindSpeed: "knots",
  Gust: "knots",
  WaveHeight: "meters",
  WavePeriod: "seconds",
  Hmax: "meters",
  SeaTemperature: "degrees_C",
  ThTp: "degrees_true",
  Tp: "seconds",
  QC_Flag: "",
};

/** Reads the dataset as CSV: a line of column names, a line of units, then one line per hour and buoy. */
export function parseWeatherBuoys(text: string): Snapshot | FormatError {
  const table = parseErddapCsv(text, EXPECTED_UNITS);
  if (typeof table === "string") {
    return new FormatError({ provider: "marineinstitute", message: table });
  }

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

    // One flag for the whole row: 0 for a quality nobody checked, 1 for good, and 9 for
    // measurements that are missing whatever the columns hold.
    const flag = field("QC_Flag");
    if (flag === "9") continue;

    const id = field("station_id");
    const observedAt = parseUtcTime(field("time"));
    const latitude = number("latitude");
    const longitude = number("longitude");
    if (
      !/^[A-Za-z0-9]+$/.test(id) ||
      (flag !== "0" && flag !== "1") ||
      !observedAt ||
      !isPosition(latitude, longitude)
    ) {
      rejected += 1;
      continue;
    }

    const reading: ReadingInput = {
      providerStationId: id,
      observedAt,
      // Four times the root mean square of the sea surface.
      significantHeightM: plausible("significantHeightM", number("WaveHeight")),
      maxHeightM: plausible("maxHeightM", number("Hmax")),
      peakPeriodS: plausible("peakPeriodS", number("Tp")),
      // The zero-upcrossing period.
      meanPeriodS: plausible("meanPeriodS", number("WavePeriod")),
      // The direction at the peak period.
      peakDirectionDeg: plausible("peakDirectionDeg", number("ThTp")),
      waterTemperatureC: plausible("waterTemperatureC", number("SeaTemperature")),
      windSpeedMs: plausible("windSpeedMs", number("WindSpeed") * MS_PER_KNOT),
      windGustMs: plausible("windGustMs", number("Gust") * MS_PER_KNOT),
      windDirectionDeg: plausible("windDirectionDeg", number("WindDirection")),
      validated: flag === "1",
    };
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
        // The dataset names a buoy by its id alone.
        name: id,
        latitude,
        longitude,
        licenseType: "cc-by-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Marine Institute, Irish Weather Buoy Network",
        commercialUse: true,
      });
    }
  }

  return { stations: [...stations.values()], readings, rejected };
}

export const marineInstitute: Provider = {
  id: "marineinstitute",
  // A buoy reports once an hour. The row of 09:00 was there at 09:50.
  schedule: "50 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const snapshot = parseWeatherBuoys(yield* fetchText(OBSERVATIONS_URL));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
