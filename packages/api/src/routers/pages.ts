import { ORPCError } from "@orpc/server";
import { SHORE_WINDS } from "@repo/conditions/shore-wind";
import { breakAtAddress, pathOf } from "@repo/db/addresses";
import { GUIDE_LANGUAGES, GUIDE_TEXT_LINES } from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";

import { confirmedWordsOf } from "../guides";
import { callerProcedure } from "../index";
import {
  confirmedTextsOf,
  hasPageSql,
  nearbyBreaks,
  nearestStation,
  nextTides,
  standsAlone,
  standsAloneSql,
  weekAt,
  windAtShore,
} from "../pages";
import { breakSchema, describeBreak } from "./breaks";
import { forecastSourceSchema } from "./forecasts";
import { describeReading, describeStation, readingSchema, stationSchema } from "./stations";
import { tideStationSchema } from "./tides";

// What the public pages of the web app say of the catalogue, each in one call: the page of a
// break, the hubs of its country and its region, and the addresses a sitemap names. Everything
// here is public already, and nothing asks a provider anything: decision 057.

const slug = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9-]+$/, "a slug is small letters, digits and dashes");

const addressSchema = z.object({ country: slug, region: slug, slug });

const measurement = z.number().nullable();

const dayOfWeekSchema = z.object({
  day: z.string(),
  hours: z.number(),
  wave: z
    .object({
      time: z.date(),
      heightMeters: z.number(),
      peakPeriodSeconds: measurement,
      directionDegrees: measurement,
      primarySwellHeightMeters: measurement,
      primarySwellDirectionDegrees: measurement,
    })
    .nullable(),
  wind: z
    .object({
      time: z.date(),
      speedMetersPerSecond: z.number(),
      gustMetersPerSecond: measurement,
      directionDegrees: measurement,
    })
    .nullable(),
  airTemperatureCelsius: measurement,
  cloudCoverPercent: measurement,
  precipitationMillimeters: measurement,
});

const nearStationSchema = stationSchema.extend({
  latestReading: readingSchema,
  distanceKm: z.number(),
});

const pageSchema = z.object({
  moved: z.literal(false),
  break: breakSchema,
  // Whether a search engine is asked to list the page: the break stands on its own.
  listed: z.boolean(),
  // The places the break lies in, each with the address of its hub when it has one.
  places: z.array(z.object({ name: z.string(), page: z.string().nullable() })),
  // The sea now: the nearest buoy and the nearest wind station that measured within a day.
  waves: nearStationSchema.nullable(),
  wind: nearStationSchema
    .extend({
      // How the wind meets the shore, where the break knows its offshore direction.
      atShore: z.enum(SHORE_WINDS).nullable(),
    })
    .nullable(),
  // The next highs and lows, from now for a day and a half. Null far from any tide station.
  tide: z
    .object({
      station: tideStationSchema,
      datum: z.string(),
      extremes: z.array(
        z.object({
          time: z.date(),
          type: z.enum(["high", "low"]),
          heightMeters: z.number(),
        }),
      ),
    })
    .nullable(),
  // The week, from the forecast kept for the break's cell. Null when none is kept, or when the
  // point has no sea in it: the page then says that the forecast is on the map.
  week: z
    .object({
      days: z.array(dayOfWeekSchema),
      fetchedAt: z.date(),
      stale: z.boolean(),
      source: forecastSourceSchema,
    })
    .nullable(),
  // The confirmed texts of the break's guide, the latest of each line in each language: what
  // lists a break that says little else, and what the page shows of it.
  texts: z.array(
    z.object({
      line: z.enum(GUIDE_TEXT_LINES),
      language: z.enum(GUIDE_LANGUAGES),
      text: z.string(),
    }),
  ),
  // The breaks within 50 km, the listed ones first, eight at most.
  nearby: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      page: z.string(),
      distanceKm: z.number(),
      listed: z.boolean(),
      characteristics: breakSchema.shape.characteristics,
    }),
  ),
});

const movedSchema = z.object({
  moved: z.literal(true),
  // Where the page is now: the break the address was merged into.
  to: addressSchema,
  page: z.string(),
});

/** What a hub lists of a break: enough for a line. */
const listedBreakSchema = z.object({
  id: z.string(),
  name: z.string(),
  page: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  characteristics: breakSchema.shape.characteristics,
});

const addressOf = (row: typeof surfBreak.$inferSelect) => ({
  country: row.countrySlug!,
  region: row.regionSlug!,
  slug: row.slug,
});

function noPage() {
  return new ORPCError("NOT_FOUND", { message: "No page at this address." });
}

// The listed breaks under some places, by name.
const listedBreaks = (db: Parameters<typeof confirmedTextsOf>[0], where: ReturnType<typeof and>) =>
  db
    .select()
    .from(surfBreak)
    .where(and(where, hasPageSql, standsAloneSql))
    .orderBy(asc(surfBreak.name), asc(surfBreak.id));

