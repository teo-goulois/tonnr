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
// A day counts for a station when its readings fall in three of the day's four quarters.
const MIN_QUARTERS_PER_DAY = 3;
// A place had a rough day when its strong waves reached this.
const ROUGH_M = 1;
// A day tells something of a station when this many places around it had a rough one. Their
// median is what the station is compared with, so a sheltered neighbour never lowers it.
const MIN_ROUGH_PLACES = 3;

// A station is open once it has had, on two rough days, half the waves of the places around it.
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
  // In the order of their identifiers, so the places do not depend on the order of the sites.
  const measured = sites
    .filter((site) => byStation.has(site.id))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));

  // A place is the stations within reach of its first one.
  const places: { anchor: Site; members: Site[] }[] = [];
  const placeOf = new Map<string, number>();
  for (const site of measured) {
    let index = places.findIndex((place) => distanceKm(place.anchor, site) <= SAME_PLACE_KM);
    if (index === -1) index = places.push({ anchor: site, members: [] }) - 1;
    places[index]?.members.push(site);
    placeOf.set(site.id, index);
  }
  const placeDays = places.map(({ members }) => {
    const values = new Map<string, number[]>();
    for (const member of members) {
      for (const [day, heightM] of byStation.get(member.id) ?? []) {
        values.set(day, [...(values.get(day) ?? []), heightM]);
      }
    }
    return new Map([...values].map(([day, ofTheDay]) => [day, median(ofTheDay)]));
  });

  const verdicts = new Map<string, Verdict>();
  for (const site of measured) {
    const around = placeDays.filter(
      (_, index) =>
        index !== placeOf.get(site.id) &&
        distanceKm(site, places[index]?.anchor ?? site) <= NEIGHBOUR_KM,
    );

    let openDays = 0;
    let lowDays = 0;
    let hasDayNotLow = false;
    for (const [day, heightM] of byStation.get(site.id) ?? []) {
      const rough = around
        .map((days) => days.get(day))
        .filter((value) => value !== undefined)
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
 * What a station's exposure becomes, from what was known of it and what the days say. A station
 * seen in the open stays open: the days that showed it leave the window, the place does not
 * change. A sheltered station stays so until rough days say otherwise.
 */
export function nextExposure(known: Exposure | null, verdict: Verdict | undefined) {
  if (known === "open" || verdict === "open") return "open";
  if (verdict === "unclear") return null;
  if (verdict === "sheltered") return "sheltered";
  return known;
}

/**
 * Works out each wave station's exposure from the whole days of the last thirty and stores
 * what changed. A station the days say nothing of keeps what was known of it.
 */
export const updateExposure = Effect.fn("updateExposure")(function* (
  db: Database,
  now: Date = new Date(),
) {
  // Whole UTC days: today's readings would speak for a few hours of it, and only for the
  // stations that report often.
  const until = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
  const since = new Date(until.getTime() - WINDOW_DAYS * DAY_MS);
  const day = sql<string>`to_char(${reading.observedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const quarter = sql`floor(extract(hour from ${reading.observedAt} at time zone 'UTC') / 6)`;

  return yield* Effect.tryPromise({
    try: async () => {
      const startedAt = new Date();
      const sites = await db
        .select({
          id: station.id,
          latitude: station.latitude,
          longitude: station.longitude,
          exposure: station.exposure,
        })
        .from(station)
        .where(eq(station.reportsWaves, true));
      const heights = await db
        .select({
          stationId: reading.stationId,
          day,
          heightM: sql<number>`percentile_cont(0.75) within group (order by ${reading.significantHeightM})`,
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
        .having(sql`count(distinct ${quarter}) >= ${MIN_QUARTERS_PER_DAY}`);

      const verdicts = classifyExposure(sites, heights);
      const counts = { open: 0, sheltered: 0, changed: 0 };
      const changes = new Map<Exposure | null, string[]>();
      for (const site of sites) {
        const exposure = nextExposure(site.exposure, verdicts.get(site.id));
        if (exposure) counts[exposure] += 1;
        if (exposure === site.exposure) continue;
        counts.changed += 1;
        changes.set(exposure, [...(changes.get(exposure) ?? []), site.id]);
      }

      await db.transaction(async (tx) => {
        for (const [exposure, stationIds] of changes) {
          await tx
            .update(station)
            .set({ exposure })
            .where(
              and(
                inArray(station.id, stationIds),
                // A station that moved while this ran is another place already.
                or(isNull(station.movedAt), lt(station.movedAt, startedAt)),
              ),
            );
        }
      });

      return { stations: sites.length, ...counts };
    },
    catch: (cause) => new StoreError({ provider: "exposure", cause }),
  });
});
