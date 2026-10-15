import { ORPCError } from "@orpc/server";
import { reading, station } from "@repo/db/schema/buoys";
import { and, between, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { bboxSchema, inBbox } from "../bbox";
import { callerProcedure, linkProcedure } from "../index";
import { spreadOut } from "../wind-places";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 2;
// The wind stations read to keep one for each place. More than the world holds today.
const MOST_WIND_STATIONS = 20_000;

export const readingSchema = z.object({
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

export const stationSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  attribution: z.string(),
  // What the station has been seen to report.
  measures: z.array(z.enum(["waves", "wind"])),
  exposure: z
    .enum(["open", "sheltered"])
    .nullable()
    .describe(
      "How the station's waves compare with those of the stations within 60 km on rough days. " +
        '"open": it has had at least half their height on two days. "sheltered": it stayed ' +
        "under a fifth of it on every rough day, as a site in a harbour or an estuary does. " +
        "Null when the days seen so far establish neither.",
    ),
  // commercialUse is null when the owner's terms have not been checked.
  license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean().nullable() }),
});

export function describeStation(row: typeof station.$inferSelect) {
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

export function describeReading(row: typeof reading.$inferSelect) {
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

const stationId = z
  .string()
  .describe('A station\'s `id`, as a list of stations gives it: "candhis-05602".');

// A station's latest reading is the one observed at `latestObservedAt`.
const isLatestReading = and(
  eq(reading.stationId, station.id),
  eq(reading.observedAt, station.latestObservedAt),
);

export const stationsRouter = {
  list: callerProcedure
    .meta({
      mcp: {
        name: "list_stations",
        title: "Buoys and wind stations in an area",
        description:
          "Buoys and wind stations with what each measured last: wave height, period and " +
          "direction, wind speed, gusts and direction, water temperature. Give `bbox` to " +
          "look around a place: a box of one degree around a spot is a good start, and a " +
          "wider one when it holds no station. `measures` keeps the stations that report " +
          "waves, or wind. `latestReading.observedAt` says when a station measured: a " +
          "reading of some hours ago is not the sea now. A station whose `exposure` is " +
          "`sheltered` sits in a harbour or an estuary and says little of the open coast. " +
          "Stations come in the order of their id, not by distance, and no page follows: " +
          "narrow the box rather than raise `limit`. Each one names its `attribution` and " +
          "its `license`. Next: get_station_readings for the hours before, get_forecast " +
          "for the hours ahead.",
        defaults: { limit: 25 },
      },
    })
    .route({
      method: "GET",
      path: "/stations",
      summary: "Buoys with their latest reading",
      tags: ["Stations"],
    })
    .input(
      z.object({
        bbox: bboxSchema.optional(),
        provider: z
          .string()
          .optional()
          .describe("Only the stations of one network, as a station's `provider` names it."),
        measures: z
          .enum(["waves", "wind"])
          .optional()
          .describe("Only the stations that report this."),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        places: z
          .enum(["all", "one"])
          .default("all")
          .describe(
            'With `measures=wind`, "one" keeps one station for each place: of the stations ' +
              "within 2 km of each other, the one that measured in the last two hours, then " +
              "the one that gives gusts, then the one that measures most often. When that " +
              "leaves more than `limit`, the stations are kept further apart, 4 km, then 8, " +
              "until they fit, so that they spread over the whole box. For a map.",
          ),
        prefer: z
          .enum(["sea"])
          .optional()
          .describe(
            'With `places=one`, "sea" puts the stations at sea or within 10 km of the shore ' +
              "before the others once they are kept further apart than 2 km, after those that " +
              "measured in the last two hours. A wide map then shows the wind of the coast, " +
              "and an inland area its own station where none by the sea stands near.",
          ),
      }),
    )
    .output(
      z.object({
        stations: z.array(stationSchema.extend({ latestReading: readingSchema.nullable() })),
        apartKm: z
          .number()
          .optional()
          .describe(
            "With `places=one`, the distance under which one station was kept: 2, or more " +
              "when the box held more places than `limit` and some were left out.",
          ),
        truncated: z
          .boolean()
          .optional()
          .describe(
            "With `places=one`, true when the box held more than 20,000 wind stations: the " +
              "first 20,000 by id were weighed, and the others left out. Narrow the box.",
          ),
      }),
    )
    .handler(async ({ input, context }) => {
      const onePerPlace = input.places === "one" && input.measures === "wind";
      const rows = await context.db
        .select({ station, reading })
        .from(station)
        .leftJoin(reading, isLatestReading)
        .where(
          and(
            inBbox(station.latitude, station.longitude, input.bbox),
            input.provider ? eq(station.provider, input.provider) : undefined,
            input.measures === "waves" ? eq(station.reportsWaves, true) : undefined,
            input.measures === "wind" ? eq(station.reportsWind, true) : undefined,
          ),
        )
        .orderBy(station.id)
        .limit(onePerPlace ? MOST_WIND_STATIONS + 1 : input.limit);

      const truncated = onePerPlace && rows.length > MOST_WIND_STATIONS;
      const spread = onePerPlace
        ? spreadOut(
            rows.slice(0, MOST_WIND_STATIONS).map((row) => ({
              ...row,
              id: row.station.id,
              provider: row.station.provider,
              latitude: row.station.latitude,
              longitude: row.station.longitude,
              measuredAt: row.reading?.windSpeedMs == null ? null : row.reading.observedAt,
              gust: row.reading?.windGustMs != null,
              shoreKm: row.station.shoreDistanceKm,
            })),
            new Date(),
            input.limit,
            { sea: input.prefer === "sea" },
          )
        : null;
      const shown = spread
        ? spread.stations.sort((one, other) => (one.id < other.id ? -1 : 1))
        : rows;

      return {
        ...(spread ? { apartKm: spread.apartKm, truncated } : {}),
        stations: shown.map((row) => ({
          ...describeStation(row.station),
          latestReading: row.reading ? describeReading(row.reading) : null,
        })),
      };
    }),

  get: callerProcedure
    .meta({
      mcp: {
        name: "get_station",
        title: "One buoy or wind station",
        description:
          "One station by its `id`, with what it measured last and when, its place, what " +
          "it reports, its `attribution` and its `license`. Next: get_station_readings for " +
          "its readings over a period.",
      },
    })
    .route({
      method: "GET",
      path: "/stations/{id}",
      summary: "One buoy with its latest reading",
      tags: ["Stations"],
    })
    .input(z.object({ id: stationId }))
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

  named: linkProcedure
    .route({
      method: "GET",
      path: "/stations/{id}/name",
      summary: "The name of a station, for a link to it",
      description:
        "Takes neither a key nor a session, even while the instance is closed to visitors: " +
        "the web app names a station this way where its short address is shown before it is " +
        "opened, in a message. It answers the name and nothing else.",
      tags: ["Stations"],
    })
    .input(z.object({ id: stationId }))
    .output(z.object({ name: z.string() }))
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select({ name: station.name })
        .from(station)
        .where(eq(station.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND", { message: `No station "${input.id}".` });
      return row;
    }),

  readings: callerProcedure
    .meta({
      mcp: {
        name: "get_station_readings",
        title: "What a station measured over a period",
        description:
          "A station's readings over a period, the newest first, with the station's " +
          "`attribution` and `license`. Without `start` and `end` it is the last two days. " +
          "Many buoys report every half hour, so the 48 readings asked for by default are " +
          "about a day: raise `limit`, to 2,000 at most, for a longer period, or give a " +
          "shorter one. `validated: false` marks a real-time value that its provider has " +
          "not checked yet. A buoy has nulls for the wind, and a wind station for the " +
          "waves. Use it to say how the sea or the wind changed, and compare it with " +
          "get_forecast at the station's place.",
        defaults: { limit: 48 },
      },
    })
    .route({
      method: "GET",
      path: "/stations/{id}/readings",
      summary: "A buoy's readings over a period, newest first",
      tags: ["Stations"],
    })
    .input(
      z.object({
        id: stationId,
        start: z.coerce
          .date()
          .optional()
          .describe("The start of the period, ISO 8601 in UTC. Two days before `end` if left out."),
        end: z.coerce
          .date()
          .optional()
          .describe("The end of the period, ISO 8601 in UTC. Now if left out."),
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
