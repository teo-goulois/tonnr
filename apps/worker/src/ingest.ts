import type { Database } from "@repo/db";
import { Effect } from "effect";

import { candhis } from "./providers/candhis";
import { ndbc } from "./providers/ndbc";
import type { Provider } from "./providers/provider";
import { saveSnapshot } from "./store";

export const providers: readonly Provider[] = [candhis, ndbc];

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
