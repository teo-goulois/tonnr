import { lt, sql } from "drizzle-orm";

import { type Bucket, spendCalls } from "./calls";
import type { Database } from "./index";
import { forecastCell, providerCalls } from "./schema/forecasts";

// How forecasts are kept in Postgres and their requests counted: decision 023. The rules are
// `packages/conditions`'s. This knows the tables, and is told the limits.

type Cell = { latStep: number; lonStep: number };

// Rows that nothing reads any more: a forecast answers for a day, a count for its span.
const KEPT_DAYS = 2;

/**
 * The store of forecasts of one program: `provider` names the counts, and `budget` gives the
 * ones a request of this program adds to, with their limits.
 */
export function forecastStore(db: Database, provider: string, budget: readonly Bucket[]) {
  /** The forecast kept for a cell, and the database's time, which comes when there is no row. */
  const read = async (cell: Cell) => {
    // Moments in milliseconds: a client reads a number the same way whatever its settings.
    const { rows } = await db.execute<{ now: number; fetched: number | null; data: unknown }>(sql`
      select
        (extract(epoch from now()) * 1000)::float8 as now,
        (extract(epoch from kept.fetched_at) * 1000)::float8 as fetched,
        kept.data
      from (select 1) as one
      left join ${forecastCell} as kept
        on kept.lat_step = ${cell.latStep} and kept.lon_step = ${cell.lonStep}
    `);
    const [found] = rows;
    if (!found) throw new Error("The database gave no time");
    return {
      now: new Date(found.now),
      row: found.fetched === null ? null : { fetchedAt: new Date(found.fetched), data: found.data },
    };
  };

  return {
    read,

    /** Keeps a forecast unless one fetched later is kept, and gives back the one that is kept. */
    write: async (cell: Cell, row: { fetchedAt: Date; data: unknown }) => {
      await db
        .insert(forecastCell)
        .values({ ...cell, ...row })
        .onConflictDoUpdate({
          target: [forecastCell.latStep, forecastCell.lonStep],
          set: { fetchedAt: sql`excluded.fetched_at`, data: sql`excluded.data` },
          // A fetch that started later is kept: that one answers.
          setWhere: lt(forecastCell.fetchedAt, sql`excluded.fetched_at`),
        });
      const kept = await read(cell);
      // The nightly job may have taken the row since: what was fetched still answers.
      return { now: kept.now, row: kept.row ?? row };
    },

    /**
     * Counts one request, in every bucket of the budget or in none. False when one of them is
     * at its limit.
     */
    spend: () => spendCalls(db, provider, budget),
  };
}

/** How many cells have a forecast kept. */
export async function countForecastCells(db: Database) {
  return db.$count(forecastCell);
}

/** Deletes the forecasts and the counts that nothing reads any more. */
export async function pruneForecasts(db: Database) {
  const old = sql`now() - make_interval(days => ${KEPT_DAYS})`;
  const cells = await db
    .delete(forecastCell)
    .where(lt(forecastCell.fetchedAt, old))
    .returning({ latStep: forecastCell.latStep });
  const calls = await db
    .delete(providerCalls)
    .where(lt(providerCalls.start, old))
    .returning({ bucket: providerCalls.bucket });
  return { cells: cells.length, calls: calls.length };
}
