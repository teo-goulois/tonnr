import { fetchText } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible, type Measurement } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseUtcTime } from "./utc-date";
import { decodeXmlEntities } from "./xml";

// The Finnish Meteorological Institute's open data, wave buoys of the Baltic. The last twelve
// hours of every buoy, one value every half hour.
const OBSERVATIONS_URL =
  "https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature" +
  "&storedquery_id=fmi::observations::wave::timevaluepair&timestep=30";

const MEASUREMENT_BY_PARAMETER: Record<string, Measurement> = {
  WaveHs: "significantHeightM",
  WTP: "peakPeriodS",
  ModalWDi: "peakDirectionDeg",
  WHDD: "directionalSpreadDeg",
  TWATER: "waterTemperatureC",
};

function formatError(message: string) {
  return new FormatError({ provider: "fmi", message });
}

/**
 * Reads the answer of the wave observations query: one member per buoy and parameter, each a
 * series of time and value. A parameter this parser does not know is left out.
 */
export function parseWaveObservations(xml: string): Snapshot | FormatError {
  if (!xml.includes("<wfs:FeatureCollection")) {
    return formatError("the answer is not a collection of observations");
  }
  // An empty collection is a valid answer: the buoys are taken out of the water for the winter.
  const members = xml.split("<wfs:member>").slice(1);

  const stations = new Map<string, StationInput>();
  const byStationAndTime = new Map<string, ReadingInput>();
  let rejected = 0;

  for (const member of members) {
    const id = /stationcode\/fmisid">([^<]+)</.exec(member)?.[1]?.trim();
    const name = decodeXmlEntities(/locationcode\/name">([^<]+)</.exec(member)?.[1] ?? "").trim();
    const [latitude, longitude] = (/<gml:pos>([^<]+)</.exec(member)?.[1] ?? "")
      .trim()
      .split(/\s+/)
      .map(Number);
    const parameter = /<wml2:MeasurementTimeseries gml:id="obs-obs-\d+-\d+-(\w+)"/.exec(
      member,
    )?.[1];
    if (!id || !parameter || latitude === undefined || longitude === undefined) {
      return formatError("a member has no station, position, or parameter");
    }
    if (!isPosition(latitude, longitude)) {
      rejected += 1;
      continue;
    }

    const measurement = MEASUREMENT_BY_PARAMETER[parameter];
    if (!measurement) continue;

    stations.set(id, {
      providerStationId: id,
      name: name || `Station ${id}`,
      latitude,
      longitude,
      licenseType: "cc-by-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Finnish Meteorological Institute open data",
      commercialUse: true,
    });

    for (const [, time = "", text = ""] of member.matchAll(
      /<wml2:time>([^<]+)<\/wml2:time>\s*<wml2:value>([^<]+)<\/wml2:value>/g,
    )) {
      // The service writes "NaN" for a missing value.
      const value = plausible(measurement, Number(text));
      if (value === null) continue;

      const observedAt = parseUtcTime(time.trim());
      if (!observedAt) {
        rejected += 1;
        continue;
      }
      const key = `${id} ${observedAt.toISOString()}`;
      const reading = byStationAndTime.get(key) ?? { providerStationId: id, observedAt };
      byStationAndTime.set(key, { ...reading, [measurement]: value });
    }
  }

  // A buoy out of the water still has its members, with no wave height in them.
  const readings = [...byStationAndTime.values()].filter(
    (reading) => reading.significantHeightM != null,
  );
  const reporting = new Set(readings.map((reading) => reading.providerStationId));

  return {
    stations: [...stations.values()].filter((station) => reporting.has(station.providerStationId)),
    readings,
    rejected,
  };
}

export const fmi: Provider = {
  id: "fmi",
  schedule: "5,35 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const snapshot = parseWaveObservations(yield* fetchText(OBSERVATIONS_URL));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
