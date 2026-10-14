import { postJson } from "@repo/upstream";
import { Effect } from "effect";

import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, Snapshot, StationInput } from "./provider";
import { parseZonedTime } from "./utc-date";

// The water services of Rijkswaterstaat, the Dutch authority of the coast and the waterways: the
// last value of every series asked for, in one request.
const LATEST_URL =
  "https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenLaatsteWaarnemingen";
const LICENSE_URL = "https://rijkswaterstaatdata.nl/waterdata/";

// The places whose catalogue holds a wind speed measured against the mean sea level, the series
// of the network's meteorological stations: the coast, the Wadden, the lakes and the platforms
// of the North Sea. Read from `METADATASERVICES/OphalenCatalogus` on 2026-10-14. The request
// must name its places, and naming the 440 that ever measured the wind, most of them long
// silent, makes an answer of 3 MB.
export const LOCATIONS = [
  "a12",
  "ameland.nes",
  "amelandwestgat",
  "berkhout",
  "borsselealpha",
  "botlek.geulhaven",
  "brouwersdam.brouwershavensegat.2",
  "bruinisse.grevelingensluis",
  "cadzand.1",
  "d15",
  "denhelder.dekooy",
  "eemshaven.waddenzee",
  "europlatform",
  "f3",
  "goeree.lichteiland",
  "hansweert",
  "hoekvanholland",
  "hoekvanholland.lagelicht",
  "hoekvanholland.maeslantkering",
  "hollandsekust.noord.alpha",
  "hollandsekust.zuid.alpha.1",
  "hollandsekust.zuid.alpha.2",
  "houtribdijk.ijsselmeer",
  "huibertgat",
  "ijgeul.1",
  "ijmuiden.buitenhaven",
  "ijmuiden.havenhoofd.zuid",
  "j6",
  "k13a",
  "k14",
  "kats.zandkreeksluis.buiten",
  "l9",
  "lauwersoog.waddenzee",
  "markermeer.midden",
  "markermeer.trintelzand",
  "marknesse",
  "marollegat",
  "nieuwbeerta",
  "oosterschelde.4",
  "p11",
  "rotterdam.luchthaven",
  "rotterdamsehoek.ijsselmeer",
  "stavenisse",
  "stavoren.ijsselmeer",
  "stellendam.haringvlietsluizen.schuif1",
  "terneuzen.westsluis",
  "terschelling.hoorn",
  "terschelling.noordzee",
  "texel.hors",
  "tholen.bergsediepsluis",
  "uithuizerwad",
  "vlaktevanderaan",
  "vlieland.west",
  "vlissingen",
  "wierumergronden",
  "wijdenes",
  "wilhelminadorp",
  "zierikzee.zeelandbrug",
];

// The series of a station: what is measured, and how the value is worked out. The mean speed
// corrected to ten metres is the one the KNMI's stations give, and the speed at the height of
// the sensor stands in for it where a station has no other.
const SPEED_AT_TEN_METRES = "other:F136";
const SPEED_AT_SENSOR = "other:F018";
const DIRECTION = "other:F034";

const series = (quantity: string, reference: string, method: string) => ({
  AquoMetadata: {
    Compartiment: { Code: "LT" },
    Grootheid: { Code: quantity },
    Hoedanigheid: { Code: reference },
    WaardeBepalingsMethode: { Code: method },
  },
});

export const QUERY = {
  LocatieLijst: LOCATIONS.map((code) => ({ Code: code })),
  AquoPlusWaarnemingMetadataLijst: [
    series("WINDSHD", "MSL", SPEED_AT_TEN_METRES),
    series("WINDSHD", "MSL", SPEED_AT_SENSOR),
    series("WINDRTG", "WARNDN", DIRECTION),
  ],
};

// A station silent for longer than this is treated as gone, not as a station with an old reading.
const SILENT_MS = 7 * 24 * 60 * 60 * 1000;
// A direction goes with a speed when the two were measured within the same ten minutes. The
// latest value of each series is asked for, and the two are not always written at once.
const SAME_READING_MS = 10 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(message: string) {
  return new FormatError({ provider: "rijkswaterstaat", message });
}

type Value = { observedAt: Date; value: number };

type Place = {
  name: string;
  latitude: number;
  longitude: number;
  values: Map<string, Value>;
};