export const pagesRouter = {
  break: callerProcedure
    .route({
      method: "GET",
      path: "/pages/breaks/{country}/{region}/{slug}",
      summary: "What the public page of a surf break says",
      description:
        "The break with its guide's confirmed words laid over, whether a search engine is asked " +
        "to list it, the nearest buoy and wind station with their latest reading, the next tides, " +
        "the week from the forecast the instance keeps for its cell, and the breaks nearby. An " +
        "address of a break that was merged into another answers `moved: true` with the address " +
        "to go to. Nothing here asks the forecast provider: a week is answered only from what " +
        "is kept.",
      tags: ["Pages"],
    })
    .input(addressSchema)
    .output(z.discriminatedUnion("moved", [pageSchema, movedSchema]))
    .handler(async ({ input, context }) => {
      const address = {
        countrySlug: input.country,
        regionSlug: input.region,
        slug: input.slug,
      };
      const found = await breakAtAddress(context.db, address);
      if (!found) throw noPage();
      if (found.moved) {
        // The address leads to a break that has no page of its own: a break with no places.
        const page = pathOf(found.row);
        if (!page) throw noPage();
        return { moved: true as const, to: addressOf(found.row), page };
      }
      const row = found.row;
      const now = new Date();
      const [confirmed, texts, waves, wind, nearby, week] = await Promise.all([
        confirmedWordsOf(context.db, [row.id]),
        confirmedTextsOf(context.db, row.id),
        nearestStation(context.db, row, "waves", now),
        nearestStation(context.db, row, "wind", now),
        nearbyBreaks(context.db, row),
        weekAt(context.forecasts, row, now),
      ]);
      const described = describeBreak(row, confirmed.get(row.id));
      const places = (row.location ?? []).map((name, index) => ({
        name,
        page:
          index === 0
            ? `/spots/${row.countrySlug}`
            : index === 1
              ? `/spots/${row.countrySlug}/${row.regionSlug}`
              : null,
      }));
      return {
        moved: false as const,
        break: described,
        listed: standsAlone(row, { hasText: texts.length > 0 }),
        texts,
        places,
        waves: waves && {
          ...describeStation(waves.station),
          latestReading: describeReading(waves.reading),
          distanceKm: Math.round(waves.distanceKm * 10) / 10,
        },
        wind: wind && {
          ...describeStation(wind.station),
          latestReading: describeReading(wind.reading),
          distanceKm: Math.round(wind.distanceKm * 10) / 10,
          atShore: windAtShore(
            wind.reading.windDirectionDeg,
            described.characteristics.offshoreDirectionDegrees,
          ),
        },
        tide: nextTides(row, now),
        week,
        nearby: nearby.map(({ row: near, listed, distanceKm }) => ({
          id: near.id,
          name: near.name,
          page: pathOf(near)!,
          distanceKm: Math.round(distanceKm * 10) / 10,
          listed,
          characteristics: describeBreak(near).characteristics,
        })),
      };
    }),

  countries: callerProcedure
    .route({
      method: "GET",
      path: "/pages/places",
      summary: "The countries that have listed surf breaks",
      tags: ["Pages"],
    })
    .output(
      z.object({
        countries: z.array(
          z.object({ country: slug, name: z.string(), page: z.string(), listed: z.number() }),
        ),
      }),
    )
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          country: surfBreak.countrySlug,
          name: sql<string>`min(${surfBreak.location}[1])`,
          listed: sql<number>`count(*)::int`,
        })
        .from(surfBreak)
        .where(and(hasPageSql, standsAloneSql))
        .groupBy(surfBreak.countrySlug)
        .orderBy(sql`min(${surfBreak.location}[1])`);
      return {
        countries: rows.map((row) => ({
          country: row.country!,
          name: row.name,
          page: `/spots/${row.country}`,
          listed: row.listed,
        })),
      };
    }),

  country: callerProcedure
    .route({
      method: "GET",
      path: "/pages/places/{country}",
      summary: "The regions of a country that have listed surf breaks",
      tags: ["Pages"],
    })
    .input(z.object({ country: slug }))
    .output(
      z.object({
        name: z.string(),
        regions: z.array(
          z.object({ region: slug, name: z.string(), page: z.string(), listed: z.number() }),
        ),
        listed: z.number(),
      }),
    )
    .handler(async ({ input, context }) => {
      const rows = await context.db
        .select({
          region: surfBreak.regionSlug,
          name: sql<string>`min(coalesce(${surfBreak.location}[2], ${surfBreak.location}[1]))`,
          country: sql<string>`min(${surfBreak.location}[1])`,
          listed: sql<number>`count(*)::int`,
        })
        .from(surfBreak)
        .where(and(eq(surfBreak.countrySlug, input.country), hasPageSql, standsAloneSql))
        .groupBy(surfBreak.regionSlug)
        .orderBy(sql`min(coalesce(${surfBreak.location}[2], ${surfBreak.location}[1]))`);
      if (rows.length === 0) throw noPage();
      return {
        name: rows[0]!.country,
        regions: rows.map((row) => ({
          region: row.region!,
          name: row.name,
          page: `/spots/${input.country}/${row.region}`,
          listed: row.listed,
        })),
        listed: rows.reduce((sum, row) => sum + row.listed, 0),
      };
    }),

  region: callerProcedure
    .route({
      method: "GET",
      path: "/pages/places/{country}/{region}",
      summary: "The listed surf breaks of a region",
      tags: ["Pages"],
    })
    .input(z.object({ country: slug, region: slug }))
    .output(
      z.object({
        name: z.string(),
        country: z.object({ name: z.string(), page: z.string() }),
        breaks: z.array(listedBreakSchema),
      }),
    )
    .handler(async ({ input, context }) => {
      const rows = await listedBreaks(
        context.db,
        and(eq(surfBreak.countrySlug, input.country), eq(surfBreak.regionSlug, input.region)),
      );
      if (rows.length === 0) throw noPage();
      const confirmed = await confirmedWordsOf(
        context.db,
        rows.map((row) => row.id),
      );
      const first = rows[0]!;
      return {
        name: first.location?.[1] ?? first.location?.[0] ?? input.region,
        country: { name: first.location?.[0] ?? input.country, page: `/spots/${input.country}` },
        breaks: rows.map((row) => ({
          id: row.id,
          name: row.name,
          page: pathOf(row)!,
          latitude: row.latitude,
          longitude: row.longitude,
          characteristics: describeBreak(row, confirmed.get(row.id)).characteristics,
        })),
      };
    }),

  // The sitemap's two lists: every hub, and every listed break by pages of two thousand.
  hubs: callerProcedure
    .route({
      method: "GET",
      path: "/pages/hubs",
      summary: "Every country and region that has listed surf breaks, for a sitemap",
      tags: ["Pages"],
    })
    .output(
      z.object({
        hubs: z.array(z.object({ page: z.string(), updatedAt: z.date() })),
      }),
    )
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          country: surfBreak.countrySlug,
          region: surfBreak.regionSlug,
          updatedAt: max(surfBreak.updatedAt),
        })
        .from(surfBreak)
        .where(and(hasPageSql, standsAloneSql))
        .groupBy(surfBreak.countrySlug, surfBreak.regionSlug)
        .orderBy(asc(surfBreak.countrySlug), asc(surfBreak.regionSlug));
      const countries = new Map<string, Date>();
      for (const row of rows) {
        const seen = countries.get(row.country!);
        if (!seen || seen < row.updatedAt!) countries.set(row.country!, row.updatedAt!);
      }
      return {
        hubs: [
          ...[...countries.entries()].map(([country, updatedAt]) => ({
            page: `/spots/${country}`,
            updatedAt,
          })),
          ...rows.map((row) => ({
            page: `/spots/${row.country}/${row.region}`,
            updatedAt: row.updatedAt!,
          })),
        ],
      };
    }),

  listed: callerProcedure
    .route({
      method: "GET",
      path: "/pages/breaks",
      summary: "The addresses of the listed surf breaks, two thousand a page, for a sitemap",
      tags: ["Pages"],
    })
    .input(z.object({ page: z.coerce.number().int().min(0).default(0) }))
    .output(
      z.object({
        breaks: z.array(z.object({ page: z.string(), updatedAt: z.date() })),
        // How many pages there are, so that a sitemap index names each.
        pages: z.number(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [counted] = await context.db
        .select({ total: sql<number>`count(*)::int` })
        .from(surfBreak)
        .where(and(hasPageSql, standsAloneSql));
      const total = counted?.total ?? 0;
      const rows = await context.db
        .select({
          countrySlug: surfBreak.countrySlug,
          regionSlug: surfBreak.regionSlug,
          slug: surfBreak.slug,
          updatedAt: surfBreak.updatedAt,
        })
        .from(surfBreak)
        .where(and(hasPageSql, standsAloneSql))
        .orderBy(asc(surfBreak.countrySlug), asc(surfBreak.regionSlug), asc(surfBreak.slug))
        .limit(LISTED_A_PAGE)
        .offset(input.page * LISTED_A_PAGE);
      return {
        breaks: rows.map((row) => ({ page: pathOf(row)!, updatedAt: row.updatedAt })),
        pages: Math.max(1, Math.ceil(total / LISTED_A_PAGE)),
      };
    }),
};

/** How many breaks a page of the sitemap's list holds: in four languages, eight thousand addresses. */
export const LISTED_A_PAGE = 2000;
