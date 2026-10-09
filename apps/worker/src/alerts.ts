import { dayOf, planNotifications } from "@repo/conditions/alerts/plan";
import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import { assessSpot } from "@repo/conditions/spots/conditions";
import type { Database } from "@repo/db";
import { notification, spot } from "@repo/db/schema/spots";
import { and, eq, gt, gte, or } from "drizzle-orm";
import { Effect, Result } from "effect";

import { StoreError } from "./store";

const FORECAST_DAYS = 3;

// What became of a spot's evaluation: the notifications it created, or that it was left as it
// was for want of a fresh forecast.
type Evaluated = { created: number; stale: boolean };

const evaluateSpot = Effect.fn("evaluateSpot")(function* (
  db: Database,
  forecasts: Forecasts,
  row: typeof spot.$inferSelect,
  now: Date,
) {
  const assessment = yield* assessSpot(forecasts, row, FORECAST_DAYS);
  // An older forecast, given because the provider could not be asked, announces nothing and
  // calls nothing off: yesterday's news would do both wrongly. The spot's notifications stay
  // as they are, and the next run reads a fresh one. Decision 023.
  if (assessment.forecastStale) return { created: 0, stale: true } satisfies Evaluated;
  // A spot with no sea forecast has nothing to announce.
  if (!assessment.hasSea) return { created: 0, stale: false } satisfies Evaluated;

  const created = yield* Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        // Locking the spot makes its evaluations run one after the other. The forecast took a
        // moment to fetch, so the spot is read again: it may have been changed or switched off.
        const [current] = await tx.select().from(spot).where(eq(spot.id, row.id)).for("update");
        const unchanged = current?.updatedAt.getTime() === row.updatedAt.getTime();
        if (!current?.alertsEnabled || !unchanged) return 0;

        const existing = await tx
          .select()
          .from(notification)
          .where(
            and(
              eq(notification.spotId, row.id),
              // Today's and later days', and any window that began earlier and has not ended.
              or(gte(notification.day, dayOf(now)), gt(notification.windowEnd, now)),
            ),
          );
        const plan = planNotifications(now, assessment.windows, existing);

        for (const change of plan.update) {
          await tx
            .update(notification)
            .set({
              windowStart: change.windowStart,
              windowEnd: change.windowEnd,
              missedRuns: change.missedRuns,
            })
            .where(
              and(
                eq(notification.spotId, row.id),
                eq(notification.day, change.day),
                eq(notification.kind, "window_found"),
              ),
            );
        }
        if (plan.create.length === 0) return 0;

        const created = await tx
          .insert(notification)
          .values(
            plan.create.map((entry) => ({
              id: crypto.randomUUID(),
              userId: row.userId,
              spotId: row.id,
              ...entry,
            })),
          )
          // The same notification from an earlier run stays as it is.
          .onConflictDoNothing()
          .returning({ id: notification.id });
        return created.length;
      }),
    catch: (cause) => new StoreError({ provider: "alerts", cause }),
  });
  return { created, stale: false } satisfies Evaluated;
});

/** What a run of the alerts did, as the worker says it of a job: decision 022. */
export function alertsDone({
  spots,
  created,
  failed,
  stale,
}: Effect.Success<ReturnType<typeof evaluateAlerts>>) {
  return {
    counts: { spots, created, failed, stale },
    // The run went to its end, and some spots could not be checked, or were left as they were
    // for want of a fresh forecast.
    degraded: failed > 0 || stale > 0,
  };
}

/**
 * Checks every spot whose alerts are on against the forecast, and records what its owner should
 * be told. One spot that fails does not stop the others. `stale` counts the spots left as they
 * were because only an older forecast could be had.
 */
export const evaluateAlerts = Effect.fn("evaluateAlerts")(function* (
  db: Database,
  forecasts: Forecasts,
) {
  const now = new Date();
  const spots = yield* Effect.tryPromise({
    try: () => db.select().from(spot).where(eq(spot.alertsEnabled, true)),
    catch: (cause) => new StoreError({ provider: "alerts", cause }),
  });

  let created = 0;
  let failed = 0;
  let stale = 0;
  // One spot at a time, to stay light on the forecast provider.
  for (const row of spots) {
    const result = yield* Effect.result(evaluateSpot(db, forecasts, row, now));
    if (Result.isFailure(result)) {
      failed += 1;
      yield* Effect.logWarning(`alerts: spot ${row.id} could not be evaluated`, result.failure);
    } else {
      created += result.success.created;
      if (result.success.stale) stale += 1;
    }
  }

  yield* Effect.logInfo(
    `alerts: ${spots.length} spots checked, ${created} notifications, ${failed} failed, ${stale} left for want of a fresh forecast`,
  );
  return { spots: spots.length, created, failed, stale };
});
