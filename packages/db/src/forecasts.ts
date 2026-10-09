import { and, eq, lt, sql, TransactionRollbackError } from "drizzle-orm";

import type { Database } from "./index";
import { forecastCell, providerCalls } from "./schema/forecasts";

// How forecasts are kept in Postgres and their requests counted: decision 023. The rules are
// `packages/conditions`'s. This knows the tables, and is told the limits.

type Cell = { latStep: number; lonStep: number };

/** A count that a request adds to: its name, the span of time it covers, and its limit. */
export type Bucket = {
  bucket: string;
  span: "day" | "hour" | "minute";
  limit: number;
};

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
    spend: async () => {
      // One row for each bucket, always in the same order, so that two programs that count at
      // the same moment never wait for each other in a circle.
      const limitOf = sql.join(
        budget.map(({ bucket, limit }) => sql`when ${bucket} then ${limit}::integer`),
        sql` `,
      );
      try {
        await db.transaction(async (tx) => {
          const counted = await tx
            .insert(providerCalls)
            .values(
              budget.map(({ bucket, span }) => ({
                provider,
                bucket,
                start: sql`date_trunc(${span}::text, now(), 'UTC')`,
                calls: 1,
              })),
            )
            .onConflictDoUpdate({
              target: [providerCalls.provider, providerCalls.bucket, providerCalls.start],
              set: { calls: sql`${providerCalls.calls} + 1` },
              setWhere: sql`${providerCalls.calls} < (case ${providerCalls.bucket} ${limitOf} end)`,
            })
            .returning({ bucket: providerCalls.bucket });
          // A bucket at its limit takes nothing: the others must not keep this request.
          if (counted.length < budget.length) tx.rollback();
        });
        return true;
      } catch (error) {
        if (error instanceof TransactionRollbackError) return false;
        throw error;
      }
    },
  };
}

/** The calls counted in the spans that hold the present moment, by bucket. */
export async function currentCalls(db: Database, provider: string) {
  const rows = await db
    .select({ bucket: providerCalls.bucket, calls: providerCalls.calls })
    .from(providerCalls)
    .where(
      and(
        eq(providerCalls.provider, provider),
        sql`${providerCalls.start} = date_trunc(split_part(${providerCalls.bucket}, ':', 1), now(), 'UTC')`,
      ),
    );
  return new Map(rows.map((row) => [row.bucket, row.calls]));
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
