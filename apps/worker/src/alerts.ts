import { type SeaWindow, type Told, planLook, planMail, recut } from "@repo/conditions/alerts/look";
import { tellUntil } from "@repo/conditions/alerts/moments";
import { type Interval, openHours } from "@repo/conditions/alerts/open";
import { availabilityOf, cutOf, settingsOf, zoneOf } from "@repo/conditions/alerts/settings";
import { type Forecasts, MAX_FORECAST_DAYS } from "@repo/conditions/forecasts/forecasts";
import { assessSpot } from "@repo/conditions/spots/conditions";
import { asksSwell } from "@repo/conditions/spots/criteria";
import type { Database } from "@repo/db";
import { isSuspended } from "@repo/db/accounts";
import { accountSuspension } from "@repo/db/schema/access";
import {
  type NotificationPayload,
  type ToldStretch,
  alert,
  alertSettings,
  alertSpot,
  alertWindow,
  notification,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { spot } from "@repo/db/schema/spots";
import { and, asc, eq, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { Effect, Result } from "effect";

import { queueDeliveries } from "./deliveries";
import { figuresOf, named, seaHour, stretch, toldPiece, toldStretch } from "./kept";
import { StoreError } from "./store";

// Decision 031. The worker looks at each alert every three hours, at each of its spots, and
// keeps what it saw of each spot from one look to the next: its sea windows, and the open hours
// it told.

const HOUR_MS = 60 * 60 * 1000;
// The job runs every three hours, and once when the worker starts. A look is applied to an alert
// when the one before is at least this old, whoever runs it: a forecast is fresh for two hours,
// so two looks that find a window have read two forecasts, fetched apart. A worker that starts
// a few minutes before the job's hour does not make one forecast count twice. The half hour
// between the two is the room left for the clocks of two workers to disagree.
const LOOK_GAP_MS = 2.5 * HOUR_MS;
const MOMENTS = ["found", "moved", "gone"] as const;

const isDue = (lookedAt: Date | null, now: Date) =>
  !lookedAt || now.getTime() - lookedAt.getTime() >= LOOK_GAP_MS;

// What became of a look at an alert: the spots a fresh forecast was read for, those that were
// left as they were for want of one, and the notifications it made.
type Looked = { spots: number; stale: number; created: number };

type Hours = Extract<Effect.Success<ReturnType<typeof assessSpot>>, { hasSea: true }>["hours"];

const lookAt = Effect.fn("lookAtAlert")(function* (
  db: Database,
  forecasts: Forecasts,
  row: typeof alert.$inferSelect,
) {
  const none: Looked = { spots: 0, stale: 0, created: 0 };
  // The alert's owner may have been suspended since the alerts were listed: no forecast is
  // asked for an account that is kept out. Decision 025.
  const isOut = yield* Effect.tryPromise({
    try: () => isSuspended(db, row.userId),
    catch: (cause) => new StoreError({ provider: "alerts", cause }),
  });
  // An alert that asks nothing of the sea would find a window at every hour.
  if (isOut || Object.keys(row.criteria).length === 0) return none;

  const spots = yield* Effect.tryPromise({
    try: () =>
      db
        .select({
          id: spot.id,
          name: spot.name,
          latitude: spot.latitude,
          longitude: spot.longitude,
        })
        .from(alertSpot)
        .innerJoin(spot, eq(spot.id, alertSpot.spotId))
        .where(eq(alertSpot.alertId, row.id))
        .orderBy(asc(alertSpot.position)),
    catch: (cause) => new StoreError({ provider: "alerts", cause }),
  });

  // The forecast at each spot, one after the other: neighbours share a cell, which the first of
  // them fetches for all. A spot whose forecast is an older one, given because the provider
  // could not be asked, is not looked at: yesterday's news would confirm and call off wrongly.
  // Nor is one for which no forecast could be had at all, and the others are looked at without
  // it: one spot that fails does not silence its neighbours.
  const seen: {
    place: (typeof spots)[number];
    found: Interval[];
    hours: Hours;
    fetchedAt: Date;
  }[] = [];
  let left = 0;
  let failure: Effect.Error<ReturnType<typeof assessSpot>> | undefined;
  for (const place of spots) {
    const assessed = yield* Effect.result(
      assessSpot(forecasts, { ...place, criteria: row.criteria }, MAX_FORECAST_DAYS),
    );
    if (Result.isFailure(assessed)) {
      failure ??= assessed.failure;
      left += 1;
      continue;
    }
    const assessment = assessed.success;
    if (assessment.forecastStale) {
      left += 1;
      continue;
    }
    // A spot with no sea forecast was looked at, and has no window.
    seen.push({
      place,
      found: assessment.hasSea ? assessment.windows : [],
      hours: assessment.hasSea ? assessment.hours : [],
      fetchedAt: assessment.forecastFetchedAt,
    });
  }
  // Not one of its spots could be read for want of any forecast: the alert was not looked at.
  if (seen.length === 0 && failure) return yield* Effect.fail(failure);
  if (seen.length === 0) return { ...none, stale: left };

  // The look is of the moment it is applied, not of the moment the run began: a run that
  // takes long over other alerts must not make this one's look seem older than its forecast.
  const now = new Date();

  const created = yield* Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        // Its owner first, held so that a suspension waits for this to be written, or is seen
        // here: nothing is told to an account that was suspended meanwhile. An account that is
        // deleted takes its alerts in the same order, so that the two never wait for each other.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, row.userId)).for("share");
        // Holding the alert makes its looks run one after the other. The forecasts took a moment
        // to fetch, so the alert is read again: it may have been changed, switched off, or
        // looked at by another worker meanwhile.
        const [current] = await tx.select().from(alert).where(eq(alert.id, row.id)).for("update");
        if (!current?.enabled || current.revision !== row.revision) return 0;
        if (!isDue(current.lookedAt, now)) return 0;
        if (await isSuspended(tx, row.userId)) return 0;

        const [settingsRow] = await tx
          .select()
          .from(alertSettings)
          .where(eq(alertSettings.userId, row.userId));
        const settings = settingsOf(settingsRow);
        const availability = availabilityOf(settings);
        const zone = zoneOf(settings);
        const cut = cutOf(settings, current.shortestMinutes);
        const until = tellUntil(now, zone, settings.horizonDays);

        const knownWindows = await tx
          .select()
          .from(alertWindow)
          .where(eq(alertWindow.alertId, row.id));
        const knownSpots = await tx.select().from(alertSpot).where(eq(alertSpot.alertId, row.id));

        const lines: Record<(typeof MOMENTS)[number], NotificationPayload["lines"]> = {
          found: [],
          moved: [],
          gone: [],
        };
        for (const { place, found, hours, fetchedAt } of seen) {
          // The spot may have left the alert since the forecasts were asked: the alert's
          // revision says so, and this is for the type alone.
          const kept = knownSpots.find((known) => known.spotId === place.id);
          if (!kept) continue;
          const windows: SeaWindow[] = knownWindows
            .filter((window) => window.spotId === place.id)
            .map((window) => ({
              sea: { start: window.seaStart, end: window.seaEnd },
              seen: window.seen,
            }));

          // The hours are cut otherwise than at the last look: what was told is brought in
          // line with them, and nothing is said of the difference.
          const settled = kept.cutBy !== null && kept.cutBy !== cut;
          const open = (sea: Interval) =>
            openHours(sea, place, availability, current.shortestMinutes);
          const plan = planLook({ windows, told: kept.told.map(toldPiece) }, found, {
            now,
            tellUntil: until,
            open,
            settled,
            // A moment the account switched off is not told.
            quiet: { found: !settings.onFound, change: !settings.onChange },
          });

          // What a way out told follows what none of its messages says. Hours that are cut
          // otherwise are cut again as what was told is, from the sea as it was known: hours
          // that the change opened stay new to it. And an account that switched changes off is
          // kept in line at each look, so that switching them back on tells nothing of what
          // moved meanwhile. What comes back is what was kept, itself, when nothing changed.
          // A name follows a window through both, for what push told: a push is shown under it.
          const inLine = (told: ToldStretch[], follow = false) => {
            let followed = told;
            if (settled) {
              const cut = recut({ windows, told: followed.map(toldPiece) }, open).map(toldStretch);
              followed = follow ? named(followed, cut) : cut;
            }
            if (!settings.onChange && followed.length > 0) {
              const kept = planMail(
                followed.map(toldPiece),
                plan.told,
                plan.windows.flatMap((window) => open(window.sea)),
                { now, quiet: { found: true, change: true } },
              );
              const quiet = kept.mailed.map(toldStretch);
              followed = follow ? named(followed, quiet, kept.moves) : quiet;
            }
            return followed;
          };
          const mailed = inLine(kept.mailed);
          const pushed = inLine(kept.pushed, true);

          // What the look saw takes the place of what was known of the spot.
          await tx
            .delete(alertWindow)
            .where(and(eq(alertWindow.alertId, row.id), eq(alertWindow.spotId, place.id)));
          if (plan.windows.length > 0) {
            await tx.insert(alertWindow).values(
              plan.windows.map((window) => ({
                alertId: row.id,
                spotId: place.id,
                seaStart: window.sea.start,
                seaEnd: window.sea.end,
                seen: window.seen,
                // Its hours that are not over, for what is said of them before the next look.
                hours: hours
                  .filter(
                    (hour) =>
                      hour.time.getTime() + HOUR_MS > now.getTime() &&
                      hour.time.getTime() + HOUR_MS > window.sea.start.getTime() &&
                      hour.time.getTime() < window.sea.end.getTime(),
                  )
                  .map((hour) => seaHour(hour, asksSwell(row.criteria))),
              })),
            );
          }
          await tx
            .update(alertSpot)
            .set({
              told: plan.told.map(toldStretch),
              cutBy: cut,
              lookedAt: now,
              forecastFetchedAt: fetchedAt,
              ...(mailed === kept.mailed ? {} : { mailed }),
              ...(pushed === kept.pushed ? {} : { pushed }),
            })
            .where(and(eq(alertSpot.alertId, row.id), eq(alertSpot.spotId, place.id)));

          for (const told of plan.tell) {
            lines[told.moment].push(lineOf(told, place, hours, fetchedAt, asksSwell(row.criteria)));
          }
        }
        await tx
          .update(alert)
          .set({ lookedAt: now, updatedAt: current.updatedAt })
          .where(eq(alert.id, row.id));

        // One notification for a moment of the alert at this look, with a line for each spot.
        const rows = MOMENTS.filter((moment) => lines[moment].length > 0).map((moment) => ({
          id: crypto.randomUUID(),
          userId: row.userId,
          alertId: row.id,
          moment,
          // A moment of an alert is told once for a look, whoever writes it.
          key: `${moment}:${row.id}:${now.toISOString()}`,
          payload: {
            alertName: current.name,
            zone,
            lines: lines[moment],
          } satisfies NotificationPayload,
        }));
        if (rows.length === 0) return 0;
        const made = await tx
          .insert(notification)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: notification.id });
        // Each notification that was written leaves by the ways out its account chose.
        for (const { id } of made) {
          const row = rows.find((one) => one.id === id);
          if (row) await queueDeliveries(tx, row, settings, now);
        }
        return made.length;
      }),
    catch: (cause) => new StoreError({ provider: "alerts", cause }),
  });
  return { spots: seen.length, stale: left, created } satisfies Looked;
});

