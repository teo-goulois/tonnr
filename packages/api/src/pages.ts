import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import { forecastSource } from "@repo/conditions/forecasts/wave-models";
import {
  type ForecastDay,
  type ForecastHour,
  hourOf,
  weekOf,
} from "@repo/conditions/forecasts/week";
import { shoreWind } from "@repo/conditions/shore-wind";
import { predictTideExtremes, predictTideTimeline } from "@repo/conditions/tides/tide-prediction";
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
import { breakContribution, GUIDE_LANGUAGES, GUIDE_TEXT_LINES } from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { type AnyColumn, and, desc, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { inBbox } from "./bbox";
import { Effect, Result } from "effect";

// What the public page of a surf break says, and which breaks a search engine is asked to list:
// decision 057. The rules read no clock and no database; the queries read the catalogue, the
// stations and what is kept, and ask no provider anything.

type Reader = Pick<Database, "select" | "selectDistinct">;
export type { Break };
type Point = { latitude: number; longitude: number };

export { hasPageSql, saidCharacteristics, STANDS_ALONE_AT, standsAlone, standsAloneSql };

export type GuideTextLine = (typeof GUIDE_TEXT_LINES)[number];
export type GuideLanguage = (typeof GUIDE_LANGUAGES)[number];

/**
 * The confirmed texts of a break's guide, the latest of each line in each language: what a page
 * shows of them, since a confirmed text is what lists a break that says little else.
 */
export async function confirmedTextsOf(db: Reader, breakId: string) {
  const rows = await db
    .select({
      line: breakContribution.line,
      language: breakContribution.language,
      value: breakContribution.value,
    })
    .from(breakContribution)
    .where(
      and(
        eq(breakContribution.breakId, breakId),
        eq(breakContribution.status, "confirmed"),
        inArray(breakContribution.line, [...GUIDE_TEXT_LINES]),
      ),
    )
    .orderBy(desc(breakContribution.confirmedAt), desc(breakContribution.id));
  const texts = new Map<string, { line: GuideTextLine; language: GuideLanguage; text: string }>();
  for (const row of rows) {
    if (typeof row.value !== "string" || row.language === null) continue;
    const key = `${row.line}:${row.language}`;
    if (!texts.has(key)) {
      texts.set(key, { line: row.line as GuideTextLine, language: row.language, text: row.value });
    }
  }
  return [...texts.values()];
}

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

// How far a row's point is from a point, near enough to order by: degrees on a flat earth,
// the short way round the antimeridian.
const awayFrom = (point: Point, table: { latitude: AnyColumn; longitude: AnyColumn }) =>
  sql`power(${table.latitude} - ${point.latitude}, 2) + power(
    (mod((${table.longitude} - ${point.longitude} + 540)::numeric, 360) - 180)
      * cos(radians(${point.latitude})),
    2
  )`;

/**
 * The box of so many kilometres around a point, as `inBbox` reads one: its longitudes widen
 * towards the poles, and wrap round the antimeridian.
 */
export function boxAround(point: Point, km: number): [number, number, number, number] {
  const degrees = km / 111;
  const across = degrees / Math.max(0.1, Math.cos((point.latitude * Math.PI) / 180));
  const wrap = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180;
  const south = Math.max(-90, point.latitude - degrees);
  const north = Math.min(90, point.latitude + degrees);
  if (across >= 180) return [-180, south, 180, north];
  return [wrap(point.longitude - across), south, wrap(point.longitude + across), north];
}

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
        inBbox(station.latitude, station.longitude, boxAround(point, withinKm)),
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
  const rows = await db
    .select({ row: surfBreak, listed: sql<boolean>`(${standsAloneSql} and ${hasPageSql})` })
    .from(surfBreak)
    .where(
      and(
        ne(surfBreak.id, found.id),
        hasPageSql,
        inBbox(surfBreak.latitude, surfBreak.longitude, boxAround(found, NEARBY_WITHIN_KM)),
      ),
    )
    // The listed ones first, so that none is left behind the nearest unlisted.
    .orderBy(sql`(${standsAloneSql} and ${hasPageSql}) desc`, awayFrom(found, surfBreak))
    .limit(NEARBY_MOST * 4);
  return rows
    .map(({ row, listed }) => ({ row, listed, distanceKm: distanceKm(found, row) }))
    .filter((near) => near.distanceKm <= NEARBY_WITHIN_KM)
    .sort((one, other) =>
      one.listed === other.listed ? one.distanceKm - other.distanceKm : one.listed ? -1 : 1,
    )
    .slice(0, NEARBY_MOST);
}

/**
 * The next tides at a point, from now for a day and a half unless so many hours are asked: the
 * highs and the lows to come.
 */
export function nextTides(point: Point, now: Date, hours = 36) {
  const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const next = predictTideExtremes({ ...point, start: now, end });
  if (!next) return null;
  // The height now, from the same prediction, and the way the tide goes: towards its next
  // extreme. Decision 059.
  const timeline = predictTideTimeline({
    ...point,
    start: now,
    end: new Date(now.getTime() + 60 * 1000),
    stepMinutes: 1,
  });
  const height = timeline?.timeline[0]?.heightMeters;
  const first = next.extremes[0];
  return {
    ...next,
    now:
      height === undefined || !first
        ? null
        : {
            heightMeters: height,
            trend: first.type === "high" ? ("rising" as const) : ("falling" as const),
          },
  };
}

export type Week = {
  days: ForecastDay[];
  /** The hour the moment falls in, for the sentence of the sea now: decision 059. */
  now: ForecastHour | null;
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
    now: hourOf(kept.hours, now),
    fetchedAt: kept.fetchedAt,
    stale: kept.stale,
    source: forecastSource(
      [...kept.models, ...kept.swellModels, ...kept.peakModels].map((model) => model.id),
      kept.producers,
    ),
  };
}

const HOUR_MS = 60 * 60 * 1000;

export type HoursAhead = {
  /** From the hour the moment falls in, which is the first, to so many hours after it. */
  hours: ForecastHour[];
  fetchedAt: Date;
  stale: boolean;
  source: ReturnType<typeof forecastSource>;
};

/**
 * The hours of the forecast kept for a point's cell, from the hour the moment falls in to so
 * many hours after it, from what is kept and from nothing else: null when none is kept, when
 * the point has no sea in it, or when what is kept holds none of those hours. Decision 074.
 */
export async function hoursAhead(
  forecasts: Pick<Forecasts, "kept">,
  point: Point,
  now: Date,
  hours: number,
): Promise<HoursAhead | null> {
  // What is kept is read to the end of the day after the days asked, counted from the start of
  // today in UTC: so many days reach the last hour from any hour of today.
  const result = await Effect.runPromise(
    Effect.result(forecasts.kept(point, Math.ceil(hours / 24))),
  );
  if (Result.isFailure(result)) return null;
  const kept = result.success;
  if (!kept || !kept.hours) return null;
  const from = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const until = from + hours * HOUR_MS;
  const ahead = kept.hours.filter(({ time }) => time.getTime() >= from && time.getTime() <= until);
  if (ahead.length === 0) return null;
  return {
    hours: ahead,
    fetchedAt: kept.fetchedAt,
    stale: kept.stale,
    source: forecastSource(
      [...kept.models, ...kept.swellModels, ...kept.peakModels].map((model) => model.id),
      kept.producers,
    ),
  };
}
