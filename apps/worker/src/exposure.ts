import type { Database } from "@repo/db";
import { reading, station } from "@repo/db/schema/buoys";
import { and, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { Effect } from "effect";

import { StoreError } from "./store";

// A station inside a harbour or an estuary measures waves that say little of the water outside.
// Nothing a provider publishes tells such a site from a buoy at sea, but its waves do: on a
// rough day they stay far below those of the stations around it. The comparison is with the
// neighbours only: a buoy on a lake is open when it gets what the lake's other buoys get.

export type Exposure = "open" | "sheltered";
// What a window of days says of a station. "unclear" is a station seen on rough days that fit
// neither: not low enough every time to be sheltered, not high enough twice to be open.
export type Verdict = Exposure | "unclear";
export type Site = { id: string; latitude: number; longitude: number };
// A station's strong waves on a day: the height that a quarter of its readings reach.
export type DailyHeight = { stationId: string; day: string; heightM: number };

const WINDOW_DAYS = 30;
const NEIGHBOUR_KM = 60;
// Stations this close measure the same water: several sensors on one platform, or one buoy that
// two providers publish. They count as one place, and a station is not compared with its own.
const SAME_PLACE_KM = 2;
// A day counts for a station when it has readings in each of the day's four quarters.
const QUARTERS_PER_DAY = 4;
// A place had a rough day when its strong waves reached this.
const ROUGH_M = 1;
// A day tells something of a station when this many places around it had a rough one. Their
// median is what the station is compared with, so a neighbour that stays low never lowers it.
const MIN_ROUGH_PLACES = 3;

// A station is open when it had, on two rough days, half the waves of the places around it.
const OPEN_FROM = 0.5;
const MIN_OPEN_DAYS = 2;
// A station is sheltered when it stayed under a fifth of them on every rough day, three days at
// least, each seen among five places: with fewer, a low day may be the lee of a headland.
const SHELTERED_BELOW = 0.2;
const MIN_SHELTERED_DAYS = 3;
const MIN_ROUGH_PLACES_FOR_SHELTERED = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const EARTH_RADIUS_KM = 6371;

function distanceKm(from: Site, to: Site) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(to.latitude - from.latitude) / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(radians(to.longitude - from.longitude) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  const below = sorted[Math.floor(middle)] ?? Number.NaN;
  const above = sorted[Math.ceil(middle)] ?? below;
  return (below + above) / 2;
}

/**
 * Numbers the places. Stations within reach of each other, straight or through others, share
 * one, with or without readings, so that a place does not change with what was measured.
 */
function groupPlaces(sites: readonly Site[]) {
  const placeOf = new Map<string, number>();
  for (const [place, first] of sites.entries()) {
    if (placeOf.has(first.id)) continue;

    placeOf.set(first.id, place);
    const reached = [first];
    for (const from of reached) {
      for (const other of sites) {
        if (placeOf.has(other.id) || distanceKm(from, other) > SAME_PLACE_KM) continue;
        placeOf.set(other.id, place);
        reached.push(other);
      }
    }
  }
  return placeOf;
}

/**
 * Tells what the days say of each station: open, sheltered, or unclear. A station that no
 * rough day speaks for is left out: the days say nothing of it.
 */
export function classifyExposure(
  sites: readonly Site[],
  heights: readonly DailyHeight[],
): Map<string, Verdict> {
  const byStation = new Map<string, Map<string, number>>();
  for (const { stationId, day, heightM } of heights) {
    const days = byStation.get(stationId) ?? new Map<string, number>();
    days.set(day, heightM);
    byStation.set(stationId, days);
  }
  const placeOf = groupPlaces(sites);

  const verdicts = new Map<string, Verdict>();
  for (const site of sites) {
    const days = byStation.get(site.id);
    if (!days) continue;

    // The days of the stations within reach, place by place. A place counts through the
    // stations it has within reach, not through the others.
    const around = new Map<number, Map<string, number>[]>();
    for (const other of sites) {
      const place = placeOf.get(other.id);
      const otherDays = byStation.get(other.id);
      if (place === undefined || place === placeOf.get(site.id) || !otherDays) continue;
      if (distanceKm(site, other) > NEIGHBOUR_KM) continue;
      around.set(place, [...(around.get(place) ?? []), otherDays]);
    }

    let openDays = 0;
    let lowDays = 0;
    let hasDayNotLow = false;
    for (const [day, heightM] of days) {
      const rough = [...around.values()]
        .map((stations) =>
          stations.map((ofStation) => ofStation.get(day)).filter((value) => value !== undefined),
        )
        .filter((ofTheDay) => ofTheDay.length > 0)
        .map(median)
        .filter((value) => value >= ROUGH_M);
      if (rough.length < MIN_ROUGH_PLACES) continue;

      const share = heightM / median(rough);
      if (share >= OPEN_FROM) openDays += 1;
      if (share >= SHELTERED_BELOW) hasDayNotLow = true;
      else if (rough.length >= MIN_ROUGH_PLACES_FOR_SHELTERED) lowDays += 1;
    }

    if (openDays >= MIN_OPEN_DAYS) verdicts.set(site.id, "open");
    else if (hasDayNotLow) verdicts.set(site.id, "unclear");
    else if (lowDays >= MIN_SHELTERED_DAYS) verdicts.set(site.id, "sheltered");
  }
  return verdicts;
}

/**
 * What a station's exposure becomes, from what was known of it and what the days say. A label
 * holds while the days say nothing. One day that is not low is enough to doubt a sheltered
 * station, and an open one stays open until the days show it sheltered.
 */
export function nextExposure(known: Exposure | null, verdict: Verdict | undefined) {
  if (verdict === "open" || verdict === "sheltered") return verdict;
  if (verdict === "unclear" && known === "sheltered") return null;
  return known;
}

/** The whole UTC days before a moment, as many as the window holds. */
export function wholeDaysBefore(now: Date) {
  const until = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
  return { since: new Date(until.getTime() - WINDOW_DAYS * DAY_MS), until };
}

/**
 * Works out each wave station's exposure from the last thirty whole days and stores what
 * changed. Today is left out: its readings would speak for a few hours of it, and only for the
 * stations that report often.
 */
export const updateExposure = Effect.fn("updateExposure")(function* (
  db: Database,
  now: Date = new Date(),
) {
  const { since, until } = wholeDaysBefore(now);
  const day = sql<string>`to_char(${reading.observedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const quarter = sql`floor(extract(hour from ${reading.observedAt} at time zone 'UTC') / 6)`;

  return yield* Effect.tryPromise({
    try: async () => {
      const sites = await db
        .select({
          id: station.id,
          latitude: station.latitude,
          longitude: station.longitude,
          exposure: station.exposure,
          // As text: a date would lose the microseconds the comparison below needs.
          movedAt: sql<string | null>`${station.movedAt}::text`,
        })
        .from(station)
        .where(eq(station.reportsWaves, true));
      const heights = await db
        .select({
          stationId: reading.stationId,
          day,
          // A height the station measured, not one worked out between two: one high reading
          // among four must not make a day.
          heightM: sql<number>`percentile_disc(0.75) within group (order by ${reading.significantHeightM})`,
        })
        .from(reading)
        .innerJoin(station, eq(station.id, reading.stationId))
        .where(
          and(
            gte(reading.observedAt, since),
            lt(reading.observedAt, until),
            isNotNull(reading.significantHeightM),
            // Readings from before a station moved speak for another place.
            or(isNull(station.movedAt), gte(reading.observedAt, station.movedAt)),
          ),
        )
        .groupBy(reading.stationId, day)
        .having(sql`count(distinct ${quarter}) = ${QUARTERS_PER_DAY}`);

      const verdicts = classifyExposure(sites, heights);
      const changes = new Map<
        string,
        { exposure: Exposure | null; movedAt: string | null; stationIds: string[] }
      >();
      for (const site of sites) {
        const exposure = nextExposure(site.exposure, verdicts.get(site.id));
        if (exposure === site.exposure) continue;

        const key = `${exposure} ${site.movedAt}`;
        const change = changes.get(key) ?? { exposure, movedAt: site.movedAt, stationIds: [] };
        change.stationIds.push(site.id);
        changes.set(key, change);
      }

      const changed = await db.transaction(async (tx) => {
        let written = 0;
        for (const { exposure, movedAt, stationIds } of changes.values()) {
          const rows = await tx
            .update(station)
            .set({ exposure })
            .where(
              and(
                inArray(station.id, stationIds),
                // A station that moved since it was read is another place already.
                sql`${station.movedAt}::text is not distinct from ${movedAt}`,
              ),
            )
            .returning({ id: station.id });
          written += rows.length;
        }
        return written;
      });

      const known = await db
        .select({ exposure: station.exposure, stations: sql<number>`count(*)::int` })
        .from(station)
        .where(and(eq(station.reportsWaves, true), isNotNull(station.exposure)))
        .groupBy(station.exposure);
      const count = (exposure: Exposure) =>
        known.find((row) => row.exposure === exposure)?.stations ?? 0;

      return {
        stations: sites.length,
        open: count("open"),
        sheltered: count("sheltered"),
        changed,
      };
    },
    catch: (cause) => new StoreError({ provider: "exposure", cause }),
  });
});
