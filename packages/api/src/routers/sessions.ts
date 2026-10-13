import { ORPCError } from "@orpc/server";
import { sessionFigures } from "@repo/conditions/sessions/figures";
import { SHORE_WINDS } from "@repo/conditions/shore-wind";
import { user } from "@repo/db/schema/auth";
import { surfSession } from "@repo/db/schema/sessions";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { takeConditions } from "../sessions";
import { hasControlCharacter } from "../text";

// An account's log of its sessions: decision 043.

const MINUTE_MS = 60 * 1000;
// How many sessions an account keeps.
const MAX_SESSIONS_PER_USER = 2000;
// A session is written once it has begun: a clock that runs a little ahead is forgiven.
const AHEAD_MS = 15 * MINUTE_MS;
// And a log does not reach further back than this.
const OLDEST_MS = 10 * 365 * 24 * 60 * MINUTE_MS;
const DEFAULT_MINUTES = 90;

const measurement = z.number().nullable();

const readingSchema = z.object({
  observedAt: z.string(),
  significantHeightMeters: measurement,
  maxHeightMeters: measurement,
  peakPeriodSeconds: measurement,
  meanPeriodSeconds: measurement,
  peakDirectionDegrees: measurement,
  waterTemperatureCelsius: measurement,
  windSpeedMetersPerSecond: measurement,
  windGustMetersPerSecond: measurement,
  windDirectionDegrees: measurement,
});

const stationSchema = z.object({
  stationId: z.string(),
  name: z.string(),
  distanceKm: z.number(),
  attribution: z.string(),
  readings: z.array(readingSchema),
});

// What the sea did while the session lasted, as it was read then. Times are ISO 8601 texts.
const conditionsSchema = z.object({
  // What the models last computed of the session's hours, from the hour its start falls in to
  // the one its end falls in. Null when they gave nothing: `modelMissing` says why.
  model: z
    .object({
      point: z.object({ latitude: z.number(), longitude: z.number() }),
      waveModels: z.array(z.string()),
      swellModels: z.array(z.string()),
      hours: z.array(
        z.object({
          time: z.string(),
          waveHeightMeters: measurement,
          wavePeriodSeconds: measurement,
          wavePeakPeriodSeconds: measurement,
          waveDirectionDegrees: measurement,
          primarySwellHeightMeters: measurement,
          primarySwellDirectionDegrees: measurement,
          windSpeedMetersPerSecond: measurement,
          windGustMetersPerSecond: measurement,
          windDirectionDegrees: measurement,
          cloudCoverPercent: measurement,
          precipitationMillimeters: measurement,
          airTemperatureCelsius: measurement,
        }),
      ),
    })
    .nullable(),
  // `no_sea`: the point has no sea nearby. `too_old`: the session is further back than the
  // models are asked. `unavailable`: they could not be asked then, and changing the session,
  // or sending it again as it is, asks once more.
  modelMissing: z.enum(["no_sea", "too_old", "unavailable"]).nullable(),
  tide: z
    .object({
      station: z.object({ id: z.string(), name: z.string(), distanceKm: z.number() }),
      datum: z.string(),
      heights: z.array(z.object({ time: z.string(), heightMeters: z.number() })),
      extremes: z.array(
        z.object({ time: z.string(), type: z.enum(["high", "low"]), heightMeters: z.number() }),
      ),
    })
    .nullable(),
  // The nearest buoy the sea reaches freely, and the nearest station that measured the wind.
  buoy: stationSchema.nullable(),
  wind: stationSchema.nullable(),
  offshoreDirectionDegrees: measurement,
});

// One figure for each thing the sea did, read at the middle of the session.
const figuresSchema = z.object({
  waveHeightMeters: measurement,
  wavePeakPeriodSeconds: measurement,
  wavePeriodSeconds: measurement,
  waveDirectionDegrees: measurement,
  primarySwellHeightMeters: measurement,
  primarySwellDirectionDegrees: measurement,
  windSpeedMetersPerSecond: measurement,
  windGustMetersPerSecond: measurement,
  windDirectionDegrees: measurement,
  // How that wind met the shore, where the place says which way its shore faces.
  shoreWind: z.enum(SHORE_WINDS).nullable(),
  airTemperatureCelsius: measurement,
  cloudCoverPercent: measurement,
  precipitationMillimeters: measurement,
  tideHeightMeters: measurement,
  tideTrend: z.enum(["rising", "falling"]).nullable(),
  // Where the tide stood between its low and its high: 0 at the low, 1 at the high.
  tideLevel: measurement,
  buoy: z
    .object({
      name: z.string(),
      distanceKm: z.number(),
      significantHeightMeters: measurement,
      periodSeconds: measurement,
      directionDegrees: measurement,
      waterTemperatureCelsius: measurement,
    })
    .nullable(),
  measuredWind: z
    .object({
      name: z.string(),
      distanceKm: z.number(),
      speedMetersPerSecond: measurement,
      gustMetersPerSecond: measurement,
      directionDegrees: measurement,
    })
    .nullable(),
});