// What a notification says of a spot: its open hours, what they were, what the forecast gives
// for the first of them, and when that forecast was fetched.
function lineOf(
  told: Told,
  place: { id: string; name: string },
  hours: Hours,
  fetchedAt: Date,
  withSwell: boolean,
): NotificationPayload["lines"][number] {
  const open = "open" in told ? told.open : [];
  const first = open[0]?.start.getTime();
  const hour = hours.find((at) => at.time.getTime() === first);
  return {
    spotId: place.id,
    spotName: place.name,
    forecastFetchedAt: fetchedAt.toISOString(),
    open: open.map(stretch),
    ...("before" in told ? { before: told.before.map(stretch) } : {}),
    ...(hour ? { sea: figuresOf(seaHour(hour, withSwell)) } : {}),
  };
}

/** What a run of the alerts did, as the worker says it of a job: decision 022. */
export function alertsDone({
  spots,
  created,
  failed,
  stale,
}: Effect.Success<ReturnType<typeof evaluateAlerts>>) {
  return {
    counts: { spots, created, failed, stale },
    // The run went to its end, and some alerts could not be looked at, or some spots were left
    // as they were for want of a fresh forecast.
    degraded: failed > 0 || stale > 0,
  };
}

/**
 * Looks at every alert that is on and whose last look is old enough: reads the forecast at each
 * of its spots, and records what its owner should be told. One alert that fails does not stop
 * the others. `spots` counts the spots a fresh forecast was read for, `stale` those left as
 * they were because only an older one could be had, or none, and `failed` the alerts of which
 * no spot could be read.
 */
