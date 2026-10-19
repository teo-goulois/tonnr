import { beginnings, dayOf, eveningFor, hoursOfDay } from "@repo/conditions/alerts/moments";
import { openHours } from "@repo/conditions/alerts/open";
import { availabilityOf, settingsOf, zoneOf } from "@repo/conditions/alerts/settings";
import type { Database } from "@repo/db";
import { isSuspended } from "@repo/db/accounts";
import { accountSuspension } from "@repo/db/schema/access";
import {
  type NotificationPayload,
  alert,
  alertSettings,
  alertSpot,
  alertWindow,
  notification,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { and, asc, eq, inArray, notExists, sql } from "drizzle-orm";
import { Effect, Result } from "effect";

import { type MailOut, type PushOut, queueDeliveries, sendDeliveries } from "./deliveries";
import {
  breakOfLink,
  byAlert,
  fromNow,
  interval,
  linkKey,
  openOf,
  placeColumns,
  running,
  seaAt,
  spotOfLink,
  stretch,
  toldPiece,
  watched,
  watchedOf,
} from "./kept";
import { wavesNear } from "./stations";
import { StoreError } from "./store";

type Line = NotificationPayload["lines"][number];

// What the last look read of the sea for an hour, as a notification keeps it.
const seaOf = (windows: Parameters<typeof seaAt>[0], moment: Date) => {
  const read = seaAt(windows, moment);
  if (!read) return {};
  const { at: _at, ...sea } = read;
  return { sea };
};

// Decision 031, "The moments": what the worker tells between two looks, from what the last
// look kept. It reads no forecast: "it is on" when open hours begin, and the evening before.
//
// What is read first only says where to look. Whatever is told is decided again from what the
// database holds then, under a lock: an alert that was switched off meanwhile, a piece another
// worker has just said, a setting that changed, are seen there.

/**
 * Says that open hours begin at spots of an alert, when some do: one notification, with a line
 * for each spot. The alert is held, and all that decides is read then: a piece that another
 * worker has said meanwhile is not said again, whatever the quarter of an hour.
 */
async function tellBeginning(db: Database, alertId: string) {
  return db.transaction(async (tx) => {
    // Its owner first, held so that a suspension waits for this, or is seen here, and so that
    // an account that is deleted takes its alerts in the same order. Then the alert, as
    // whatever writes to its spots holds it.
    const [owned] = await tx
      .select({ userId: alert.userId })
      .from(alert)
      .where(eq(alert.id, alertId));
    if (!owned) return 0;
    await tx.select({ id: user.id }).from(user).where(eq(user.id, owned.userId)).for("share");
    const [held] = await tx.select().from(alert).where(eq(alert.id, alertId)).for("update");
    if (!held?.enabled) return 0;
    if (await isSuspended(tx, held.userId)) return 0;
    const [settingsRow] = await tx
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.userId, held.userId));
    const settings = settingsOf(settingsRow);
    const links = await watchedOf(tx, { alertId });
    // The moment this is decided, not the moment the run began.
    const now = new Date();
    const due = settings.onBegin
      ? beginnings(
          now,
          links.map((one) => watched(one, now)),
          { open: openOf(links, availabilityOf(settings)), noticeMinutes: settings.noticeMinutes },
        )
      : [];

    // A piece that was said and is over is forgotten, whether another begins or not.
    const said = new Map(due.map((one) => [one.spotId, one.piece]));
    for (const one of links) {
      const kept = running(one.link.begun, now);
      const piece = said.get(one.place.id);
      if (!piece && kept.length === one.link.begun.length) continue;
      await tx
        .update(alertSpot)
        .set({ begun: piece ? [...kept, stretch(piece)] : kept })
        .where(and(eq(alertSpot.alertId, alertId), eq(alertSpot.placeId, one.place.id)));
    }
    if (due.length === 0) return 0;

    const lines: Line[] = [];
    for (const one of links) {
      const piece = said.get(one.place.id);
      if (!piece) continue;
      lines.push({
        spotId: one.place.id,
        spotName: one.place.name,
        ...(one.place.breakId ? { breakId: one.place.breakId } : {}),
        open: [stretch(piece)],
        // What the last look read of the sea for the hour it begins, or for this one.
        ...seaOf(one.windows, fromNow(piece.start, now)),
        ...(one.link.forecastFetchedAt
          ? { forecastFetchedAt: one.link.forecastFetchedAt.toISOString() }
          : {}),
        buoy: await wavesNear(tx, one.place, now),
      });
    }
    const made = {
      id: crypto.randomUUID(),
      userId: held.userId,
      alertId,
      moment: "begins" as const,
      // That a piece is said once is what the alert's lock and `begun` hold: whoever comes
      // next reads what this wrote. The key is the alert and the moment it was said.
      key: `begins:${alertId}:${now.toISOString()}`,
      payload: { alertName: held.name, zone: zoneOf(settings), lines },
    };
    await tx.insert(notification).values(made);
    await queueDeliveries(tx, made, settings, now);
    return 1;
  });
}

