import type { Database } from "@repo/db";
import { Effect } from "effect";

import { AEMET_ID, aemet } from "./providers/aemet";
import { candhis } from "./providers/candhis";
import { coops } from "./providers/coops";
import { copernicus } from "./providers/copernicus";
import { dmi } from "./providers/dmi";
import { fmi } from "./providers/fmi";
import { hidrografico } from "./providers/hidrografico";
import { ipma } from "./providers/ipma";
import { irishLights } from "./providers/irish-lights";
import { jma } from "./providers/jma";
import { marineInstitute } from "./providers/marine-institute";
import { metar } from "./providers/metar";
import { METEO_FRANCE_ID, meteoFrance } from "./providers/meteo-france";
import { ndbc } from "./providers/ndbc";
import { openwindmap } from "./providers/openwindmap";
import type { Provider } from "./providers/provider";
import { queensland } from "./providers/queensland";
import { rijkswaterstaat } from "./providers/rijkswaterstaat";
import { saveSnapshot } from "./store";

// The providers that ask for no account: every instance fetches from them.
const open: readonly Provider[] = [
  candhis,
  coops,
  copernicus,
  dmi,
  fmi,
  hidrografico,
  ipma,
  irishLights,
  jma,
  marineInstitute,
  metar,
  ndbc,
  openwindmap,
  queensland,
  rijkswaterstaat,
];

/** The keys an instance may hold, for the providers that ask for an account. Decision 032. */
export type ProviderKeys = {
  AEMET_API_KEY?: string | undefined;
  METEO_FRANCE_API_KEY?: string | undefined;
};

/** The providers an instance fetches from: the open ones, and those whose key it holds. */
export function providersOf(keys: ProviderKeys): readonly Provider[] {
  return [
    ...open,
    ...(keys.AEMET_API_KEY ? [aemet(keys.AEMET_API_KEY)] : []),
    ...(keys.METEO_FRANCE_API_KEY ? [meteoFrance(keys.METEO_FRANCE_API_KEY)] : []),
  ];
}

/**
 * The providers whose queue the worker deletes when it starts: those taken out of the list
 * above, and those whose key the instance does not hold. Their stations and readings stay until
 * someone deletes them.
 */
export function retiredProviderIdsOf(keys: ProviderKeys): readonly string[] {
  return [
    "cefas",
    ...(keys.AEMET_API_KEY ? [] : [AEMET_ID]),
    ...(keys.METEO_FRANCE_API_KEY ? [] : [METEO_FRANCE_ID]),
  ];
}

/** Fetches what a provider publishes now and stores it. */
export const ingest = Effect.fn("ingest")(function* (provider: Provider, db: Database) {
  const snapshot = yield* provider.fetchSnapshot;
  const saved = yield* saveSnapshot(db, provider.id, snapshot);

  yield* Effect.logInfo(
    `${provider.id}: ${saved.stations} stations, ${saved.newReadings} new readings, ${saved.completedReadings} completed, ${snapshot.rejected} rows rejected`,
  );
  if (saved.stationByStation) {
    yield* Effect.logWarning(
      `${provider.id}: the database refused the snapshot as a whole, and took it station by station`,
    );
  }
  if (saved.failedStations > 0) {
    yield* Effect.logWarning(
      `${provider.id}: the database refused ${saved.failedStations} stations`,
    );
  }
  // The rows the parser dropped go with the rest: the state of the instance shows them.
  return { ...saved, rejected: snapshot.rejected };
});
