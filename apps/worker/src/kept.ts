import type { ToldPiece } from "@repo/conditions/alerts/look";
import type { Watched } from "@repo/conditions/alerts/moments";
import { type Availability, type Interval, openHours } from "@repo/conditions/alerts/open";
import type { Database } from "@repo/db";
import {
  type SeaFigures,
  type SeaHour,
  type Stretch,
  type ToldStretch,
  alert,
  alertSpot,
  alertWindow,
} from "@repo/db/schema/alerts";
import { spot } from "@repo/db/schema/spots";
import { and, asc, eq, inArray } from "drizzle-orm";

// What the worker keeps of an alert from one pass to the next, as the passes read it. Much of
// it is JSON: these turn it into the moments that the rules of `packages/conditions` work
// with, and back.

const HOUR_MS = 60 * 60 * 1000;

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const stretch = (interval: Interval): Stretch => ({
  start: interval.start.toISOString(),
  end: interval.end.toISOString(),
});
export const interval = (kept: Stretch): Interval => ({
  start: new Date(kept.start),
  end: new Date(kept.end),
});
export const toldPiece = (kept: ToldStretch): ToldPiece => ({
  ...interval(kept),
  missed: kept.missed,
  ...(kept.last ? { last: interval(kept.last) } : {}),
});
export const toldStretch = (piece: ToldPiece): ToldStretch => ({
  ...stretch(piece),
  missed: piece.missed,
  ...(piece.last ? { last: stretch(piece.last) } : {}),
});

/** An hour of the sea as a look read it, as a window keeps it. */
export const seaHour = (hour: SeaFigures & { time: Date }): SeaHour => ({
  time: hour.time.toISOString(),
  swellHeightMeters: hour.swellHeightMeters,
  swellPeriodSeconds: hour.swellPeriodSeconds,
  swellDirectionDegrees: hour.swellDirectionDegrees,
  windSpeedMetersPerSecond: hour.windSpeedMetersPerSecond,
  windDirectionDegrees: hour.windDirectionDegrees,
  tideHeightMeters: hour.tideHeightMeters,
  tideTrend: hour.tideTrend,
});

/** The figures of an hour, without the hour. */
export const figuresOf = ({ time: _time, ...figures }: SeaHour): SeaFigures => figures;

/**
 * What the last look read of the sea for the hour a moment falls in, among the hours its
 * windows keep, and which hour that is: a series of hours need not begin on the hour.
 * Undefined when no window holds that hour.
 */
export function seaAt(windows: { hours: SeaHour[] }[], moment: Date) {
  for (const window of windows) {
    const found = window.hours.find((one) => {
      const begins = new Date(one.time).getTime();
      return begins <= moment.getTime() && moment.getTime() < begins + HOUR_MS;
    });
    if (found) return { at: new Date(found.time), ...figuresOf(found) };
  }
  return undefined;
}

/** The later of a moment and now: the hour hours that have begun are in. */
export const fromNow = (moment: Date, now: Date) =>
  moment.getTime() > now.getTime() ? moment : now;

// The pieces said to begin that are not over: one that is over no longer hides a later one.
export const running = (begun: Stretch[], now: Date) =>
  begun.filter((piece) => new Date(piece.end).getTime() > now.getTime());

/** The spots of alerts that are on, of one alert or of an account, with what the last look kept. */
export async function watchedOf(
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
export type Link = Awaited<ReturnType<typeof watchedOf>>[number];

/** A spot of an alert as the rules of the moments read it. */
export const watched = (one: Link, now: Date): Watched => ({
  spotId: one.place.id,
  windows: one.windows.map((window) => ({
    sea: { start: window.seaStart, end: window.seaEnd },
    seen: window.seen,
  })),
  told: one.link.told.map(toldPiece),
  lookedAt: one.link.lookedAt,
  begun: running(one.link.begun, now).map(interval),
});

/** The hours of a sea window an account can use, by its settings and its alert's. */
export function openOf(links: Link[], availability: Availability) {
  const of = new Map(links.map((one) => [one.place.id, one]));
  return (spotId: string, sea: Interval) => {
    const one = of.get(spotId);
    return one ? openHours(sea, one.place, availability, one.alert.shortestMinutes) : [];
  };
}
