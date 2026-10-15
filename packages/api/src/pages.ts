import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import { forecastSource } from "@repo/conditions/forecasts/wave-models";
import { type ForecastDay, weekOf } from "@repo/conditions/forecasts/week";
import { shoreWind } from "@repo/conditions/shore-wind";
import { predictTideExtremes } from "@repo/conditions/tides/tide-prediction";
import type { Database } from "@repo/db";
import { reading, station } from "@repo/db/schema/buoys";
import {
  type Break,
  hasPageSql,
  saidCharacteristics,
  STANDS_ALONE_AT,
  standsAlone,
  standsAloneSql,
} from "@repo/db/listed";
import { breakContribution, GUIDE_TEXT_LINES } from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { type AnyColumn, and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { Effect, Result } from "effect";

// What the public page of a surf break says, and which breaks a search engine is asked to list:
// decision 057. The rules read no clock and no database; the queries read the catalogue, the
// stations and what is kept, and ask no provider anything.

type Reader = Pick<Database, "select" | "selectDistinct">;
export type { Break };
type Point = { latitude: number; longitude: number };

export { hasPageSql, saidCharacteristics, STANDS_ALONE_AT, standsAlone, standsAloneSql };

/** Of some breaks, those whose guide has a confirmed text. */
export async function withGuideText(db: Reader, breakIds: string[]) {
  if (breakIds.length === 0) return new Set<string>();
  const rows = await db
    .selectDistinct({ breakId: breakContribution.breakId })
    .from(breakContribution)
    .where(
      and(
        inArray(breakContribution.breakId, breakIds),
        eq(breakContribution.status, "confirmed"),
        inArray(breakContribution.line, [...GUIDE_TEXT_LINES]),
      ),
    );
  return new Set(rows.flatMap((row) => (row.breakId ? [row.breakId] : [])));
}

const EARTH_KM = 6371;

/** The distance between two points along the earth, in kilometres. */
export function distanceKm(one: Point, other: Point) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(other.latitude - one.latitude);
  const dLon = toRadians(other.longitude - one.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(one.latitude)) *
      Math.cos(toRadians(other.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

// How far a break is from a point, near enough to order by: degrees on a flat earth.
const awayFrom = (point: Point, table: { latitude: AnyColumn; longitude: AnyColumn }) =>
  sql`power(${table.latitude} - ${point.latitude}, 2) + power((${table.longitude} - ${point.longitude}) * cos(radians(${point.latitude})), 2)`;

/** A station that measured lately: within a day. */
const MEASURED_WITHIN_MS = 24 * 60 * 60 * 1000;
/** How far the page looks for a buoy, and for a wind station. */
export const WAVES_WITHIN_KM = 100;
export const WIND_WITHIN_KM = 50;

/**
 * The nearest station that measures waves, or the wind, within reach of a point, with its
 * latest reading, when it measured within a day. Null when none stands near.
 */
export async function nearestStation(
  db: Reader,
  point: Point,
  measures: "waves" | "wind",
  now: Date,
) {
  const withinKm = measures === "waves" ? WAVES_WITHIN_KM : WIND_WITHIN_KM;
  const degrees = withinKm / 111;
  const rows = await db
    .select({ station, reading })
    .from(station)
    .innerJoin(
      reading,
      and(eq(reading.stationId, station.id), eq(reading.observedAt, station.latestObservedAt)),
    )
    .where(
      and(
        measures === "waves" ? eq(station.reportsWaves, true) : eq(station.reportsWind, true),
        gt(station.latestObservedAt, new Date(now.getTime() - MEASURED_WITHIN_MS)),
        measures === "waves"
          ? isNotNull(reading.significantHeightM)
          : isNotNull(reading.windSpeedMs),
        sql`${station.latitude} between ${point.latitude - degrees} and ${point.latitude + degrees}`,
        sql`${station.longitude} between ${point.longitude - degrees} and ${point.longitude + degrees}`,
      ),
    )
    .orderBy(awayFrom(point, station))
    .limit(3);
  const near = rows
    .map((row) => ({ ...row, distanceKm: distanceKm(point, row.station) }))
    .filter((row) => row.distanceKm <= withinKm)
    .sort((one, other) => one.distanceKm - other.distanceKm);
  return near[0] ?? null;
}

/** How a wind blows at a break, when the break knows where its offshore wind comes from. */
export function windAtShore(windFromDegrees: number | null, offshoreDegrees: number | null) {
  if (windFromDegrees === null || offshoreDegrees === null) return null;
  return shoreWind(windFromDegrees, offshoreDegrees);
}

/** How far the page looks for other breaks, and how many it names. */
export const NEARBY_WITHIN_KM = 50;
export const NEARBY_MOST = 8;

/**
 * The breaks near one, within 50 km, the listed ones first and the nearest among them: eight
 * at most, each with how far it is.
 */
export async function nearbyBreaks(db: Reader, found: Break) {
  const degrees = NEARBY_WITHIN_KM / 111;
  const rows = await db
    .select({ row: surfBreak, listed: sql<boolean>`(${standsAloneSql} and ${hasPageSql})` })
    .from(surfBreak)
    .where(
      and(
        ne(surfBreak.id, found.id),
        hasPageSql,
        sql`${surfBreak.latitude} between ${found.latitude - degrees} and ${found.latitude + degrees}`,
        sql`${surfBreak.longitude} between ${found.longitude - degrees} and ${found.longitude + degrees}`,
      ),
    )
    .orderBy(awayFrom(found, surfBreak))
    .limit(NEARBY_MOST * 4);
  return rows
    .map(({ row, listed }) => ({ row, listed, distanceKm: distanceKm(found, row) }))
    .filter((near) => near.distanceKm <= NEARBY_WITHIN_KM)
    .sort((one, other) =>
      one.listed === other.listed ? one.distanceKm - other.distanceKm : one.listed ? -1 : 1,
    )
    .slice(0, NEARBY_MOST);
}

/** The next tides at a point, from now for a day and a half: the highs and the lows to come. */
export function nextTides(point: Point, now: Date) {
  const end = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  return predictTideExtremes({ ...point, start: now, end });
}

export type Week = {
  days: ForecastDay[];
  fetchedAt: Date;
  stale: boolean;
  source: ReturnType<typeof forecastSource>;
};

/**
 * The week of a break, from the forecast kept for its cell and from nothing else: null when
 * none is kept, or when the point has no sea in it.
 */
export async function weekAt(
  forecasts: Pick<Forecasts, "kept">,
  found: Pick<Break, "latitude" | "longitude" | "timezone">,
  now: Date,
): Promise<Week | null> {
  const result = await Effect.runPromise(Effect.result(forecasts.kept(found)));
  if (Result.isFailure(result)) return null;
  const kept = result.success;
  if (!kept || !kept.hours) return null;
  const days = weekOf(kept.hours, found.timezone, now);
  if (days.length === 0) return null;
  return {
    days,
    fetchedAt: kept.fetchedAt,
    stale: kept.stale,
    source: forecastSource(
      [...kept.models, ...kept.swellModels, ...kept.peakModels].map((model) => model.id),
    ),
  };
}