/**
 * Lists the next day's open hours to an account, at its evening hour: one notification for all
 * its alerts. An account's evenings are decided one at a time, from what the database holds
 * then, so that two workers, or a change of time zone, do not list one day twice.
 */
async function tellEvening(db: Database, userId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`alert-evening:${userId}`}, 0))`,
    );
    if (await isSuspended(tx, userId)) return 0;
    const [settingsRow] = await tx
      .select()
      .from(alertSettings)
      .where(eq(alertSettings.userId, userId));
    const settings = settingsOf(settingsRow);
    if (!settings.onEvening) return 0;
    const zone = zoneOf(settings);
    // The moment this is decided: an evening that ended while the run went on is not told.
    const now = new Date();
    const day = eveningFor(
      now,
      { zone, eveningMinutes: settings.eveningMinutes },
      settingsRow?.eveningUntil ?? null,
    );
    if (!day) return 0;

    const links = await watchedOf(tx, { userId });
    const availability = availabilityOf(settings);
    // Alert by alert: a spot that is in two of them is listed under each, with its own hours.
    const lines: Line[] = byAlert(links).flatMap((spots) => {
      const of = new Map(spots.map((one) => [one.place.id, one]));
      return hoursOfDay(
        day,
        zone,
        now,
        spots.map((one) => watched(one, now)),
        openOf(spots, availability),
      ).flatMap(({ spotId, pieces }) => {
        const one = of.get(spotId);
        const [first] = pieces;
        if (!one || !first) return [];
        return [
          {
            spotId,
            spotName: one.place.name,
            ...(one.place.breakId ? { breakId: one.place.breakId } : {}),
            alertId: one.alert.id,
            alertName: one.alert.name,
            open: pieces.map(stretch),
            ...seaOf(one.windows, fromNow(first.start, now)),
            ...(one.link.forecastFetchedAt
              ? { forecastFetchedAt: one.link.forecastFetchedAt.toISOString() }
              : {}),
          },
        ];
      });
    });
    // An evening with nothing to list sends nothing, and may still have something later.
    if (lines.length === 0) return 0;

    const whole = dayOf(day, zone);
    const made = {
      id: crypto.randomUUID(),
      userId,
      alertId: null,
      moment: "evening" as const,
      // The day as the stretch of time it is: the same date on another clock is another day.
      key: `evening:${userId}:${whole.start.toISOString()}`,
      payload: { alertName: null, zone, day, lines },
    };
    const inserted = await tx
      .insert(notification)
      .values(made)
      .onConflictDoNothing()
      .returning({ id: notification.id });
    if (inserted.length > 0) await queueDeliveries(tx, made, settings, now);
    // The day is listed, by this or by a notification that already listed that very stretch.
    // What the account set keeps the time it was set at, and its days only go forward.
    await tx
      .insert(alertSettings)
      .values({ userId, eveningUntil: whole.end })
      .onConflictDoUpdate({
        target: alertSettings.userId,
        set: {
          eveningUntil: sql`greatest(${alertSettings.eveningUntil}, ${whole.end.toISOString()}::timestamptz)`,
          updatedAt: sql`${alertSettings.updatedAt}`,
        },
      });
    return inserted.length;
  });
}

type Told = { begins: number; evenings: number; mails: number; pushes: number; failed: number };

/** What a run of the moments did, as the worker says it of a job: decision 022. */
export function momentsDone({ begins, evenings, mails, pushes, failed }: Told) {
  return { counts: { begins, evenings, mails, pushes, failed }, degraded: failed > 0 };
}

/**
 * Tells what begins and, at an account's evening hour, what the next day holds: one
 * notification for an alert whose open hours begin, and one for an account's evening. Then it
 * sends the alert mails and the pushes that are due, with what `mail` and `push` give, and
 * none by a way out it is given nothing for. One thing that fails does not stop the others,
 * and what was told before it is counted.
 */
export const tellMoments = Effect.fn("tellMoments")(function* (
  db: Database,
  mail: MailOut | null = null,
  push: PushOut | null = null,
) {
  const started = new Date();
  const store = <Value>(read: () => Promise<Value>) =>
    Effect.tryPromise({
      try: read,
      catch: (cause) => new StoreError({ provider: "alerts", cause }),
    });

  // Where to look: the alerts that are on, of accounts that are not kept out, and what was
  // last seen at their spots. Nothing is told from this reading alone.
  const links = yield* store(async () => {
    const rows = await db
      .select({
        alertId: alert.id,
        userId: alert.userId,
        shortestMinutes: alert.shortestMinutes,
        awayUntil: alert.awayUntil,
        link: alertSpot,
        place: placeColumns,
      })
      .from(alertSpot)
      .innerJoin(alert, eq(alert.id, alertSpot.alertId))
      .leftJoin(spot, spotOfLink)
      .leftJoin(surfBreak, breakOfLink)
      .where(
        and(
          eq(alert.enabled, true),
          notExists(
            db
              .select({ userId: accountSuspension.userId })
              .from(accountSuspension)
              .where(eq(accountSuspension.userId, alert.userId)),
          ),
        ),
      )
      .orderBy(asc(alert.userId), asc(alert.id));
    return rows;
  });
  let begins = 0;
  let evenings = 0;
  let failed = 0;
  // What is on its way out leaves whether anything is told now or not.
  const send = function* () {
    const sent = yield* Effect.result(sendDeliveries(db, { mail, push }));
    if (Result.isFailure(sent)) {
      failed += 1;
      yield* Effect.logWarning(
        `moments: what is on its way out could not be read (${sent.failure._tag})`,
      );
      return { mails: 0, pushes: 0 };
    }
    for (const [name, what, counts] of [
      ["mail", "alert mails", sent.success.mail],
      ["push", "alert pushes", sent.success.push],
    ] as const) {
      failed += counts.failed;
      if (counts.sent + counts.failed + counts.held + counts.expired > 0) {
        yield* Effect.logInfo(
          `${name}: ${counts.sent} ${what} sent, ${counts.failed} failed, ${counts.held} held back by a limit, ${counts.expired} no longer worth sending`,
        );
      }
    }
    return { mails: sent.success.mail.sent, pushes: sent.success.push.sent };
  };
  if (links.length === 0) {
    const { mails, pushes } = yield* send();
    return { begins, evenings, mails, pushes, failed } satisfies Told;
  }
  const alertIds = [...new Set(links.map((one) => one.alertId))];
  const userIds = [...new Set(links.map((one) => one.userId))];
  const windows = yield* store(() =>
    db.select().from(alertWindow).where(inArray(alertWindow.alertId, alertIds)),
  );
  const settingsRows = yield* store(() =>
    db.select().from(alertSettings).where(inArray(alertSettings.userId, userIds)),
  );
  const windowsAt = Map.groupBy(windows, (window) => linkKey(window.alertId, window.placeId));
  const settingsOfUser = new Map(settingsRows.map((row) => [row.userId, row]));
  const linksOfAlert = Map.groupBy(links, (one) => one.alertId);

  const attempt = function* (
    told: Effect.Effect<number, StoreError>,
    count: (made: number) => void,
  ) {
    const result = yield* Effect.result(told);
    if (Result.isSuccess(result)) return count(result.success);
    failed += 1;
    // The log names no alert and no account: it says what kind of failure.
    yield* Effect.logWarning(`moments: something could not be told (${result.failure._tag})`);
  };

  for (const [alertId, spots] of linksOfAlert) {
    const [first] = spots;
    if (!first) continue;
    const settings = settingsOf(settingsOfUser.get(first.userId));
    // The account's hours, and the alert's own pause of "Not today": decision 072.
    const availability = availabilityOf(settings, first);
    const of = new Map(spots.map((one) => [one.place.id, one]));
    // An alert is held only when it has something to say, or something to forget.
    const hasExpired = spots.some(
      (one) => running(one.link.begun, started).length < one.link.begun.length,
    );
    const mayBegin =
      settings.onBegin &&
      beginnings(
        started,
        spots.map((one) => ({
          spotId: one.place.id,
          windows: (windowsAt.get(linkKey(alertId, one.place.id)) ?? []).map((window) => ({
            sea: { start: window.seaStart, end: window.seaEnd },
            seen: window.seen,
          })),
          told: one.link.told.map(toldPiece),
          lookedAt: one.link.lookedAt,
          begun: running(one.link.begun, started).map(interval),
        })),
        {
          open: (spotId, sea) => {
            const one = of.get(spotId);
            return one ? openHours(sea, one.place, availability, one.shortestMinutes) : [];
          },
          noticeMinutes: settings.noticeMinutes,
        },
      ).length > 0;
    if (!mayBegin && !hasExpired) continue;
    yield* attempt(
      store(() => tellBeginning(db, alertId)),
      (made) => {
        begins += made;
      },
    );
  }

  for (const userId of userIds) {
    const row = settingsOfUser.get(userId);
    const settings = settingsOf(row);
    // An account is held only at its evening, for a day that was not listed.
    const mayList =
      settings.onEvening &&
      eveningFor(
        new Date(),
        { zone: zoneOf(settings), eveningMinutes: settings.eveningMinutes },
        row?.eveningUntil ?? null,
      ) !== null;
    if (!mayList) continue;
    yield* attempt(
      store(() => tellEvening(db, userId)),
      (made) => {
        evenings += made;
      },
    );
  }

  yield* Effect.logInfo(
    `moments: ${alertIds.length} alerts of ${userIds.length} accounts, ${begins} told that it is on, ${evenings} evenings, ${failed} failed`,
  );
  const { mails, pushes } = yield* send();
  return { begins, evenings, mails, pushes, failed } satisfies Told;
});
