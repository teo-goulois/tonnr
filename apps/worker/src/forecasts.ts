import { makeForecasts } from "@repo/conditions/forecasts/forecasts";
import { forecastBudget, FORECAST_PROVIDER } from "@repo/conditions/forecasts/open-meteo";
import type { Database } from "@repo/db";
import { forecastStore, pruneForecasts } from "@repo/db/forecasts";
import { Effect } from "effect";

import { StoreError } from "./store";

/**
 * The forecasts of the worker: kept in the database, where the API finds them too, and asked
 * of the provider on the share of the day's budget that is for the alerts. Decision 023.
 */
export function createForecasts(db: Database) {
  return makeForecasts(forecastStore(db, FORECAST_PROVIDER, forecastBudget("alerts")));
}

/** Deletes the forecasts that no longer answer anything, and the counts of the days past. */
export const pruneKeptForecasts = Effect.fn("pruneKeptForecasts")(function* (db: Database) {
  return yield* Effect.tryPromise({
    try: () => pruneForecasts(db),
    catch: (cause) => new StoreError({ provider: "forecasts", cause }),
  });
});
