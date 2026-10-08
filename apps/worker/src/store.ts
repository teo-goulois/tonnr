import type { Database } from "@repo/db";
import { reading, station } from "@repo/db/schema/buoys";
import { sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

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
 */
export const saveSnapshot = Effect.fn("saveSnapshot")(function* (
  db: Database,
  provider: string,
  snapshot: Snapshot,
) {
  if (snapshot.stations.length === 0) return { stations: 0, newReadings: 0 };

  const latestByStation = new Map<string, Date>();
  for (const { providerStationId, observedAt } of snapshot.readings) {
    const latest = latestByStation.get(providerStationId);
    if (!latest || observedAt > latest) latestByStation.set(providerStationId, observedAt);
  }

  const stationRows = snapshot.stations.map((input) => ({
    ...input,
    id: stationId(provider, input.providerStationId),
    provider,
    latestObservedAt: latestByStation.get(input.providerStationId) ?? null,
  }));
  const readingRows = snapshot.readings.map(({ providerStationId, ...measurements }) => ({
    ...measurements,
    stationId: stationId(provider, providerStationId),
  }));

  return yield* Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        await tx
          .insert(station)
          .values(stationRows)
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
              latestObservedAt: sql`greatest(${station.latestObservedAt}, excluded.latest_observed_at)`,
              updatedAt: sql`now()`,
            },
          });

        const inserted =
          readingRows.length === 0
            ? []
            : await tx
                .insert(reading)
                .values(readingRows)
                .onConflictDoNothing()
                .returning({ stationId: reading.stationId });

        return { stations: stationRows.length, newReadings: inserted.length };
      }),
    catch: (cause) => new StoreError({ provider, cause }),
  });
});
