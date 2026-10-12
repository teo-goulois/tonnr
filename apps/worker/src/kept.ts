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

/**
 * The name of a window a way out told, from one of its messages to the next: where its hours
 * began when they were first told. A push is shown under it, so that what is said of a window
 * that moved, or that went, takes the place of what was said of it before.
 */
export const windowOf = (told: Pick<ToldStretch, "start" | "since">) => told.since ?? told.start;

const overlap = (one: Stretch, other: Stretch) =>
  Math.min(new Date(one.end).getTime(), new Date(other.end).getTime()) -
  Math.max(new Date(one.start).getTime(), new Date(other.start).getTime());

/**
 * Gives what a way out tells now the names of the windows it told before. Hours that begin
 * where told hours did are those hours. Hours that moved are the hours they were, which `moves`
 * says: where they are now, and where they were told. Hours that are a part of told hours, as
 * when a change of the account's hours cut them, are a part of that window. Any others are a
 * window of their own, named by where they begin.
 *
 * No two windows have one name: of hours that would share one, as the two parts of a window
 * that was cut in its middle, the first keep it, and the others are named by where they begin.
 * So what is said under a name is said of one window, and a newer word on it leaves nothing
 * unsaid of another.
 */
export function named(
  before: ToldStretch[],
  after: ToldStretch[],
  moves: { open: Interval[]; before: Interval }[] = [],
): ToldStretch[] {
  const at = (moment: string | Date) => new Date(moment).getTime();
  const toldAt = (start: string | Date) => before.find((told) => at(told.start) === at(start));
  const taken = new Set<string>();
  // A name that is free, or the hours' own beginning, or that with a sign after it: a name is
  // only ever compared with another.
  const free = (name: string, own: string) => {
    let given = taken.has(name) ? own : name;
    while (taken.has(given)) given += "+";
    taken.add(given);
    return given;
  };
  const names = new Map<ToldStretch, string>();
  // Hours that are told again where they were keep their name before any other is given.
  for (const piece of after) {
    const same = toldAt(piece.start);
    if (same) names.set(piece, free(windowOf(same), piece.start));
  }
  for (const piece of after.toSorted((one, other) => at(one.start) - at(other.start))) {
    if (names.has(piece)) continue;
    // Where it was told before it moved: of the told hours that became it, the nearest.
    const [was] = moves
      .filter((move) => move.open.some((open) => at(open.start) === at(piece.start)))
      .map((move) => move.before)
      .toSorted(
        (one, other) =>
          Math.abs(at(one.start) - at(piece.start)) - Math.abs(at(other.start) - at(piece.start)),
      );
    const [part] = before
      .filter((told) => overlap(told, piece) > 0)
      .toSorted((one, other) => overlap(other, piece) - overlap(one, piece));
    const told = (was && toldAt(was.start)) ?? part;
    names.set(piece, free(told ? windowOf(told) : piece.start, piece.start));
  }
  return after.map((piece) => {
    const { since: _since, ...hours } = piece;
    const name = names.get(piece) ?? piece.start;
    return name === piece.start ? hours : { ...hours, since: name };
  });
}

/**
 * An hour of the sea as a look read it, as a window keeps it. The swell apart is kept for an
 * alert that asks about it, so that what is told of that alert can say it.
 */
export const seaHour = (hour: SeaFigures & { time: Date }, withSwell: boolean): SeaHour => ({
  time: hour.time.toISOString(),
  waveHeightMeters: hour.waveHeightMeters,
  wavePeakPeriodSeconds: hour.wavePeakPeriodSeconds,
  waveDirectionDegrees: hour.waveDirectionDegrees,
  ...(withSwell
    ? {
        primarySwellHeightMeters: hour.primarySwellHeightMeters ?? null,
        primarySwellDirectionDegrees: hour.primarySwellDirectionDegrees ?? null,
      }
    : {}),
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
  // A spot may be in several alerts: its windows are those of the alert the link is of.
  const byLink = Map.groupBy(windows, (window) => linkKey(window.alertId, window.spotId));
  return links.map((one) => ({
    ...one,
    windows: byLink.get(linkKey(one.alert.id, one.place.id)) ?? [],
  }));
}
export type Link = Awaited<ReturnType<typeof watchedOf>>[number];

/** What names a spot of an alert among those of other alerts: a spot may be in several. */
export const linkKey = (alertId: string, spotId: string) => `${alertId}:${spotId}`;

/** The spots of each alert, alert by alert, in the order they were read. */
export const byAlert = (links: Link[]) => [...Map.groupBy(links, (one) => one.alert.id).values()];

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

/**
 * The hours of a sea window an account can use, by its settings and its alert's, at the spots
 * of one alert: the shortest window is the alert's, and a spot is named once.
 */
export function openOf(links: Link[], availability: Availability) {
  const of = new Map(links.map((one) => [one.place.id, one]));
  return (spotId: string, sea: Interval) => {
    const one = of.get(spotId);
    return one ? openHours(sea, one.place, availability, one.alert.shortestMinutes) : [];
  };
}
