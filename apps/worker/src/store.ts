import type { Database } from "@repo/db";
import { reading, station } from "@repo/db/schema/buoys";
import { and, isNull, lt, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import { cleanText } from "./clean-text";
import type { Snapshot } from "./providers/provider";

export class StoreError extends Schema.TaggedError<StoreError>()("StoreError", {
  provider: Schema.String,
  cause: Schema.Defect(),
}) {}

export function stationId(provider: string, providerStationId: string) {
  return `${provider}-${providerStationId.toLowerCase()}`;
}

/**
 * Writes a snapshot. Running it twice with the same snapshot changes nothing the second time:
 * stations are upserted and a reading that already exists is left alone.
 *
 * When the database refuses the snapshot, each station is saved on its own, so one value it
 * cannot store does not block the others.
 */
export const saveSnapshot = Effect.fn("saveSnapshot")(function* (
  db: Database,
  provider: string,
  snapshot: Snapshot,
) {
  if (snapshot.stations.length === 0) return { stations: 0, newReadings: 0, failedStations: 0 };

  const latestByStation = new Map<string, Date>();
  for (const { providerStationId, observedAt } of snapshot.readings) {
    const latest = latestByStation.get(providerStationId);
    if (!latest || observedAt > latest) latestByStation.set(providerStationId, observedAt);
  }

  const withWaves = new Set<string>();
  const withWind = new Set<string>();
  for (const { providerStationId, significantHeightM, windSpeedMs } of snapshot.readings) {
    if (significantHeightM != null) withWaves.add(providerStationId);
    if (windSpeedMs != null) withWind.add(providerStationId);
  }

  const stationRows = snapshot.stations.map((input) => ({
    ...input,
    name: cleanText(input.name),
    attribution: cleanText(input.attribution),
    id: stationId(provider, input.providerStationId),
    provider,
    latestObservedAt: latestByStation.get(input.providerStationId) ?? null,
    reportsWaves: withWaves.has(input.providerStationId),
    reportsWind: withWind.has(input.providerStationId),
  }));
  const readingRows = snapshot.readings.map(({ providerStationId, ...measurements }) => ({
    ...measurements,
    stationId: stationId(provider, providerStationId),
  }));

  type StationRow = (typeof stationRows)[number];
  type ReadingRow = (typeof readingRows)[number];

  const save = (stations: StationRow[], readings: ReadingRow[]) =>
    db.transaction(async (tx) => {
      await tx
        .insert(station)
        .values(stations)
        .onConflictDoUpdate({
          target: station.id,
          set: {
            name: sql`excluded.name`,
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            licenseType: sql`excluded.license_type`,
            licenseUrl: sql`excluded.license_url`,
            attribution: sql`excluded.attribution`,
            commercialUse: sql`excluded.commercial_use`,
            reportsWaves: sql`${station.reportsWaves} or excluded.reports_waves`,
            reportsWind: sql`${station.reportsWind} or excluded.reports_wind`,
            latestObservedAt: sql`greatest(${station.latestObservedAt}, excluded.latest_observed_at)`,
            updatedAt: sql`now()`,
          },
        });

      const inserted =
        readings.length === 0
          ? []
          : await tx
              .insert(reading)
              .values(readings)
              .onConflictDoNothing()
              .returning({ stationId: reading.stationId });

      return inserted.length;
    });

  return yield* Effect.tryPromise({
    try: async () => {
      try {
        const newReadings = await save(stationRows, readingRows);
        return { stations: stationRows.length, newReadings, failedStations: 0 };
      } catch (error) {
        const saved = { stations: 0, newReadings: 0, failedStations: 0 };
        for (const stationRow of stationRows) {
          try {
            saved.newReadings += await save(
              [stationRow],
              readingRows.filter((row) => row.stationId === stationRow.id),
            );
            saved.stations += 1;
          } catch {
            saved.failedStations += 1;
          }
        }
        // Nothing could be saved: the database itself is the problem.
        if (saved.stations === 0) throw error;
        return saved;
      }
    },
    catch: (cause) => new StoreError({ provider, cause }),
  });
});

const WIND_ONLY_DAYS = 7;

/**
 * Deletes readings without a wave height once they are a week old. Wind stations report every
 * few minutes, and their history is only worth keeping once someone asks for it.
 */
export const pruneReadings = Effect.fn("pruneReadings")(function* (db: Database) {
  const cutoff = new Date(Date.now() - WIND_ONLY_DAYS * 24 * 60 * 60 * 1000);

  return yield* Effect.tryPromise({
    try: async () => {
      const deleted = await db
        .delete(reading)
        .where(and(isNull(reading.significantHeightM), lt(reading.observedAt, cutoff)))
        .returning({ stationId: reading.stationId });
      return deleted.length;
    },
    catch: (cause) => new StoreError({ provider: "prune", cause }),
  });
});
