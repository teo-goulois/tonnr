import type { Database } from "@repo/db";
import { Effect } from "effect";

import { candhis } from "./providers/candhis";
import { fmi } from "./providers/fmi";
import { hidrografico } from "./providers/hidrografico";
import { irishLights } from "./providers/irish-lights";
import { marineInstitute } from "./providers/marine-institute";
import { ndbc } from "./providers/ndbc";
import { openwindmap } from "./providers/openwindmap";
import { queensland } from "./providers/queensland";
import type { Provider } from "./providers/provider";
import { saveSnapshot } from "./store";

export const providers: readonly Provider[] = [
  candhis,
  fmi,
  hidrografico,
  irishLights,
  marineInstitute,
  ndbc,
  openwindmap,
  queensland,
];

// Providers taken out of the list above. The worker deletes their queue when it starts. Their
// stations and readings stay until someone deletes them.
export const retiredProviderIds: readonly string[] = ["cefas"];

/** Fetches what a provider publishes now and stores it. */
export const ingest = Effect.fn("ingest")(function* (provider: Provider, db: Database) {
  const snapshot = yield* provider.fetchSnapshot;
  const saved = yield* saveSnapshot(db, provider.id, snapshot);

  yield* Effect.logInfo(
    `${provider.id}: ${saved.stations} stations, ${saved.newReadings} new readings, ${snapshot.rejected} rows rejected`,
  );
  if (saved.failedStations > 0) {
    yield* Effect.logWarning(
      `${provider.id}: the database refused ${saved.failedStations} stations`,
    );
  }
  return saved;
});
