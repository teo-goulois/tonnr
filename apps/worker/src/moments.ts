import type { ToldPiece } from "@repo/conditions/alerts/look";
import {
  type Watched,
  beginnings,
  dayOf,
  eveningFor,
  hoursOfDay,
} from "@repo/conditions/alerts/moments";
import { type Interval, openHours } from "@repo/conditions/alerts/open";
import { availabilityOf, settingsOf, zoneOf } from "@repo/conditions/alerts/settings";
import type { Database } from "@repo/db";
import { isSuspended } from "@repo/db/accounts";
import { accountSuspension } from "@repo/db/schema/access";
import {
  type NotificationPayload,
  type Stretch,
  type ToldStretch,
  alert,
  alertSettings,
  alertSpot,
  alertWindow,
  notification,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { reading, station } from "@repo/db/schema/buoys";
import { spot } from "@repo/db/schema/spots";
import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { Effect, Result } from "effect";

import { StoreError } from "./store";

// Decision 031, "The moments": what the worker tells between two looks, from what the last
// look kept. It reads no forecast: "it is on" when open hours begin, and the evening before.
//
// What is read first only says where to look. Whatever is told is decided again from what the
// database holds then, under a lock: an alert that was switched off meanwhile, a piece another
// worker has just said, a setting that changed, are seen there.

const MINUTE_MS = 60 * 1000;
// A wave station is read for "it is on" when it is this near, and its reading this recent.
const STATION_KM = 60;
const READING_FRESH_MS = 2 * 60 * MINUTE_MS;
// Among the stations near enough, the nearest few are asked for a reading, the nearest first.
const STATIONS_ASKED = 5;
const EARTH_KM = 6371;
const KM_PER_DEGREE = 111.2;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Place = { id: string; name: string; latitude: number; longitude: number };
type Line = NotificationPayload["lines"][number];

const stretch = (interval: Interval): Stretch => ({
  start: interval.start.toISOString(),
  end: interval.end.toISOString(),
});
const interval = (kept: Stretch): Interval => ({
  start: new Date(kept.start),
  end: new Date(kept.end),
});
const toldPiece = (kept: ToldStretch): ToldPiece => ({
  ...interval(kept),
  missed: kept.missed,
  ...(kept.last ? { last: interval(kept.last) } : {}),
});
// The pieces said to begin that are not over: one that is over no longer hides a later one.
const running = (begun: Stretch[], now: Date) =>
  begun.filter((piece) => new Date(piece.end).getTime() > now.getTime());

function distanceKm(
  one: { latitude: number; longitude: number },
  other: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(other.latitude - one.latitude) / 2) ** 2 +
    Math.cos(radians(one.latitude)) *
      Math.cos(radians(other.latitude)) *
      Math.sin(radians(other.longitude - one.longitude) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/**
 * The longitudes of a box that holds every point within a distance of a place: one range, two
 * when it passes the antimeridian, and null for every longitude, near a pole. The distance
 * itself is checked afterwards.
 */
export function longitudesNear(place: { latitude: number; longitude: number }, km: number) {
  const latitudes = km / KM_PER_DEGREE;
  // The parallel of the box that is nearest a pole is the narrowest: the box is as wide there.
  const farthest = Math.min(90, Math.abs(place.latitude) + latitudes);
  const width = latitudes / Math.cos((farthest * Math.PI) / 180);
  if (farthest >= 90 || width >= 180) return null;
  const [west, east] = [place.longitude - width, place.longitude + width];
  if (west < -180) return [[west + 360, 180] as const, [-180, east] as const];
  if (east > 180) return [[west, 180] as const, [-180, east - 360] as const];
  return [[west, east] as const];
}

/**
 * The latest wave reading of the nearest station that the sea reaches freely, near a place and
 * no older than two hours. Null far from any, or when none near has measured waves lately. It
 * is the whole sea where the station stands, and confirms nothing of a spot: decision 031,
 * "What the buoy says".
 */
async function wavesNear(db: Database | Transaction, place: Place, now: Date) {
  const since = new Date(now.getTime() - READING_FRESH_MS);
  const latitudes = STATION_KM / KM_PER_DEGREE;
  const longitudes = longitudesNear(place, STATION_KM);
  const near = await db
    .select({
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
    })
    .from(station)
    .where(
      and(
        eq(station.reportsWaves, true),
        // A station that is not known to be sheltered: open, or not told yet (decision 011).
        or(isNull(station.exposure), ne(station.exposure, "sheltered")),
        // A station that said nothing lately has no reading to give.
        gte(station.latestObservedAt, since),
        between(station.latitude, place.latitude - latitudes, place.latitude + latitudes),
        longitudes
          ? or(...longitudes.map(([west, east]) => between(station.longitude, west, east)))
          : undefined,
      ),
    );
  const nearest = near
    .map((one) => ({ ...one, distanceKm: distanceKm(place, one) }))
    .filter((one) => one.distanceKm <= STATION_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, STATIONS_ASKED);
  for (const one of nearest) {
    // Its latest reading that measured waves: a later one may hold the wind alone. One that
    // is dated after now is a clock that is wrong, and is not read.
    const [read] = await db
      .select()
      .from(reading)
      .where(
        and(
          eq(reading.stationId, one.id),
          isNotNull(reading.significantHeightM),
          gte(reading.observedAt, since),
          lte(reading.observedAt, now),
        ),
      )
      .orderBy(desc(reading.observedAt))
      .limit(1);
    if (!read) continue;
    return {
      stationId: one.id,
      name: one.name,
      distanceKm: Math.round(one.distanceKm * 10) / 10,
      observedAt: read.observedAt.toISOString(),
      significantHeightMeters: read.significantHeightM,
      peakPeriodSeconds: read.peakPeriodS,
      peakDirectionDegrees: read.peakDirectionDeg,
    } satisfies NonNullable<Line["buoy"]>;
  }
  return null;
}

// The spots of an account's alerts that are on, with what the last look kept of each.
async function watchedOf(
  tx: Database | Transaction,
  where: { alertId: string } | { userId: string },
) {
  const links = await tx
    .select({
      alert,
      link: alertSpot,
      place: { id: spot.id, name: spot.name, latitude: spot.latitude, longitude: spot.longitude },
    })
    .from(alertSpot)
    .innerJoin(alert, eq(alert.id, alertSpot.alertId))
    .innerJoin(spot, eq(spot.id, alertSpot.spotId))
    .where(
      and(
        eq(alert.enabled, true),
        "alertId" in where ? eq(alert.id, where.alertId) : eq(alert.userId, where.userId),
      ),
    )
    .orderBy(asc(alert.createdAt), asc(alert.id), asc(alertSpot.position));
  const alertIds = [...new Set(links.map((one) => one.alert.id))];
  const windows =
    alertIds.length === 0
      ? []
      : await tx.select().from(alertWindow).where(inArray(alertWindow.alertId, alertIds));
  const bySpot = Map.groupBy(windows, (window) => window.spotId);
  return links.map((one) => ({ ...one, windows: bySpot.get(one.place.id) ?? [] }));
}
type Link = Awaited<ReturnType<typeof watchedOf>>[number];

const watched = (one: Link, now: Date): Watched => ({
  spotId: one.place.id,
  windows: one.windows.map((window) => ({
    sea: { start: window.seaStart, end: window.seaEnd },
    seen: window.seen,
  })),
  told: one.link.told.map(toldPiece),
  lookedAt: one.link.lookedAt,
  begun: running(one.link.begun, now).map(interval),
});

// The hours of a sea window an account can use, by its settings and its alert's.
function openOf(links: Link[], availability: ReturnType<typeof availabilityOf>) {
  const of = new Map(links.map((one) => [one.place.id, one]));
  return (spotId: string, sea: Interval) => {
    const one = of.get(spotId);
    return one ? openHours(sea, one.place, availability, one.alert.shortestMinutes) : [];
  };
}

/**
 * Says that open hours begin at spots of an alert, when some do: one notification, with a line
 * for each spot. The alert is held, and all that decides is read then: a piece that another
 * worker has said meanwhile is not said again, whatever the quarter of an hour.
 */
async function tellBeginning(db: Database, alertId: string) {
  return db.transaction(async (tx) => {
    // The alert first, as whatever writes to its spots holds it.
    const [held] = await tx.select().from(alert).where(eq(alert.id, alertId)).for("update");
    if (!held?.enabled) return 0;
    // Its owner, held so that a suspension waits for this, or is seen here.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, held.userId)).for("share");
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
        .where(and(eq(alertSpot.alertId, alertId), eq(alertSpot.spotId, one.place.id)));
    }
    if (due.length === 0) return 0;

    const lines: Line[] = [];
    for (const one of links) {
      const piece = said.get(one.place.id);
      if (!piece) continue;
      lines.push({
        spotId: one.place.id,
        spotName: one.place.name,
        open: [stretch(piece)],
        buoy: await wavesNear(tx, one.place, now),
      });
    }
    await tx.insert(notification).values({
      id: crypto.randomUUID(),
      userId: held.userId,
      alertId,
      moment: "begins",
      // That a piece is said once is what the alert's lock and `begun` hold: whoever comes
      // next reads what this wrote. The key is the alert and the moment it was said.
      key: `begins:${alertId}:${now.toISOString()}`,
      payload: { alertName: held.name, zone: zoneOf(settings), lines },
    });
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
    const of = new Map(links.map((one) => [one.place.id, one]));
    const lines: Line[] = hoursOfDay(
      day,
      zone,
      now,
      links.map((one) => watched(one, now)),
      openOf(links, availabilityOf(settings)),
    ).flatMap(({ spotId, pieces }) => {
      const one = of.get(spotId);
      if (!one) return [];
      return [
        {
          spotId,
          spotName: one.place.name,
          alertName: one.alert.name,
          open: pieces.map(stretch),
        },
      ];
    });
    // An evening with nothing to list sends nothing, and may still have something later.
    if (lines.length === 0) return 0;

    const whole = dayOf(day, zone);
    const inserted = await tx
      .insert(notification)
      .values({
        id: crypto.randomUUID(),
        userId,
        alertId: null,
        moment: "evening",
        // The day as the stretch of time it is: the same date on another clock is another day.
        key: `evening:${userId}:${whole.start.toISOString()}`,
        payload: { alertName: null, zone, day, lines },
      })
      .onConflictDoNothing()
      .returning({ id: notification.id });
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

/** What a run of the moments did, as the worker says it of a job: decision 022. */
export function momentsDone({
  begins,
  evenings,
  failed,
}: {
  begins: number;
  evenings: number;
  failed: number;
}) {
  return { counts: { begins, evenings, failed }, degraded: failed > 0 };
}

/**
 * Tells what begins and, at an account's evening hour, what the next day holds: one
 * notification for an alert whose open hours begin, and one for an account's evening. One that
 * fails does not stop the others, and what was told before it is counted.
 */
export const tellMoments = Effect.fn("tellMoments")(function* (db: Database) {
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
        link: alertSpot,
        place: { id: spot.id, name: spot.name, latitude: spot.latitude, longitude: spot.longitude },
      })
      .from(alertSpot)
      .innerJoin(alert, eq(alert.id, alertSpot.alertId))
      .innerJoin(spot, eq(spot.id, alertSpot.spotId))
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
  if (links.length === 0) return { begins: 0, evenings: 0, failed: 0 };
  const alertIds = [...new Set(links.map((one) => one.alertId))];
  const userIds = [...new Set(links.map((one) => one.userId))];
  const windows = yield* store(() =>
    db.select().from(alertWindow).where(inArray(alertWindow.alertId, alertIds)),
  );
  const settingsRows = yield* store(() =>
    db.select().from(alertSettings).where(inArray(alertSettings.userId, userIds)),
  );
  const windowsAt = Map.groupBy(windows, (window) => window.spotId);
  const settingsOfUser = new Map(settingsRows.map((row) => [row.userId, row]));
  const linksOfAlert = Map.groupBy(links, (one) => one.alertId);

  let begins = 0;
  let evenings = 0;
  let failed = 0;
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
    const availability = availabilityOf(settings);
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
          windows: (windowsAt.get(one.place.id) ?? []).map((window) => ({
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
  return { begins, evenings, failed };
});