const sessionSchema = z.object({
  id: z.string(),
  // Where it was surfed. The name and the point are the session's own: `breakId` and `spotId`
  // are null once the place is gone.
  place: z.object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    breakId: z.string().nullable(),
    spotId: z.string().nullable(),
  }),
  startedAt: z.date(),
  durationMinutes: z.number().int(),
  // From 0.5 to 5, by halves. Null for a session that is not rated.
  rating: z.number().nullable(),
  note: z.string().nullable(),
  figures: figuresSchema,
  modelMissing: conditionsSchema.shape.modelMissing,
  // When the conditions were read. Null for a session that has none.
  conditionsTakenAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const detailSchema = sessionSchema.extend({ conditions: conditionsSchema.nullable() });

type Row = typeof surfSession.$inferSelect;

function describeSession(row: Row) {
  return {
    id: row.id,
    place: {
      name: row.placeName,
      latitude: row.latitude,
      longitude: row.longitude,
      breakId: row.breakId,
      spotId: row.spotId,
    },
    startedAt: row.startedAt,
    durationMinutes: row.durationMinutes,
    rating: row.rating,
    note: row.note,
    figures: sessionFigures(row.conditions, row.startedAt, row.durationMinutes),
    modelMissing: row.conditions?.modelMissing ?? null,
    conditionsTakenAt: row.conditionsTakenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const describeDetail = (row: Row) => ({ ...describeSession(row), conditions: row.conditions });

function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No session "${id}".` });
}

// Stars, by halves.
const ratingSchema = z.number().min(0.5).max(5).multipleOf(0.5);
const noteSchema = z
  .string()
  .trim()
  .max(2000)
  // A note has lines: the two characters that part them are kept, and no other of their kind.
  .refine(
    (note) => !hasControlCharacter(note.replace(/[\n\r]/g, "")),
    "must not contain control characters",
  );
const durationSchema = z.number().int().min(15).max(720);

// A session is of the past, and of no more than a little of the future.
function whenRefused(startedAt: Date, now: number) {
  if (startedAt.getTime() > now + AHEAD_MS) {
    return new ORPCError("BAD_REQUEST", { message: "A session is written once it has begun." });
  }
  if (startedAt.getTime() < now - OLDEST_MS) {
    return new ORPCError("BAD_REQUEST", { message: "A session is no more than ten years old." });
  }
  return null;
}

// A time zone as the database names it, such as "Europe/Paris".
const zoneSchema = z.string().regex(/^[A-Za-z0-9_+\-/]{1,64}$/);

const tally = z.object({ count: z.number().int(), minutes: z.number().int() });

export const sessionsRouter = {
  create: protectedProcedure
    .meta({ analytics: "session_logged" })
    .route({
      method: "POST",
      path: "/sessions",
      successStatus: 201,
      summary: "Write a session in the caller's log",
      description:
        "A session is at a break of the catalogue or at a spot of the caller's own: one of " +
        "`breakId` and `spotId`. It takes the place's name and its point, and keeps them as its " +
        "own. It may be written long after it was surfed. What the sea did while it lasted is " +
        "read then and kept with it: what the models last computed of its hours, the tide, and " +
        "what the nearest buoy and wind station measured. The models answer for the last 90 " +
        "days: a session further back keeps the tide and the stations alone. A part that could " +
        "not be had is null, and the session is written all the same.",
      tags: ["Sessions"],
    })
    .input(
      z
        .object({
          breakId: z.string().optional(),
          spotId: z.string().optional(),
          startedAt: z.coerce.date(),
          durationMinutes: durationSchema.default(DEFAULT_MINUTES),
          rating: ratingSchema.optional(),
          note: noteSchema.optional(),
        })
        .refine(
          (input) => (input.breakId === undefined) !== (input.spotId === undefined),
          "one of breakId and spotId",
        ),
    )
    .output(detailSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const refused = whenRefused(input.startedAt, Date.now());
      if (refused) throw refused;

      // The place as it is now. A spot is its owner's alone: another's is reported as missing.
      const [own] = input.spotId
        ? await context.db
            .select()
            .from(spot)
            .where(and(eq(spot.id, input.spotId), eq(spot.userId, userId)))
        : [];
      if (input.spotId && !own) {
        throw new ORPCError("NOT_FOUND", { message: `No spot "${input.spotId}".` });
      }
      // Its break says which way the shore faces when the spot does not.
      const breakId = input.breakId ?? own?.breakId ?? undefined;
      const [found] = breakId
        ? await context.db.select().from(surfBreak).where(eq(surfBreak.id, breakId))
        : [];
      if (input.breakId && !found) {
        throw new ORPCError("NOT_FOUND", { message: `No break "${input.breakId}".` });
      }
      const place = own ?? found;
      if (!place) throw new ORPCError("BAD_REQUEST");

      // Read before the session is written, and outside its transaction: the provider may be
      // slow, and nothing of the database waits for it.
      const conditions = await takeConditions({
        db: context.db,
        forecasts: context.forecasts,
        userId,
        place: { latitude: place.latitude, longitude: place.longitude },
        offshoreDirectionDegrees:
          own?.characteristics?.offshoreDirectionDegrees ?? found?.offshoreDirectionDegrees ?? null,
        startedAt: input.startedAt,
        durationMinutes: input.durationMinutes,
      });

      const created = await context.db.transaction(async (tx) => {
        // Locking the account row makes its creations run one after the other, so two requests
        // at once cannot both pass the limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
        const [kept] = await tx
          .select({ total: count() })
          .from(surfSession)
          .where(eq(surfSession.userId, userId));
        if ((kept?.total ?? 0) >= MAX_SESSIONS_PER_USER) return null;

        // The place is held until the session is written, so that it cannot go meanwhile.
        const [still] = input.spotId
          ? await tx
              .select({ id: spot.id })
              .from(spot)
              .where(eq(spot.id, input.spotId))
              .for("share")
          : await tx
              .select({ id: surfBreak.id })
              .from(surfBreak)
              .where(eq(surfBreak.id, input.breakId ?? ""))
              .for("share");
        if (!still) throw new ORPCError("NOT_FOUND", { message: "The place is gone." });

        const [row] = await tx
          .insert(surfSession)
          .values({
            id: crypto.randomUUID(),
            userId,
            breakId: input.breakId ?? null,
            spotId: input.spotId ?? null,
            placeName: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            startedAt: input.startedAt,
            durationMinutes: input.durationMinutes,
            rating: input.rating ?? null,
            note: input.note || null,
            conditions,
            conditionsTakenAt: new Date(),
          })
          .returning();
        return row;
      });
      if (created === null) {
        throw new ORPCError("FORBIDDEN", {
          message: `An account keeps at most ${MAX_SESSIONS_PER_USER} sessions.`,
        });
      }
      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return describeDetail(created);
    }),

  list: protectedProcedure
    .meta({
      mcp: {
        name: "list_my_sessions",
        title: "The account's log of sessions",
        account: true,
        description:
          "The surf sessions the account you act for wrote in its log, the latest first: " +
          "where (`place`), when (`startedAt`, UTC), how long, a `rating` from 0.5 to 5 " +
          "when the person rated it, their `note`, and `figures`, one figure for each " +
          "thing the sea did at the middle of the session. `breakId` or `spotId` keeps " +
          "the sessions at one place. It answers 20 unless `limit` says another, 200 at " +
          "most: pass an answer's `next` as `before` for the sessions that follow. Use it " +
          "to say what the person surfed, and which conditions they rated best. " +
          "get_my_session gives the full conditions of one session, and " +
          "get_my_sessions_recap the totals.",
        defaults: { limit: 20 },
      },
    })
    .route({
      method: "GET",
      path: "/sessions",
      summary: "The caller's sessions, the latest first",
      description:
        "All of them, or those at one place: `breakId` or `spotId`. Each comes with its " +
        "figures, and without the conditions they were read from, which `GET /sessions/{id}` " +
        "gives. Pages follow one another through `before`.",
      tags: ["Sessions"],
    })
    .input(
      z.object({
        breakId: z.string().optional(),
        spotId: z.string().optional(),
        // The `next` of the page before.
        before: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    )
    .output(
      z.object({
        sessions: z.array(sessionSchema),
        // What to pass as `before` to get the sessions that follow. Null on the last page.
        next: z.date().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      const rows = await context.db
        .select()
        .from(surfSession)
        .where(
          and(
            eq(surfSession.userId, context.session.user.id),
            input.breakId ? eq(surfSession.breakId, input.breakId) : undefined,
            input.spotId ? eq(surfSession.spotId, input.spotId) : undefined,
            input.before ? lt(surfSession.startedAt, input.before) : undefined,
          ),
        )
        .orderBy(desc(surfSession.startedAt), desc(surfSession.id))
        // One more than asked, to know whether a page follows.
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        sessions: page.map(describeSession),
        next: rows.length > input.limit ? (page.at(-1)?.startedAt ?? null) : null,
      };
    }),

  recap: protectedProcedure
    .meta({
      analytics: "logbook_recap_viewed",
      mcp: {
        name: "get_my_sessions_recap",
        title: "What the account's log comes to",
        account: true,
        description:
          "What the log of the account you act for comes to: how many sessions and how " +
          "long in the water, in all, this year and this month, and the places surfed " +
          "most, each with how the person rated their sessions there. `zone` is the IANA " +
          "time zone the year and the month are counted in, UTC when left out: give the " +
          "person's own when you know it.",
      },
    })
    .route({
      method: "GET",
      path: "/sessions/recap",
      summary: "What the caller's log comes to",
      description:
        "How many sessions and how long in the water, in all, this year and this month, and " +
        "the places surfed most, each with how the caller rated its sessions there. `zone` is " +
        "the time zone the year and the month are counted in, UTC when left out.",
      tags: ["Sessions"],
    })
    .input(z.object({ zone: zoneSchema.optional() }))
    .output(
      z.object({
        total: tally,
        year: tally,
        month: tally,
        // How many places the sessions were at.
        placeCount: z.number().int(),
        // The five surfed most, the most first.
        places: z.array(
          z.object({
            name: z.string(),
            breakId: z.string().nullable(),
            spotId: z.string().nullable(),
            count: z.number().int(),
            minutes: z.number().int(),
            // Over the sessions that are rated. Null when none is.
            averageRating: z.number().nullable(),
            lastAt: z.date(),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const zone = input.zone ?? "UTC";
      const local = sql`(${surfSession.startedAt} at time zone ${zone})`;
      const since = (unit: "year" | "month") =>
        sql`${local} >= date_trunc(${unit}, now() at time zone ${zone})`;
      const counted = (when?: ReturnType<typeof since>) =>
        when
          ? {
              count: sql<number>`(count(*) filter (where ${when}))::int`,
              minutes: sql<number>`(coalesce(sum(${surfSession.durationMinutes}) filter (where ${when}), 0))::int`,
            }
          : {
              count: sql<number>`count(*)::int`,
              minutes: sql<number>`coalesce(sum(${surfSession.durationMinutes}), 0)::int`,
            };
      const all = counted();
      const year = counted(since("year"));
      const month = counted(since("month"));
      // A place is a spot or a break while it is there, and a name afterwards.
      const where = sql`coalesce(${surfSession.spotId}, ${surfSession.breakId}, ${surfSession.placeName})`;
      const totals = context.db
        .select({
          count: all.count,
          minutes: all.minutes,
          yearCount: year.count,
          yearMinutes: year.minutes,
          monthCount: month.count,
          monthMinutes: month.minutes,
          placeCount: sql<number>`(count(distinct ${where}))::int`,
        })
        .from(surfSession)
        .where(eq(surfSession.userId, userId));
      const places = context.db
        .select({
          // The name the latest session there was written with.
          name: sql<string>`(array_agg(${surfSession.placeName} order by ${surfSession.startedAt} desc))[1]`,
          breakId: sql<string | null>`max(${surfSession.breakId})`,
          spotId: sql<string | null>`max(${surfSession.spotId})`,
          count: all.count,
          minutes: all.minutes,
          averageRating: sql<
            number | null
          >`(round(avg(${surfSession.rating})::numeric, 1))::float8`,
          lastAt: sql<Date>`max(${surfSession.startedAt})`.mapWith(surfSession.startedAt),
        })
        .from(surfSession)
        .where(eq(surfSession.userId, userId))
        .groupBy(where)
        .orderBy(sql`count(*) desc`, sql`max(${surfSession.startedAt}) desc`)
        .limit(5);
      const [[sum], most] = await Promise.all([totals, places]).catch((error: unknown) => {
        // A time zone the database does not know is the only thing a caller can get wrong here.
        if ((error as { cause?: { code?: string } }).cause?.code === "22023") {
          throw new ORPCError("BAD_REQUEST", { message: `No time zone "${zone}".` });
        }
        throw error;
      });
      return {
        total: { count: sum?.count ?? 0, minutes: sum?.minutes ?? 0 },
        year: { count: sum?.yearCount ?? 0, minutes: sum?.yearMinutes ?? 0 },
        month: { count: sum?.monthCount ?? 0, minutes: sum?.monthMinutes ?? 0 },
        placeCount: sum?.placeCount ?? 0,
        places: most,
      };
    }),

  get: protectedProcedure
    .meta({
      mcp: {
        name: "get_my_session",
        title: "One session of the account's log",
        account: true,
        description:
          "One session of the log of the account you act for, by its `id`, as " +
          "list_my_sessions gives it, with the `conditions` kept with it: what the models " +
          "and the nearest stations said of the waves, the swell, the wind and the tide " +
          "while it lasted. `conditions` is null for a session that has none.",
      },
    })
    .route({
      method: "GET",
      path: "/sessions/{id}",
      summary: "One session, with the conditions kept with it",
      tags: ["Sessions"],
    })
    .input(z.object({ id: z.string() }))
    .output(detailSchema)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select()
        .from(surfSession)
        .where(and(eq(surfSession.id, input.id), eq(surfSession.userId, context.session.user.id)));
      if (!row) throw notFound(input.id);
      return describeDetail(row);
    }),

  update: protectedProcedure
    .meta({ analytics: "session_updated" })
    .route({
      method: "PATCH",
      path: "/sessions/{id}",
      summary: "Change a session: when it was, how long, its rating, its note",
      description:
        "What is left out stays, and `rating` or `note` given as null is taken away. The " +
        "conditions are read again when the session moves in time, and when the models could " +
        "not be asked the time before: a request that changes nothing asks them once more.",
      tags: ["Sessions"],
    })
    .input(
      z.object({
        id: z.string(),
        startedAt: z.coerce.date().optional(),
        durationMinutes: durationSchema.optional(),
        rating: ratingSchema.nullable().optional(),
        note: noteSchema.nullable().optional(),
      }),
    )
    .output(detailSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const mine = and(eq(surfSession.id, input.id), eq(surfSession.userId, userId));
      const [current] = await context.db.select().from(surfSession).where(mine);
      if (!current) throw notFound(input.id);

      const startedAt = input.startedAt ?? current.startedAt;
      const durationMinutes = input.durationMinutes ?? current.durationMinutes;
      const moved =
        startedAt.getTime() !== current.startedAt.getTime() ||
        durationMinutes !== current.durationMinutes;
      if (moved) {
        const refused = whenRefused(startedAt, Date.now());
        if (refused) throw refused;
      }
      const reads =
        moved || !current.conditions || current.conditions.modelMissing === "unavailable";
      const conditions = reads
        ? await takeConditions({
            db: context.db,
            forecasts: context.forecasts,
            userId,
            place: { latitude: current.latitude, longitude: current.longitude },
            // The shore faces the way it was said to when the session was written.
            offshoreDirectionDegrees: current.conditions?.offshoreDirectionDegrees ?? null,
            startedAt,
            durationMinutes,
          })
        : undefined;

      const [row] = await context.db
        .update(surfSession)
        .set({
          startedAt,
          durationMinutes,
          ...(input.rating !== undefined && { rating: input.rating }),
          ...(input.note !== undefined && { note: input.note || null }),
          ...(conditions && { conditions, conditionsTakenAt: new Date() }),
        })
        .where(mine)
        .returning();
      // Deleted while the conditions were read.
      if (!row) throw notFound(input.id);
      return describeDetail(row);
    }),

  delete: protectedProcedure
    .meta({ analytics: "session_deleted" })
    .route({
      method: "DELETE",
      path: "/sessions/{id}",
      summary: "Delete a session",
      tags: ["Sessions"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [deleted] = await context.db
        .delete(surfSession)
        .where(and(eq(surfSession.id, input.id), eq(surfSession.userId, context.session.user.id)))
        .returning({ id: surfSession.id });
      if (!deleted) throw notFound(input.id);
      return deleted;
    }),
};
