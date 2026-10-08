import type { Database } from "@repo/db";
import { reading, station } from "@repo/db/schema/buoys";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { Effect } from "effect";

import { StoreError } from "./store";

// A station inside a harbour or an estuary measures waves that say nothing of the sea outside.
// Nothing a provider publishes tells such a site from a buoy at sea, but its waves do: on a
// rough day they stay far below those of the stations around it.

export type Exposure = "open" | "sheltered";
export type Site = { id: string; latitude: number; longitude: number };
// A station's strong waves on a day: the height that nine of its readings in ten stay under.
export type DailyHeight = { stationId: string; day: string; heightM: number };

const WINDOW_DAYS = 30;
const NEIGHBOUR_KM = 60;
// A day counts for a station when it has enough readings to speak for the day.
const MIN_READINGS_PER_DAY = 6;
// A day is rough for a station when the strong waves of three neighbours in four reach this.
const ROUGH_M = 1;

// A station is sheltered when, on every rough day, its waves stay under a fifth of its
// neighbours'. A buoy on an open coast can be in the lee of the land for one swell, so only a
// station with many neighbours is called sheltered: with few, a low day proves little.
const SHELTERED_BELOW = 0.2;
const MIN_NEIGHBOURS_FOR_SHELTERED = 10;
// One rough day at half its neighbours' waves is enough to call a station open.
const OPEN_FROM = 0.5;
const MIN_NEIGHBOURS_FOR_OPEN = 3;

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

/** The value that three quarters of the values stay under. */
function upperQuartile(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const position = (sorted.length - 1) * 0.75;
  const below = sorted[Math.floor(position)] ?? Number.NaN;
  const above = sorted[Math.ceil(position)] ?? below;
  return below + (above - below) * (position - Math.floor(position));
}

/**
 * Tells which stations the open sea reaches, from each station's strong waves day by day. A
 * station with no rough day around it, or with too few neighbours, is left out: nothing is
 * known of it yet.
 */
export function classifyExposure(
  sites: readonly Site[],
  heights: readonly DailyHeight[],
): Map<string, Exposure> {
  const byStation = new Map<string, Map<string, number>>();
  for (const { stationId, day, heightM } of heights) {
    const days = byStation.get(stationId) ?? new Map<string, number>();
    days.set(day, heightM);
    byStation.set(stationId, days);
  }
  const measured = sites.filter((site) => byStation.has(site.id));

  const exposures = new Map<string, Exposure>();
  for (const site of measured) {
    const neighbours = measured.filter(
      (other) => other.id !== site.id && distanceKm(site, other) <= NEIGHBOUR_KM,
    );

    let isOpen = false;
    let roughDays = 0;
    let lowDaysAmongMany = 0;
    for (const [day, heightM] of byStation.get(site.id) ?? []) {
      const around = neighbours
        .map((neighbour) => byStation.get(neighbour.id)?.get(day))
        .filter((value) => value !== undefined);
      if (around.length < MIN_NEIGHBOURS_FOR_OPEN) continue;
      const reference = upperQuartile(around);
      if (reference < ROUGH_M) continue;

      roughDays += 1;
      const share = heightM / reference;
      if (share >= OPEN_FROM) isOpen = true;
      if (share < SHELTERED_BELOW && around.length >= MIN_NEIGHBOURS_FOR_SHELTERED) {
        lowDaysAmongMany += 1;
      }
    }

    if (isOpen) exposures.set(site.id, "open");
    // Every rough day was a low one, seen among many neighbours.
    else if (roughDays > 0 && lowDaysAmongMany === roughDays) exposures.set(site.id, "sheltered");
  }
  return exposures;
}

/**
 * Works out each wave station's exposure from the readings of the last thirty days and stores
 * what it found. A station it can say nothing of keeps what was known of it.
 */
export const updateExposure = Effect.fn("updateExposure")(function* (db: Database) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const day = sql<string>`to_char(${reading.observedAt} at time zone 'UTC', 'YYYY-MM-DD')`;

  return yield* Effect.tryPromise({
    try: async () => {
      const sites = await db
        .select({ id: station.id, latitude: station.latitude, longitude: station.longitude })
        .from(station)
        .where(eq(station.reportsWaves, true));
      const heights = await db
        .select({
          stationId: reading.stationId,
          day,
          heightM: sql<number>`percentile_cont(0.9) within group (order by ${reading.significantHeightM})`,
        })
        .from(reading)
        .where(and(gte(reading.observedAt, since), isNotNull(reading.significantHeightM)))
        .groupBy(reading.stationId, day)
        .having(sql`count(*) >= ${MIN_READINGS_PER_DAY}`);

      const exposures = classifyExposure(sites, heights);
      const counts = { open: 0, sheltered: 0 };
      await db.transaction(async (tx) => {
        for (const [id, exposure] of exposures) {
          await tx.update(station).set({ exposure }).where(eq(station.id, id));
          counts[exposure] += 1;
        }
      });
      return { stations: sites.length, ...counts };
    },
    catch: (cause) => new StoreError({ provider: "exposure", cause }),
  });
});