export const evaluateAlerts = Effect.fn("evaluateAlerts")(function* (
  db: Database,
  forecasts: Forecasts,
) {
  const now = new Date();
  const alerts = yield* Effect.tryPromise({
    try: () =>
      db
        .select()
        .from(alert)
        .where(
          and(
            eq(alert.enabled, true),
            or(isNull(alert.lookedAt), lte(alert.lookedAt, new Date(now.getTime() - LOOK_GAP_MS))),
            // The alerts of a suspended account would spend the forecasts' budget for no one.
            notExists(
              db
                .select({ userId: accountSuspension.userId })
                .from(accountSuspension)
                .where(eq(accountSuspension.userId, alert.userId)),
            ),
          ),
        )
        // Those looked at longest ago first, and those never looked at before them: an
        // instance short of requests leaves no alert behind for good.
        .orderBy(sql`${alert.lookedAt} asc nulls first`, asc(alert.id)),
    catch: (cause) => new StoreError({ provider: "alerts", cause }),
  });

  let spots = 0;
  let created = 0;
  let failed = 0;
  let stale = 0;
  // One alert at a time, to stay light on the forecast provider.
  for (const row of alerts) {
    const result = yield* Effect.result(lookAt(db, forecasts, row));
    if (Result.isFailure(result)) {
      failed += 1;
      // The log names no alert: an alert is its owner's alone. It says what kind of failure.
      yield* Effect.logWarning(`alerts: an alert could not be looked at (${result.failure._tag})`);
    } else {
      spots += result.success.spots;
      created += result.success.created;
      stale += result.success.stale;
    }
  }

  yield* Effect.logInfo(
    `alerts: ${alerts.length} alerts, ${spots} spots looked at, ${created} notifications, ${failed} failed, ${stale} left for want of a fresh forecast`,
  );
  return { spots, created, failed, stale };
});
