import { Effect } from "effect";

import { fetchText } from "@repo/upstream";
import { parseDecimal } from "./decimal";
import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { utcDate } from "./utc-date";
import { decodeXmlEntities } from "./xml";

const LATEST_OBSERVATIONS_URL = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt";
const ACTIVE_STATIONS_URL = "https://www.ndbc.noaa.gov/activestations.xml";
const TERMS_URL = "https://www.weather.gov/disclaimer";

const REQUIRED_COLUMNS = [
  "STN",
  "LAT",
  "LON",
  "YYYY",
  "MM",
  "DD",
  "hh",
  "mm",
  "WVHT",
  "WSPD",
] as const;

type StationDetails = { name: string; owner: string; program: string };

/** Reads `activestations.xml`, a flat list of `<station/>` elements, into a map keyed by station id. */
export function parseActiveStations(xml: string) {
  const details = new Map<string, StationDetails>();

  for (const [, attributeText = ""] of xml.matchAll(/<station\s+([^>]*?)\/>/g)) {
    const attributes = new Map<string, string>();
    for (const [, key = "", value = ""] of attributeText.matchAll(/(\w+)="([^"]*)"/g)) {
      attributes.set(key, decodeXmlEntities(value));
    }

    const id = attributes.get("id");
    if (!id) continue;
    details.set(id.toUpperCase(), {
      name: (attributes.get("name") ?? "").replace(/\s+/g, " ").trim(),
      owner: attributes.get("owner") ?? "",
      program: attributes.get("pgm") ?? "",
    });
  }

  return details;
}

// The programs NOAA runs itself. Their data is in the public domain.
const NOAA_PROGRAMS = new Set(["NDBC Meteorological/Ocean", "NOS/CO-OPS", "TAO", "Tsunami"]);

// NDBC also relays buoys owned by others, whose data is used under each owner's terms.
// A station is treated as one of those unless its program is known to be NOAA's.
function licenseFor(details: StationDetails | undefined) {
  if (details && NOAA_PROGRAMS.has(details.program)) {
    return {
      licenseType: "public-domain",
      attribution: "NOAA National Data Buoy Center",
      commercialUse: true,
    };
  }

  const owner = details?.owner || "a partner of NOAA";
  return {
    licenseType: "ndbc-partner",
    attribution: `${owner}, relayed by the NOAA National Data Buoy Center`,
    commercialUse: null,
  };
}

/**
 * Reads `latest_obs.txt`: one line per station with its most recent observation.
 * A line becomes a station and a reading when it carries a wave height or a wind speed.
 */
export function parseLatestObservations(
  text: string,
  details: ReadonlyMap<string, StationDetails>,
): Snapshot | FormatError {
  const lines = text.split("\n");
  const columns = lines[0]?.replace(/^#/, "").trim().split(/\s+/) ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return new FormatError({
      provider: "ndbc",
      message: `latest_obs.txt has no ${missing.join(", ")} column`,
    });
  }

  const stations: StationInput[] = [];
  const readings: ReadingInput[] = [];
  let rejected = 0;

  for (const line of lines) {
    if (line.startsWith("#") || line.trim() === "") continue;

    const fields = line.trim().split(/\s+/);
    const field = (column: string) => fields[columns.indexOf(column)] ?? "MM";
    // NDBC writes "MM" for a missing measurement.
    const number = (column: string) => {
      const value = field(column) === "MM" ? null : parseDecimal(field(column));
      return value === null || !Number.isFinite(value) ? null : value;
    };

    // A measurement outside what the sea can do is treated as missing.
    const measure = (column: string, measurement: Measurement) => {
      const value = number(column);
      return value === null ? null : plausible(measurement, value);
    };

    const significantHeightM = measure("WVHT", "significantHeightM");
    const latitude = number("LAT");
    const longitude = number("LON");
    const [year, month, day, hour, minute] = ["YYYY", "MM", "DD", "hh", "mm"].map(number);
    const windSpeedMs = measure("WSPD", "windSpeedMs");
    // A line with neither waves nor wind comes from a station of another kind.
    if (significantHeightM === null && windSpeedMs === null) continue;
    if (latitude === null || longitude === null) continue;
    if (year == null || month == null || day == null || hour == null || minute == null) continue;
    if (!isPosition(latitude, longitude)) {
      rejected += 1;
      continue;
    }

    const observedAt = utcDate(year, month, day, hour, minute);
    if (!observedAt) {
      rejected += 1;
      continue;
    }

    const providerStationId = field("STN").toUpperCase();
    const stationDetails = details.get(providerStationId);

    stations.push({
      providerStationId,
      name: stationDetails?.name || `Station ${providerStationId}`,
      latitude,
      longitude,
      licenseUrl: TERMS_URL,
      ...licenseFor(stationDetails),
    });
    readings.push({
      providerStationId,
      observedAt,
      significantHeightM,
      peakPeriodS: measure("DPD", "peakPeriodS"),
      meanPeriodS: measure("APD", "meanPeriodS"),
      peakDirectionDeg: measure("MWD", "peakDirectionDeg"),
      waterTemperatureC: measure("WTMP", "waterTemperatureC"),
      windSpeedMs,
      windGustMs: measure("GST", "windGustMs"),
      windDirectionDeg: measure("WDIR", "windDirectionDeg"),
    });
  }

  return { stations, readings, rejected };
}

export const ndbc: Provider = {
  id: "ndbc",
  schedule: "*/10 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const [observations, activeStations] = yield* Effect.all(
      [fetchText(LATEST_OBSERVATIONS_URL), fetchText(ACTIVE_STATIONS_URL)],
      { concurrency: 2 },
    );

    const snapshot = parseLatestObservations(observations, parseActiveStations(activeStations));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
