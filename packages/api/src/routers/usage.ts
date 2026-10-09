import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { apiKey, apiUsage, developer, USAGE_OUTCOMES } from "@repo/db/schema/access";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";
import type { Outcome } from "../usage";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";
export const APPROXIMATE =
  "The counts are approximate and up to thirty seconds late: the API writes them every thirty " +
  "seconds, and loses some when it is killed. They are kept thirteen months.";

const DAY_MS = 24 * 60 * 60 * 1000;
// How far a question may reach: a month by the hour, or the thirteen months that are kept.
const LONGEST = { hour: 32 * DAY_MS, day: 400 * DAY_MS };

// How many calls ended each way.
export const countsSchema = z.object({
  answered: z.number(),
  invalid: z.number(),
  refused: z.number(),
  limited: z.number(),
  failed: z.number(),
});

// One column for each outcome: the calls that ended that way.
const counted = Object.fromEntries(
  USAGE_OUTCOMES.map((outcome) => [
    outcome,
    sql<number>`coalesce(sum(${apiUsage.calls}) filter (where ${apiUsage.outcome} = ${outcome}), 0)`.mapWith(
      Number,
    ),
  ]),
) as Record<Outcome, SQL<number>>;
const total = sql<number>`sum(${apiUsage.calls})`;

export const span = z.object({
  // The first hour counted, and the hour after the last. Both are read as moments, so a day is
  // whatever day the reader gives the bounds of.
  from: z.coerce.date(),
  to: z.coerce.date(),
});

function within(input: { from: Date; to: Date }, longest: number) {
  if (input.to <= input.from) {
    throw new ORPCError("BAD_REQUEST", { message: "`to` must come after `from`." });
  }
  if (input.to.getTime() - input.from.getTime() > longest) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The span is too long: ${longest / DAY_MS} days at most for this step.`,
    });
  }
  return and(gte(apiUsage.hour, input.from), lt(apiUsage.hour, input.to));
}

export function isKnownTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

type Step = "hour" | "day";

/**
 * The calls over time in a span, by the hour or by the day. `scope` keeps the calls that are
 * asked for: it may name the key a call was made with, which is joined.
 */
export async function readSeries(
  db: Database,
  input: { from: Date; to: Date; step: Step; timeZone: string },
  scope: SQL | undefined,
) {
  const inSpan = within(input, LONGEST[input.step]);
  const at =
    input.step === "hour"
      ? sql<Date>`${apiUsage.hour}`.mapWith(apiUsage.hour)
      : sql<Date>`date_trunc('day', ${apiUsage.hour}, ${input.timeZone})`.mapWith(apiUsage.hour);

  return db
    .select({ at: at.as("at"), ...counted })
    .from(apiUsage)
    .leftJoin(apiKey, eq(apiKey.id, apiUsage.keyId))
    .where(and(inSpan, scope))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

/**
 * The calls of a span, by who called or by what was called: the rows with the most calls
 * first, a hundred at most. `scope` keeps the calls that are asked for, as in `readSeries`.
 */
export async function readBreakdown(
  db: Database,
  input: { from: Date; to: Date; by: "via" | "developer" | "key" | "procedure" },
  scope: SQL | undefined,
) {
  const inSpan = and(within(input, LONGEST.day), scope);
  const from = () => db.select({ id: id.as("id"), name: name.as("name"), ...counted });
  let id: SQL<string | null>;
  let name: SQL<string | null> = sql<null>`null`;

  if (input.by === "developer" || input.by === "key") {
    if (input.by === "developer") {
      id = sql<string | null>`${developer.id}`;
      name = sql<string | null>`${developer.name}`;
    } else {
      id = sql<string>`${apiKey.id}`;
      name = sql<string>`${apiKey.name}`;
    }
    return from()
      .from(apiUsage)
      .innerJoin(apiKey, eq(apiKey.id, apiUsage.keyId))
      .leftJoin(developer, eq(developer.id, apiKey.developerId))
      .where(inSpan)
      .groupBy(sql`1`, sql`2`)
      .orderBy(sql`${total} desc`, sql`1`)
      .limit(100);
  }

  id = input.by === "via" ? sql<string>`${apiUsage.via}` : sql<string>`${apiUsage.procedure}`;
  return from()
    .from(apiUsage)
    .leftJoin(apiKey, eq(apiKey.id, apiUsage.keyId))
    .where(inSpan)
    .groupBy(sql`1`, sql`2`)
    .orderBy(sql`${total} desc`, sql`1`)
    .limit(100);
}

export const usageRouter = {
  series: adminProcedure
    .route({
      method: "GET",
      path: "/usage/series",
      summary: "The calls over time, by the hour or by the day",
      description:
        `${ADMIN_ONLY} ${APPROXIMATE} An hour or a day without a call is left out. A count is ` +
        "kept by UTC's hour, so a day is exact in a time zone that is a whole number of hours " +
        "from UTC, and off by part of an hour elsewhere.",
      tags: ["Usage"],
    })
    .input(
      span.extend({
        step: z.enum(["hour", "day"]).default("hour"),
        // Where a day starts, by its IANA name. It only matters by the day.
        timeZone: z
          .string()
          .max(64)
          .refine(isKnownTimeZone, "must be the IANA name of a time zone")
          .default("UTC"),
        // Only the calls of this developer account's keys, or of this key.
        developerId: z.uuid().optional(),
        keyId: z.uuid().optional(),
      }),
    )
    .output(z.object({ points: z.array(countsSchema.extend({ at: z.date() })) }))
    .handler(async ({ input, context }) => ({
      points: await readSeries(
        context.db,
        input,
        and(
          input.developerId ? eq(apiKey.developerId, input.developerId) : undefined,
          input.keyId ? eq(apiUsage.keyId, input.keyId) : undefined,
        ),
      ),
    })),

  breakdown: adminProcedure
    .route({
      method: "GET",
      path: "/usage/breakdown",
      summary: "The calls of a span of time, by who called or by what was called",
      description:
        `${ADMIN_ONLY} ${APPROXIMATE} \`by\` chooses the rows: \`via\` for the kind of caller ` +
        "(a key, the accounts as a whole, or no one), `developer` and `key` for the calls made " +
        "with keys, `procedure` for what was called. The rows with the most calls come first, " +
        "a hundred at most.",
      tags: ["Usage"],
    })
    .input(
      span.extend({
        by: z.enum(["via", "developer", "key", "procedure"]),
        // Only the calls of this developer account's keys.
        developerId: z.uuid().optional(),
      }),
    )
    .output(
      z.object({
        rows: z.array(
          countsSchema.extend({
            // What the row is about: the kind of caller, the procedure, or the id of a
            // developer account or of a key. Null for the keys that have no developer account.
            id: z.string().nullable(),
            // The name of the developer account or of the key. Null for the other rows.
            name: z.string().nullable(),
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => ({
      rows: await readBreakdown(
        context.db,
        input,
        input.developerId ? eq(apiKey.developerId, input.developerId) : undefined,
      ),
    })),
};
