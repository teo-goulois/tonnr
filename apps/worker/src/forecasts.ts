import { makeForecasts } from "@repo/conditions/forecasts/forecasts";
import {
  forecastBudget,
  FORECAST_PROVIDER,
  type ForecastShare,
} from "@repo/conditions/forecasts/open-meteo";
import type { Database } from "@repo/db";
import { forecastStore, pruneForecasts } from "@repo/db/forecasts";
import { Effect } from "effect";

import { StoreError } from "./store";

/**
 * The forecasts of the worker: kept in the database, where the API finds them too, and asked
 * of the provider on a share of the day's budget, the alerts' by default, or the pages' for the
 * job that keeps the forecasts of the listed breaks. Decisions 023 and 057.
 */
export function createForecasts(db: Database, share: ForecastShare = "alerts") {
  return makeForecasts(forecastStore(db, FORECAST_PROVIDER, forecastBudget(share)));
}

/** Deletes the forecasts that no longer answer anything, and the counts of the days past. */
export const pruneKeptForecasts = Effect.fn("pruneKeptForecasts")(function* (db: Database) {
  return yield* Effect.tryPromise({
    try: () => pruneForecasts(db),
    catch: (cause) => new StoreError({ provider: "forecasts", cause }),
  });
});
