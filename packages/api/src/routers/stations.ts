import { ORPCError } from "@orpc/server";
import { reading, station } from "@repo/db/schema/buoys";
import { and, between, desc, eq, gte, lte, or } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 2;

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

// "west,south,east,north", the order GeoJSON uses.
const bboxSchema = z
  .string()
  .transform((value) => value.split(",").map(Number))
  .pipe(z.tuple([longitudeSchema, latitudeSchema, longitudeSchema, latitudeSchema]));

const readingSchema = z.object({
  observedAt: z.date(),
  significantHeightMeters: z.number().nullable(),
  maxHeightMeters: z.number().nullable(),
  peakPeriodSeconds: z.number().nullable(),
  meanPeriodSeconds: z.number().nullable(),
  significantPeriodSeconds: z.number().nullable(),
  peakDirectionDegrees: z.number().nullable(),
  directionalSpreadDegrees: z.number().nullable(),
  waterTemperatureCelsius: z.number().nullable(),
  windSpeedMetersPerSecond: z.number().nullable(),
  windGustMetersPerSecond: z.number().nullable(),
  windDirectionDegrees: z.number().nullable(),
  // False for a real-time value the provider has not quality-checked yet.
  validated: z.boolean(),
});

const stationSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  attribution: z.string(),
  // What the station has been seen to report.
  measures: z.array(z.enum(["waves", "wind"])),
  // Whether the open sea reaches the station. "sheltered" is a site in a harbour or an estuary,
  // whose waves say nothing of the sea outside. Null until rough days have told.
  exposure: z.enum(["open", "sheltered"]).nullable(),
  // commercialUse is null when the owner's terms have not been checked.
  license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean().nullable() }),
});

function describeStation(row: typeof station.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    attribution: row.attribution,
    measures: [
      ...(row.reportsWaves ? (["waves"] as const) : []),
      ...(row.reportsWind ? (["wind"] as const) : []),
    ],
    exposure: row.exposure,
    license: { type: row.licenseType, url: row.licenseUrl, commercialUse: row.commercialUse },
  };
}

function describeReading(row: typeof reading.$inferSelect) {
  return {
    observedAt: row.observedAt,
    significantHeightMeters: row.significantHeightM,
    maxHeightMeters: row.maxHeightM,
    peakPeriodSeconds: row.peakPeriodS,
    meanPeriodSeconds: row.meanPeriodS,
    significantPeriodSeconds: row.significantPeriodS,
    peakDirectionDegrees: row.peakDirectionDeg,
    directionalSpreadDegrees: row.directionalSpreadDeg,
    waterTemperatureCelsius: row.waterTemperatureC,
    windSpeedMetersPerSecond: row.windSpeedMs,
    windGustMetersPerSecond: row.windGustMs,
    windDirectionDegrees: row.windDirectionDeg,
    validated: row.validated,
  };
}

// A station's latest reading is the one observed at `latestObservedAt`.
const isLatestReading = and(
  eq(reading.stationId, station.id),
  eq(reading.observedAt, station.latestObservedAt),
);

export const stationsRouter = {
  list: publicProcedure
    .route({
      method: "GET",
      path: "/stations",
      summary: "Buoys with their latest reading",
      tags: ["Stations"],
    })
    .input(
      z.object({
        bbox: bboxSchema.optional(),
        provider: z.string().optional(),
        // Only the stations that report this.
        measures: z.enum(["waves", "wind"]).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      }),
    )
    .output(
      z.object({
        stations: z.array(stationSchema.extend({ latestReading: readingSchema.nullable() })),
      }),
    )
    .handler(async ({ input, context }) => {
      const [west, south, east, north] = input.bbox ?? [];
      const inBbox =
        west === undefined || south === undefined || east === undefined || north === undefined
          ? undefined
          : and(
              between(station.latitude, south, north),
              // A box that crosses the antimeridian has its west edge east of its east edge.
              west <= east
                ? between(station.longitude, west, east)
                : or(gte(station.longitude, west), lte(station.longitude, east)),
            );

      const rows = await context.db
        .select({ station, reading })
        .from(station)
        .leftJoin(reading, isLatestReading)
        .where(
          and(
            inBbox,
            input.provider ? eq(station.provider, input.provider) : undefined,
            input.measures === "waves" ? eq(station.reportsWaves, true) : undefined,
            input.measures === "wind" ? eq(station.reportsWind, true) : undefined,
          ),
        )
        .orderBy(station.id)
        .limit(input.limit);

      return {
        stations: rows.map((row) => ({
          ...describeStation(row.station),
          latestReading: row.reading ? describeReading(row.reading) : null,
        })),
      };
    }),

  get: publicProcedure
    .route({
      method: "GET",
      path: "/stations/{id}",
      summary: "One buoy with its latest reading",
      tags: ["Stations"],
    })
    .input(z.object({ id: z.string() }))
    .output(stationSchema.extend({ latestReading: readingSchema.nullable() }))
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select({ station, reading })
        .from(station)
        .leftJoin(reading, isLatestReading)
        .where(eq(station.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND", { message: `No station "${input.id}".` });

      return {
        ...describeStation(row.station),
        latestReading: row.reading ? describeReading(row.reading) : null,
      };
    }),

  readings: publicProcedure
    .route({
      method: "GET",
      path: "/stations/{id}/readings",
      summary: "A buoy's readings over a period, newest first",
      tags: ["Stations"],
    })
    .input(
      z.object({
        id: z.string(),
        // Defaults to the last two days.
        start: z.coerce.date().optional(),
        end: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(2000).default(500),
      }),
    )
    .output(z.object({ station: stationSchema, readings: z.array(readingSchema) }))
    .handler(async ({ input, context }) => {
      const [stationRow] = await context.db.select().from(station).where(eq(station.id, input.id));
      if (!stationRow) throw new ORPCError("NOT_FOUND", { message: `No station "${input.id}".` });

      const end = input.end ?? new Date();
      const start = input.start ?? new Date(end.getTime() - DEFAULT_HISTORY_DAYS * DAY_MS);
      const rows = await context.db
        .select()
        .from(reading)
        .where(and(eq(reading.stationId, input.id), between(reading.observedAt, start, end)))
        .orderBy(desc(reading.observedAt))
        .limit(input.limit);

      return { station: describeStation(stationRow), readings: rows.map(describeReading) };
    }),
};
