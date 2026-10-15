import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import { type Cell, cellOf, pointOf } from "@repo/conditions/forecasts/open-meteo";
import type { Database } from "@repo/db";
import { listedPoints } from "@repo/db/listed";
import { Effect, Result } from "effect";

import { StoreError } from "./store";

// The forecasts of the listed breaks, kept by the worker so that the page of each shows its week
// whatever the hour, and so that a crawler never has the provider asked: decision 057. The cells
// can be refreshed in slices spread over the day, when a refresh costs a share of the budget.

/**
 * How many runs share the day's cells. One: the forecasts come from the models' files, which
 * cost no quota, so every cell is refreshed at each run, every three hours (decision 058). Eight
 * would fetch each once a day, within the pages' share of the budget (decision 057).
 */
export const SLICES_A_DAY = 1;

const cellKey = (cell: Cell) => `${cell.latStep},${cell.lonStep}`;

/** Which slice of the cells a run at a moment takes: the part of the day it falls in. */
export function sliceAt(now: Date) {
  return Math.floor(now.getUTCHours() / (24 / SLICES_A_DAY));
}

/**
 * Asks for the forecast of each cell of the run's slice of the listed breaks, which keeps it
 * for the day. A cell that is fresh costs nothing: the forecasts answer it from what is kept.
 * The run stops asking once the share is spent, and says so; the next slice tries again.
 */
export const keepListedForecasts = Effect.fn("keepListedForecasts")(function* (
  db: Database,
  forecasts: Pick<Forecasts, "get">,
  now = new Date(),
) {
  const points = yield* Effect.tryPromise({
    try: () => listedPoints(db),
    catch: (cause) => new StoreError({ provider: "pages", cause }),
  });
  // Neighbours share a cell, and a cell is asked for once, whatever the slice's breaks.
  const cells = new Map<string, Cell>();
  for (const point of points) {
    const cell = cellOf(point);
    cells.set(cellKey(cell), cell);
  }
  const keys = [...cells.keys()].sort();
  const slice = sliceAt(now);
  const mine = keys.filter((_, index) => index % SLICES_A_DAY === slice);

  let refreshed = 0;
  let failed = 0;
  let budgetSpent = false;
  for (const key of mine) {
    const cell = cells.get(key)!;
    const asked = yield* Effect.result(forecasts.get({ ...pointOf(cell), days: 1 }));
    if (Result.isSuccess(asked)) {
      // An answer that is stale came from what was kept: the provider could not be asked.
      if (asked.success.stale) failed += 1;
      else refreshed += 1;
      continue;
    }
    failed += 1;
    if (asked.failure._tag === "BudgetSpent") {
      budgetSpent = true;
      break;
    }
  }
  return {
    breaks: points.length,
    cells: keys.length,
    slice,
    asked: mine.length,
    refreshed,
    failed,
    budgetSpent,
  };
});

/** What a run says of itself, as decision 022 records it. */
export function pagesDone(result: Effect.Success<ReturnType<typeof keepListedForecasts>>) {
  const { breaks, cells, asked, refreshed, failed } = result;
  return {
    counts: { breaks, cells, asked, refreshed, failed },
    // Some cells of the slice go without a fresh forecast until the next day.
    degraded: failed > 0 || result.budgetSpent,
  };
}
