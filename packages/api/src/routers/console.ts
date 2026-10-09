import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { apiKey, developer, developerCalls, developerMember } from "@repo/db/schema/access";
import { and, asc, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import {
  APPROXIMATE,
  countsSchema,
  isKnownTimeZone,
  readBreakdown,
  readSeries,
  span,
} from "./usage";

// What a member of a developer account reads of it: decision 027. An operator names the
// members. Every query here names the caller, so that it gives nothing of an account the
// caller is no member of, whatever it is asked.

const MEMBER_ONLY =
  "Takes the signed-in session of an account that an operator made a member of the developer " +
  "account. No key calls this.";

/** Whether an account is a member of a developer account, as a condition of a query. */
const isMember = (db: Database, developerId: string, userId: string) =>
  exists(
    db
      .select({ userId: developerMember.userId })
      .from(developerMember)
      .where(and(eq(developerMember.developerId, developerId), eq(developerMember.userId, userId))),
  );

/**
 * Refuses a developer account that the caller is no member of, as one that does not exist: a
 * caller learns nothing of the accounts it may not read, their existence included.
 */
async function requireMember(db: Database, developerId: string, userId: string) {
  const [found] = await db
    .select({ id: developer.id })
    .from(developer)
    .where(and(eq(developer.id, developerId), isMember(db, developerId, userId)));
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such developer account." });
}

const asked = span.extend({ developerId: z.uuid() });

export const consoleRouter = {
  get: protectedProcedure
    .route({
      method: "GET",
      path: "/console",
      summary: "The developer accounts the caller is a member of, with their keys",
      description:
        `${MEMBER_ONLY} Each account comes with its limit, the calls its keys were let ` +
        "through in the hour under way, and its keys by name. A key itself is not here: it was " +
        "shown once, when it was made. An account that is a member of none gets an empty list.",
      tags: ["Console"],
    })
    .output(
      z.object({
        developers: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            // How many calls its keys may make between them in an hour. Null: no limit.
            callsPerHour: z.number().nullable(),
            // The calls its keys were let through in the hour under way, UTC's.
            callsThisHour: z.number(),
            // While it is set, none of its keys works.
            suspendedAt: z.date().nullable(),
            keys: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                // The key's first characters, to tell it from the others.
                prefix: z.string(),
                createdAt: z.date(),
                lastUsedAt: z.date().nullable(),
                revokedAt: z.date().nullable(),
              }),
            ),
          }),
        ),
      }),
    )
    .handler(async ({ context }) => {
      const { db } = context;
      const me = context.session.user.id;

      const developers = await db
        .select({
          id: developer.id,
          name: developer.name,
          callsPerHour: developer.callsPerHour,
          callsThisHour: sql<number>`coalesce(${developerCalls.calls}, 0)`.mapWith(Number),
          suspendedAt: developer.suspendedAt,
        })
        .from(developerMember)
        .innerJoin(developer, eq(developer.id, developerMember.developerId))
        .leftJoin(
          developerCalls,
          and(
            eq(developerCalls.developerId, developer.id),
            eq(developerCalls.hour, sql`date_trunc('hour', now(), 'UTC')`),
          ),
        )
        .where(eq(developerMember.userId, me))
        .orderBy(asc(developer.name), asc(developer.id));
      if (developers.length === 0) return { developers: [] };

      // The keys of those accounts, and of no other: the caller is named again here.
      const keys = await db
        .select({
          id: apiKey.id,
          name: apiKey.name,
          prefix: apiKey.prefix,
          developerId: apiKey.developerId,
          createdAt: apiKey.createdAt,
          lastUsedAt: apiKey.lastUsedAt,
          revokedAt: apiKey.revokedAt,
        })
        .from(apiKey)
        .innerJoin(
          developerMember,
          and(eq(developerMember.developerId, apiKey.developerId), eq(developerMember.userId, me)),
        )
        .where(
          inArray(
            apiKey.developerId,
            developers.map((found) => found.id),
          ),
        )
        .orderBy(desc(apiKey.createdAt), desc(apiKey.id));

      return {
        developers: developers.map((found) => ({
          ...found,
          keys: keys
            .filter((key) => key.developerId === found.id)
            .map(({ developerId: _of, ...key }) => key),
        })),
      };
    }),

  series: protectedProcedure
    .route({
      method: "GET",
      path: "/console/usage/series",
      summary: "The calls of a developer account's keys over time, by the hour or by the day",
      description:
        `${MEMBER_ONLY} ${APPROXIMATE} An hour or a day without a call is left out. A ` +
        "developer account the caller is no member of answers 404, as one that does not exist.",
      tags: ["Console"],
    })
    .input(
      asked.extend({
        step: z.enum(["hour", "day"]).default("hour"),
        // Where a day starts, by its IANA name. It only matters by the day.
        timeZone: z
          .string()
          .max(64)
          .refine(isKnownTimeZone, "must be the IANA name of a time zone")
          .default("UTC"),
      }),
    )
    .output(z.object({ points: z.array(countsSchema.extend({ at: z.date() })) }))
    .handler(async ({ input, context }) => {
      const me = context.session.user.id;
      await requireMember(context.db, input.developerId, me);
      // The account's keys alone, and the caller named once more in the query that reads.
      const scope = and(
        eq(apiKey.developerId, input.developerId),
        isMember(context.db, input.developerId, me),
      );
      return { points: await readSeries(context.db, input, scope) };
    }),

  breakdown: protectedProcedure
    .route({
      method: "GET",
      path: "/console/usage/breakdown",
      summary: "The calls of a developer account's keys in a span, by key or by what was called",
      description:
        `${MEMBER_ONLY} ${APPROXIMATE} The rows with the most calls come first, a hundred at ` +
        "most. A developer account the caller is no member of answers 404.",
      tags: ["Console"],
    })
    .input(asked.extend({ by: z.enum(["key", "procedure"]) }))
    .output(
      z.object({
        rows: z.array(
          countsSchema.extend({
            // The id of a key, or the procedure.
            id: z.string().nullable(),
            // The name of the key. Null for a procedure.
            name: z.string().nullable(),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      const me = context.session.user.id;
      await requireMember(context.db, input.developerId, me);
      const scope = and(
        eq(apiKey.developerId, input.developerId),
        isMember(context.db, input.developerId, me),
      );
      return { rows: await readBreakdown(context.db, input, scope) };
    }),
};
