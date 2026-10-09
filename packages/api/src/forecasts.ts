import { makeForecasts } from "@repo/conditions/forecasts/forecasts";
import { forecastBudget, FORECAST_PROVIDER } from "@repo/conditions/forecasts/open-meteo";
import type { Database } from "@repo/db";
import { forecastStore } from "@repo/db/forecasts";

/**
 * The forecasts of the API: kept in the database, where the worker finds them too, and asked
 * of the provider on the share of the day's budget that is for the people who look.
 * Decision 023.
 */
export function createForecasts(db: Database) {
  return makeForecasts(forecastStore(db, FORECAST_PROVIDER, forecastBudget("people")));
}
