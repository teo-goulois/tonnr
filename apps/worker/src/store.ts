import type { Database } from "@repo/db";
import { reading, station } from "@repo/db/schema/buoys";
import { and, inArray, isNull, lt, sql } from "drizzle-orm";
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

// The measurements a reading can hold, as fields of a reading and as columns of the table.
const MEASUREMENT_FIELDS = [
  "significantHeightM",
  "maxHeightM",
  "peakPeriodS",
  "meanPeriodS",
  "significantPeriodS",
  "peakDirectionDeg",
  "directionalSpreadDeg",
  "waterTemperatureC",
  "windSpeedMs",
  "windGustMs",
  "windDirectionDeg",
] as const;
const MEASUREMENTS = [
  reading.significantHeightM,
  reading.maxHeightM,
  reading.peakPeriodS,
  reading.meanPeriodS,
  reading.significantPeriodS,
  reading.peakDirectionDeg,
  reading.directionalSpreadDeg,
  reading.waterTemperatureC,
  reading.windSpeedMs,
  reading.windGustMs,
  reading.windDirectionDeg,
];

// A moored buoy swings a few hundred metres around its anchor, a few kilometres in deep water.
// A station seen farther than this from where it was is another site.
const MOVED_KM = 5;
const KM_PER_DEGREE = 111.2;
// The shorter way round, so that crossing the 180th meridian is not a move.
const eastward = sql`(${station.longitude} - excluded.longitude - 360 * round((${station.longitude} - excluded.longitude) / 360))`;
const hasMoved = sql`(${KM_PER_DEGREE} * sqrt(power(${station.latitude} - excluded.latitude, 2) + power(${eastward} * cos(radians(${station.latitude})), 2)) > ${MOVED_KM})`;

// How many readings one statement writes. A reading takes up to fourteen parameters, and
// Postgres accepts 65,535 in a statement.
const READINGS_PER_STATEMENT = 2000;

type ReadingInput = Snapshot["readings"][number];

/**
 * Makes one reading of the readings a snapshot gives for the same station and moment, by the
 * rule the database follows: a value that is there stays, and a value that is missing is taken
 * from the next reading that has it. The result is validated only when every reading it took a
 * value from was.
 */
export function mergeReadings(readings: readonly ReadingInput[]): ReadingInput[] {
  const merged = new Map<string, ReadingInput>();

  for (const next of readings) {
    const key = `${next.providerStationId} ${next.observedAt.getTime()}`;
    const first = merged.get(key);
    if (!first) {
      merged.set(key, { ...next });
      continue;
    }

    let hasTaken = false;
    for (const field of MEASUREMENT_FIELDS) {
      if (first[field] == null && next[field] != null) {
        first[field] = next[field];
        hasTaken = true;
      }
    }
    // A reading that brings nothing changes nothing, its validated mark included.
    if (hasTaken) first.validated = (first.validated ?? false) && (next.validated ?? false);
  }

  return [...merged.values()];
}

/** The value a reading already has for a measurement, or else the one the snapshot brings. */
function keptOrBrought(column: (typeof MEASUREMENTS)[number]) {
  return sql`coalesce(${column}, ${sql.raw(`excluded.${column.name}`)})`;
}

/**
 * Writes a snapshot. Running it twice with the same snapshot changes nothing the second time.
 * Stations are upserted. A reading that already exists keeps every value it has and takes the
 * ones it lacked: a provider may publish a moment's height before its period.
 *
 * When the database refuses the snapshot, each station is saved on its own, so one value it
 * cannot store does not block the others.
 */
export const saveSnapshot = Effect.fn("saveSnapshot")(function* (
  db: Database,
  provider: string,
  snapshot: Snapshot,
) {
  if (snapshot.stations.length === 0) {
    return { stations: 0, newReadings: 0, completedReadings: 0, failedStations: 0 };
  }

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

  const toRow = ({ providerStationId, ...measurements }: Snapshot["readings"][number]) => ({
    ...measurements,
    stationId: stationId(provider, providerStationId),
  });

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
  // One row per station and moment: the database refuses to complete a row twice in a statement.
  const readingRows = mergeReadings(snapshot.readings).map(toRow);

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
            // What was known of a station's exposure was known of the place it has left.
            exposure: sql`case when ${hasMoved} then null else ${station.exposure} end`,
            movedAt: sql`case when ${hasMoved} then now() else ${station.movedAt} end`,
            updatedAt: sql`now()`,
          },
        });

      const written: { isNew: boolean }[] = [];
      for (let start = 0; start < readings.length; start += READINGS_PER_STATEMENT) {
        written.push(
          ...(await tx
            .insert(reading)
            .values(readings.slice(start, start + READINGS_PER_STATEMENT))
            .onConflictDoUpdate({
              target: [reading.stationId, reading.observedAt],
              set: {
                significantHeightM: keptOrBrought(reading.significantHeightM),
                maxHeightM: keptOrBrought(reading.maxHeightM),
                peakPeriodS: keptOrBrought(reading.peakPeriodS),
                meanPeriodS: keptOrBrought(reading.meanPeriodS),
                significantPeriodS: keptOrBrought(reading.significantPeriodS),
                peakDirectionDeg: keptOrBrought(reading.peakDirectionDeg),
                directionalSpreadDeg: keptOrBrought(reading.directionalSpreadDeg),
                waterTemperatureC: keptOrBrought(reading.waterTemperatureC),
                windSpeedMs: keptOrBrought(reading.windSpeedMs),
                windGustMs: keptOrBrought(reading.windGustMs),
                windDirectionDeg: keptOrBrought(reading.windDirectionDeg),
                // A reading that takes a value from a snapshot that is not validated is not
                // validated any more.
                validated: sql`${reading.validated} and excluded.validated`,
              },
              // Only a reading that lacks a value the snapshot brings is touched.
              setWhere: sql.join(
                MEASUREMENTS.map(
                  (column) =>
                    sql`(${column} is null and ${sql.raw(`excluded.${column.name}`)} is not null)`,
                ),
                sql` or `,
              ),
            })
            // A row that was just inserted had no earlier version.
            .returning({ isNew: sql<boolean>`(old.station_id is null)` })),
        );
      }

      const newReadings = written.filter((row) => row.isNew).length;
      return { newReadings, completedReadings: written.length - newReadings };
    });

  return yield* Effect.tryPromise({
    try: async () => {
      try {
        const written = await save(stationRows, readingRows);
        return { stations: stationRows.length, ...written, failedStations: 0 };
      } catch (error) {
        const saved = { stations: 0, newReadings: 0, completedReadings: 0, failedStations: 0 };
        for (const stationRow of stationRows) {
          try {
            const written = await save(
              [stationRow],
              readingRows.filter((row) => row.stationId === stationRow.id),
            );
            saved.newReadings += written.newReadings;
            saved.completedReadings += written.completedReadings;
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
    try: () =>
      db.transaction(async (tx) => {
        const deleted = await tx
          .delete(reading)
          .where(and(isNull(reading.significantHeightM), lt(reading.observedAt, cutoff)))
          .returning({ stationId: reading.stationId });

        // A station whose latest reading was deleted points at the latest one it still has.
        const stationIds = [...new Set(deleted.map((row) => row.stationId))];
        if (stationIds.length > 0) {
          await tx
            .update(station)
            .set({
              latestObservedAt: sql`(select max(${reading.observedAt}) from ${reading} where ${reading.stationId} = ${station.id})`,
            })
            .where(inArray(station.id, stationIds));
        }
        return deleted.length;
      }),
    catch: (cause) => new StoreError({ provider: "prune", cause }),
  });
});
