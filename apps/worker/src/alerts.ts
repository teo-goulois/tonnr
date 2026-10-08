import { dayOf, planNotifications } from "@repo/conditions/alerts/plan";
import { assessSpot } from "@repo/conditions/spots/conditions";
import type { Database } from "@repo/db";
import { notification, spot } from "@repo/db/schema/spots";
import { and, eq, gt, gte, or } from "drizzle-orm";
import { Effect, Result } from "effect";

import { StoreError } from "./store";

const FORECAST_DAYS = 3;

const evaluateSpot = Effect.fn("evaluateSpot")(function* (
  db: Database,
  row: typeof spot.$inferSelect,
  now: Date,
) {
  const assessment = yield* assessSpot(row, FORECAST_DAYS);
  // A spot with no sea forecast has nothing to announce.
  if (!assessment) return 0;

  return yield* Effect.tryPromise({
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
});

/**
 * Checks every spot whose alerts are on against the forecast, and records what its owner should
 * be told. One spot that fails does not stop the others.
 */
export const evaluateAlerts = Effect.fn("evaluateAlerts")(function* (db: Database) {
  const now = new Date();
  const spots = yield* Effect.tryPromise({
    try: () => db.select().from(spot).where(eq(spot.alertsEnabled, true)),
    catch: (cause) => new StoreError({ provider: "alerts", cause }),
  });

  let created = 0;
  let failed = 0;
  // One spot at a time, to stay light on the forecast provider.
  for (const row of spots) {
    const result = yield* Effect.result(evaluateSpot(db, row, now));
    if (Result.isFailure(result)) {
      failed += 1;
      yield* Effect.logWarning(`alerts: spot ${row.id} could not be evaluated`, result.failure);
    } else {
      created += result.success;
    }
  }

  yield* Effect.logInfo(
    `alerts: ${spots.length} spots checked, ${created} notifications, ${failed} failed`,
  );
  return { spots: spots.length, created, failed };
});
