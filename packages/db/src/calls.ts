import { and, eq, sql, TransactionRollbackError } from "drizzle-orm";

import type { Database } from "./index";
import { providerCalls } from "./schema/forecasts";

// What the instance lets out and counts before it does: the requests to a provider that limits
// them, and the mails it sends. The database refuses the count that would pass a limit, so a
// limit holds for every program of the instance together, and across a restart.

/** A count that a request adds to: its name, the span of time it covers, and its limit. */
export type Bucket = {
  bucket: string;
  span: "day" | "hour" | "minute";
  limit: number;
};

/** A bucket of a name's count: what a request, or a mail, is counted under. */
export type Count = Bucket & { provider: string };

const SPAN_SECONDS = { day: 24 * 60 * 60, hour: 60 * 60, minute: 60 } as const;

/**
 * Counts one in every one of these counts, or in none. Null when it was counted. When one of
 * them is at its limit, nothing is counted, and what comes back is the counts that were full
 * with the seconds left before each starts again, by the database's clock. A limit is one at
 * least: the first of a span is always counted.
 */
export async function countCalls(db: Database, counts: readonly Count[]) {
  // The first of a span is counted whatever the limit: a limit under one would not hold.
  if (counts.some(({ limit }) => !Number.isInteger(limit) || limit < 1)) {
    throw new Error("A limit is a whole number, one at least");
  }
  // One row for each count, always in the order given, so that two programs that count at the
  // same moment never wait for each other in a circle.
  const limitOf = sql.join(
    counts.map(
      ({ provider, bucket, limit }) =>
        sql`when ${providerCalls.provider} = ${provider} and ${providerCalls.bucket} = ${bucket} then ${limit}::integer`,
    ),
    sql` `,
  );
  let full: (Count & { retryAfterSeconds: number })[] = [];
  try {
    await db.transaction(async (tx) => {
      const counted = await tx
        .insert(providerCalls)
        .values(
          counts.map(({ provider, bucket, span }) => ({
            provider,
            bucket,
            start: sql`date_trunc(${span}::text, now(), 'UTC')`,
            calls: 1,
          })),
        )
        .onConflictDoUpdate({
          target: [providerCalls.provider, providerCalls.bucket, providerCalls.start],
          set: { calls: sql`${providerCalls.calls} + 1` },
          setWhere: sql`${providerCalls.calls} < (case ${limitOf} end)`,
        })
        .returning({ provider: providerCalls.provider, bucket: providerCalls.bucket });
      if (counted.length === counts.length) return;

      // A count at its limit takes nothing: the others must not keep this one.
      const { rows } = await tx.execute<{ seconds: number }>(
        sql`select extract(epoch from now())::float8 as seconds`,
      );
      const now = rows[0]?.seconds ?? Date.now() / 1000;
      full = counts
        .filter(
          (asked) =>
            !counted.some((row) => row.provider === asked.provider && row.bucket === asked.bucket),
        )
        .map((asked) => ({
          ...asked,
          retryAfterSeconds: Math.ceil(SPAN_SECONDS[asked.span] - (now % SPAN_SECONDS[asked.span])),
        }));
      tx.rollback();
    });
    return null;
  } catch (error) {
    if (error instanceof TransactionRollbackError) return full;
    throw error;
  }
}

/**
 * Counts one request under a name, in every bucket of the budget or in none. False when one of
 * them is at its limit: nothing is counted then.
 */
export async function spendCalls(db: Database, provider: string, budget: readonly Bucket[]) {
  const full = await countCalls(
    db,
    budget.map((bucket) => ({ ...bucket, provider })),
  );
  return full === null;
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