/** The last value of a series, or null when it has none that reads. */
function lastValue(measurements: unknown): Value | null | "invalid" {
  if (!Array.isArray(measurements) || measurements.length === 0) return null;
  const last: unknown = measurements.at(-1);
  if (!isRecord(last) || !isRecord(last.Meetwaarde) || typeof last.Tijdstip !== "string") {
    return "invalid";
  }
  const observedAt = parseZonedTime(last.Tijdstip);
  const value = last.Meetwaarde.Waarde_Numeriek;
  if (!observedAt || typeof value !== "number") return "invalid";
  // The network marks a value it does not trust with a code other than 00.
  const metadata = last.WaarnemingMetadata;
  if (isRecord(metadata) && metadata.Kwaliteitswaardecode !== "00") return null;
  return { observedAt, value };
}

/**
 * Reads the latest values of the wind's series: one entry per place and series, each with its
 * last measurement. Speeds are in metres per second, a mean over ten minutes, and the direction
 * is where the wind comes from, from true north.
 */
export function parseLatestWind(json: unknown, now = new Date()): Snapshot | FormatError {
  if (!isRecord(json) || json.Succesvol !== true || !Array.isArray(json.WaarnemingenLijst)) {
    return formatError("the answer has no list of observations");
  }

  const places = new Map<string, Place>();
  let rejected = 0;

  for (const entry of json.WaarnemingenLijst) {
    if (!isRecord(entry) || !isRecord(entry.Locatie) || !isRecord(entry.AquoMetadata)) {
      rejected += 1;
      continue;
    }
    const { Locatie: location, AquoMetadata: metadata } = entry;
    const method = isRecord(metadata.WaardeBepalingsMethode)
      ? metadata.WaardeBepalingsMethode.Code
      : undefined;
    const code = location.Code;
    const latitude = location.Lat;
    const longitude = location.Lon;
    if (
      typeof code !== "string" ||
      typeof method !== "string" ||
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !isPosition(latitude, longitude)
    ) {
      rejected += 1;
      continue;
    }

    const value = lastValue(entry.MetingenLijst);
    if (value === "invalid") {
      rejected += 1;
      continue;
    }
    if (value === null || now.getTime() - value.observedAt.getTime() > SILENT_MS) continue;

    const place = places.get(code) ?? {
      name: typeof location.Naam === "string" ? location.Naam.trim() : "",
      latitude,
      longitude,
      values: new Map<string, Value>(),
    };
    // A place may hold several series of one kind, from sensors that came and went: the one
    // that measured last speaks for it.
    const known = place.values.get(method);
    if (!known || known.observedAt < value.observedAt) place.values.set(method, value);
    places.set(code, place);
  }

  const stations: StationInput[] = [];
  const readings: ReadingInput[] = [];

  for (const [code, place] of places) {
    const speed = place.values.get(SPEED_AT_TEN_METRES) ?? place.values.get(SPEED_AT_SENSOR);
    if (!speed) continue;
    const windSpeedMs = plausible("windSpeedMs", speed.value);
    // The network writes 999.99 for a speed it did not measure.
    if (windSpeedMs === null) {
      rejected += 1;
      continue;
    }
    const direction = place.values.get(DIRECTION);
    const sameReading =
      direction !== undefined &&
      Math.abs(direction.observedAt.getTime() - speed.observedAt.getTime()) <= SAME_READING_MS;

    stations.push({
      providerStationId: code,
      name: place.name || code,
      latitude: place.latitude,
      longitude: place.longitude,
      licenseType: "cc0-1.0",
      licenseUrl: LICENSE_URL,
      attribution: "Rijkswaterstaat",
      commercialUse: true,
    });
    readings.push({
      providerStationId: code,
      observedAt: speed.observedAt,
      windSpeedMs,
      // The series of the gusts gave their last value on 2026-08-18.
      windGustMs: null,
      windDirectionDeg: sameReading ? plausible("windDirectionDeg", direction.value) : null,
    });
  }

  return { stations, readings, rejected };
}

export const rijkswaterstaat: Provider = {
  id: "rijkswaterstaat",
  // A value every ten minutes, written a few minutes after its time.
  schedule: "4-59/10 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const snapshot = parseLatestWind(yield* postJson(LATEST_URL, QUERY));
    if (snapshot instanceof FormatError) return yield* snapshot;
    return snapshot;
  }),
};
