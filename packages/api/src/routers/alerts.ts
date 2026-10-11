import { ORPCError } from "@orpc/server";
import { zoneNamed } from "@repo/conditions/alerts/clock";
import { openHours } from "@repo/conditions/alerts/open";
import { MAX_HORIZON_DAYS, availabilityOf, settingsOf } from "@repo/conditions/alerts/settings";
import { MAX_FORECAST_DAYS } from "@repo/conditions/forecasts/forecasts";
import { assessSpot } from "@repo/conditions/spots/conditions";
import { criteriaSchema } from "@repo/conditions/spots/criteria";
import type { Database } from "@repo/db";
import { alert, alertSettings, alertSpot, alertWindow } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { spot } from "@repo/db/schema/spots";
import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import { Effect, Result } from "effect";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { hasControlCharacter } from "../text";
import { forecastUnavailable } from "./forecasts";

// Decision 031. An alert and an account's settings are their owner's alone: every procedure here
// takes a session, and reads and writes nothing of another account.

const MAX_ALERTS_PER_USER = 100;
const MAX_SPOTS_PER_ALERT = 12;
const DAY_MINUTES = 24 * 60;

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((name) => !hasControlCharacter(name), "must not contain control characters");

// A range with neither end asks nothing: it is left out, as if it had not been given.
const askedSchema = criteriaSchema.transform(
  (criteria) =>
    Object.fromEntries(
      Object.entries(criteria).filter(
        ([, criterion]) =>
          typeof criterion === "string" ||
          (criterion !== undefined && Object.values(criterion).some((end) => end !== undefined)),
      ),
    ) as z.infer<typeof criteriaSchema>,
);

// An alert asks at least one thing of the sea: with no condition every hour would be a window.
const conditionsSchema = askedSchema.refine(
  (criteria) => Object.keys(criteria).length > 0,
  "an alert needs at least one condition",
);

// The forecast is hourly, so a window is a whole number of hours.
const shortestSchema = z
  .number()
  .int()
  .min(60)
  .max(DAY_MINUTES)
  .multipleOf(60)
  .describe("The shortest window worth telling, in minutes: whole hours, one at least.");

const spotIdsSchema = z
  .array(z.string())
  .min(1)
  .max(MAX_SPOTS_PER_ALERT)
  .refine((ids) => new Set(ids).size === ids.length, "a spot is named once");

const alertSchema = z.object({
  id: z.string(),
  name: z.string(),
  // The conditions that make its spots work, checked at each of them.
  criteria: criteriaSchema,
  enabled: z.boolean(),
  shortestMinutes: z.number(),
  // The spots it is set on, in the order they were added.
  spotIds: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

function describeAlert(row: typeof alert.$inferSelect, spotIds: string[]) {
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria,
    enabled: row.enabled,
    shortestMinutes: row.shortestMinutes,
    spotIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No alert "${id}".` });
}

// The spots of an alert, in the order they were added.
async function spotIdsOf(db: Database | Transaction, alertIds: string[]) {
  const byAlert = new Map<string, string[]>(alertIds.map((id) => [id, []]));
  if (alertIds.length === 0) return byAlert;
  const rows = await db
    .select({ alertId: alertSpot.alertId, spotId: alertSpot.spotId })
    .from(alertSpot)
    .where(inArray(alertSpot.alertId, alertIds))
    .orderBy(asc(alertSpot.position), asc(alertSpot.spotId));
  for (const row of rows) byAlert.get(row.alertId)?.push(row.spotId);
  return byAlert;
}

/**
 * Checks that spots may join an alert: each is the caller's, and in no other alert. The rows are
 * held until the transaction ends, so that a spot cannot be deleted or taken meanwhile.
 */
async function claimSpots(tx: Transaction, userId: string, spotIds: string[], alertId?: string) {
  if (spotIds.length === 0) return;
  const owned = await tx
    .select({ id: spot.id })
    .from(spot)
    .where(and(inArray(spot.id, spotIds), eq(spot.userId, userId)))
    .for("update");
  const known = new Set(owned.map((row) => row.id));
  const missing = spotIds.find((id) => !known.has(id));
  // Another account's spot is reported as missing, as it is everywhere.
  if (missing) throw new ORPCError("NOT_FOUND", { message: `No spot "${missing}".` });

  const taken = await tx
    .select({ spotId: alertSpot.spotId, alertId: alertSpot.alertId })
    .from(alertSpot)
    .where(inArray(alertSpot.spotId, spotIds));
  const elsewhere = taken.find((row) => row.alertId !== alertId);
  if (elsewhere) {
    throw new ORPCError("CONFLICT", {
      message: `Spot "${elsewhere.spotId}" is already in an alert. A spot is in one alert at most.`,
    });
  }
}

/**
 * Forgets what the looks saw and told at an alert's spots, or at one of them: the sea is
 * another under new conditions, and at another place. Nothing is told of what is forgotten,
 * and the next look starts as the first did.
 */
export async function forgetSeen(tx: Transaction, alertId: string, spotId?: string) {
  await tx
    .delete(alertWindow)
    .where(
      and(eq(alertWindow.alertId, alertId), spotId ? eq(alertWindow.spotId, spotId) : undefined),
    );
  await tx
    .update(alertSpot)
    .set({ told: [], cutBy: null, begun: [], lookedAt: null })
    .where(and(eq(alertSpot.alertId, alertId), spotId ? eq(alertSpot.spotId, spotId) : undefined));
}

const stretchSchema = z.object({ start: z.date(), end: z.date() });
const dayHoursSchema = z
  .array(
    z
      .object({
        from: z.number().int().min(0).max(DAY_MINUTES).multipleOf(60),
        to: z.number().int().min(0).max(DAY_MINUTES).multipleOf(60),
      })
      .refine((hours) => hours.from < hours.to, "hours end after they begin"),
  )
  .max(6);

const settingsSchema = z.object({
  // How many days ahead a window may be told.
  horizonDays: z.number(),
  // The IANA name of the account's time zone. Null until it is known: UTC then.
  zone: z.string().nullable(),
  locale: z.enum(["en", "fr"]).nullable(),
  // The moments, each of which can be switched off.
  onFound: z.boolean(),
  onEvening: z.boolean(),
  // The hour of the evening message, in minutes since midnight.
  eveningMinutes: z.number(),
  onChange: z.boolean(),
  onBegin: z.boolean(),
  // How long before a window begins "it is on" is told, in minutes.
  noticeMinutes: z.number(),
  daylightOnly: z.boolean(),
  // The account's hours for each day of the week, Monday first. Null for any hour.
  week: z.array(dayHoursSchema).nullable(),
  // The account is away until then: no hour before it is open, and so none is told.
  awayUntil: z.date().nullable(),
  // The hours in which nothing is sent, in minutes since midnight. Both null for none.
  quietFrom: z.number().nullable(),
  quietTo: z.number().nullable(),
  // Whether alerts are mailed. Null until the account has said.
  byMail: z.boolean().nullable(),
  namesInSubject: z.boolean(),
  byPush: z.boolean(),
});

const minutesOfDay = z
  .number()
  .int()
  .min(0)
  .max(DAY_MINUTES - 1);

// Each day's hours in order, with those that touch or overlap made one.
function tidied(week: z.infer<typeof dayHoursSchema>[]) {
  return week.map((day) => {
    const merged: { from: number; to: number }[] = [];
    for (const hours of [...day].sort((a, b) => a.from - b.from)) {
      const last = merged.at(-1);
      if (last && hours.from <= last.to) last.to = Math.max(last.to, hours.to);
      else merged.push({ ...hours });
    }
    return merged;
  });
}

export const alertsRouter = {
  create: protectedProcedure
    .route({
      method: "POST",
      path: "/alerts",
      successStatus: 201,
      summary: "Set an alert on one spot, or on several that work in the same conditions",
      description:
        "The conditions are checked at each of the spots, with that spot's own forecast and " +
        "tide. A spot is in one alert at most: one that is in another is refused with 409.",
      tags: ["Alerts"],
    })
    .input(
      z.object({
        name: nameSchema,
        spotIds: spotIdsSchema,
        criteria: conditionsSchema,
        enabled: z.boolean().default(true),
        shortestMinutes: shortestSchema.default(120),
      }),
    )
    .output(alertSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { spotIds, ...fields } = input;

      const created = await context.db.transaction(async (tx) => {
        // Locking the account row makes its creations run one after the other, so two requests
        // at once cannot both pass the limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
        const [owned] = await tx
          .select({ total: count() })
          .from(alert)
          .where(eq(alert.userId, userId));
        if ((owned?.total ?? 0) >= MAX_ALERTS_PER_USER) return null;

        await claimSpots(tx, userId, spotIds);
        const [row] = await tx
          .insert(alert)
          .values({ ...fields, id: crypto.randomUUID(), userId })
          .returning();
        if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
        await tx
          .insert(alertSpot)
          .values(spotIds.map((spotId, position) => ({ spotId, alertId: row.id, position })));
        return row;
      });
      if (created === null) {
        throw new ORPCError("FORBIDDEN", {
          message: `An account holds at most ${MAX_ALERTS_PER_USER} alerts.`,
        });
      }
      return describeAlert(created, spotIds);
    }),

  list: protectedProcedure
    .route({ method: "GET", path: "/alerts", summary: "The caller's alerts", tags: ["Alerts"] })
    .output(z.object({ alerts: z.array(alertSchema) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select()
        .from(alert)
        .where(eq(alert.userId, context.session.user.id))
        .orderBy(asc(alert.createdAt), asc(alert.id));
      const spots = await spotIdsOf(
        context.db,
        rows.map((row) => row.id),
      );
      return { alerts: rows.map((row) => describeAlert(row, spots.get(row.id) ?? [])) };
    }),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/alerts/{id}",
      summary: "One of the caller's alerts",
      tags: ["Alerts"],
    })
    .input(z.object({ id: z.string() }))
    .output(alertSchema)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select()
        .from(alert)
        .where(and(eq(alert.id, input.id), eq(alert.userId, context.session.user.id)));
      if (!row) throw notFound(input.id);
      const spots = await spotIdsOf(context.db, [row.id]);
      return describeAlert(row, spots.get(row.id) ?? []);
    }),

  update: protectedProcedure
    .route({
      method: "PATCH",
      path: "/alerts/{id}",
      summary: "Change one of the caller's alerts",
      description:
        "What is left out stays as it is. `spotIds`, when given, are all the spots of the " +
        "alert from then on. New conditions start the alert over, and so does switching it " +
        "off: what it saw of the sea and what it told are forgotten, and nothing is called off.",
      tags: ["Alerts"],
    })
    .input(
      z.object({
        id: z.string(),
        name: nameSchema.optional(),
        spotIds: spotIdsSchema.optional(),
        criteria: conditionsSchema.optional(),
        enabled: z.boolean().optional(),
        shortestMinutes: shortestSchema.optional(),
      }),
    )
    .output(alertSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { id, spotIds, ...changes } = input;

      return context.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(alert)
          .where(and(eq(alert.id, id), eq(alert.userId, userId)))
          .for("update");
        if (!current) throw notFound(id);

        const before = (await spotIdsOf(tx, [id])).get(id) ?? [];
        const after = spotIds ?? before;
        const added = after.filter((spotId) => !before.includes(spotId));
        const removed = before.filter((spotId) => !after.includes(spotId));
        await claimSpots(tx, userId, added, id);

        // What a look reads has changed: one that is under way writes nothing.
        const asksOtherwise =
          (changes.criteria !== undefined &&
            JSON.stringify(changes.criteria) !== JSON.stringify(current.criteria)) ||
          (changes.shortestMinutes !== undefined &&
            changes.shortestMinutes !== current.shortestMinutes);
        // Under new conditions the sea is another, and an alert that is switched off stops
        // following what it told: either way it starts over.
        const startsOver =
          (changes.criteria !== undefined &&
            JSON.stringify(changes.criteria) !== JSON.stringify(current.criteria)) ||
          (changes.enabled === false && current.enabled);
        // A look that is under way must not write back what starting over has just forgotten,
        // were the alert switched on again before it ends.
        const isRead = asksOtherwise || startsOver || added.length > 0 || removed.length > 0;
        if (startsOver) {
          await forgetSeen(tx, id);
        } else if (removed.length > 0) {
          await tx
            .delete(alertWindow)
            .where(and(eq(alertWindow.alertId, id), inArray(alertWindow.spotId, removed)));
        }
        if (removed.length > 0) {
          await tx
            .delete(alertSpot)
            .where(and(eq(alertSpot.alertId, id), inArray(alertSpot.spotId, removed)));
        }
        if (added.length > 0) {
          // After the spots that stay, whatever place those that left had.
          const [last] = await tx
            .select({ position: max(alertSpot.position) })
            .from(alertSpot)
            .where(eq(alertSpot.alertId, id));
          const from = (last?.position ?? -1) + 1;
          await tx
            .insert(alertSpot)
            .values(
              added.map((spotId, index) => ({ spotId, alertId: id, position: from + index })),
            );
        }

        const [updated] = await tx
          .update(alert)
          .set({
            ...changes,
            ...(isRead ? { revision: sql`${alert.revision} + 1` } : {}),
            // An alert that starts over is looked at by the next run, as a new one is.
            ...(startsOver ? { lookedAt: null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(alert.id, id))
          .returning();
        if (!updated) throw notFound(id);
        // The spots that stay keep their place, and the new ones come after them.
        return describeAlert(updated, [
          ...before.filter((spotId) => after.includes(spotId)),
          ...added,
        ]);
      });
    }),

  delete: protectedProcedure
    .route({
      method: "DELETE",
      path: "/alerts/{id}",
      summary: "Delete one of the caller's alerts",
      description: "Its spots stay. What it told stays in the caller's notifications.",
      tags: ["Alerts"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [deleted] = await context.db
        .delete(alert)
        .where(and(eq(alert.id, input.id), eq(alert.userId, context.session.user.id)))
        .returning({ id: alert.id });
      if (!deleted) throw notFound(input.id);
      return deleted;
    }),

  preview: protectedProcedure
    .route({
      method: "POST",
      path: "/alerts/preview",
      summary: "What conditions would give at some of the caller's spots, before they are saved",
      description:
        "For each spot: the forecast and the tide hour by hour, the conditions each hour does " +
        "not meet, the windows in which all are met, and the hours of those windows the caller " +
        "can use, by the settings of their account. Nothing is saved and nothing is told.",
      tags: ["Alerts"],
    })
    .input(
      z.object({
        spotIds: spotIdsSchema,
        criteria: askedSchema,
        shortestMinutes: shortestSchema.default(120),
        days: z.number().int().min(1).max(MAX_FORECAST_DAYS).default(7),
      }),
    )
    .output(
      z.object({
        spots: z.array(
          z.object({
            spotId: z.string(),
            // False for a spot with no sea forecast: there is nothing else then.
            hasSea: z.boolean(),
            // Null when no tide station is close enough. Tide conditions are then never met.
            hasTide: z.boolean(),
            hours: z.array(
              z.object({
                time: z.date(),
                swellHeightMeters: z.number().nullable(),
                swellPeriodSeconds: z.number().nullable(),
                swellDirectionDegrees: z.number().nullable(),
                windSpeedMetersPerSecond: z.number().nullable(),
                windDirectionDegrees: z.number().nullable(),
                tideHeightMeters: z.number().nullable(),
                tideTrend: z.enum(["rising", "falling"]).nullable(),
                // The conditions this hour does not meet. Empty when the spot works.
                unmet: z.array(criteriaSchema.keyof()),
              }),
            ),
            // The runs of hours in which every condition is met.
            windows: z.array(stretchSchema),
            // The hours of those windows the caller can use.
            open: z.array(stretchSchema),
            // When the instance fetched the forecast of this spot, and whether it is an older
            // one, given because the provider could not be asked.
            forecastFetchedAt: z.date(),
            forecastStale: z.boolean(),
          }),
        ),
        forecastSource: z.object({
          name: z.string(),
          url: z.string(),
          attribution: z.string(),
          license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
        }),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const spots = await context.db
        .select()
        .from(spot)
        .where(and(inArray(spot.id, input.spotIds), eq(spot.userId, userId)));
      const missing = input.spotIds.find((id) => !spots.some((row) => row.id === id));
      if (missing) throw new ORPCError("NOT_FOUND", { message: `No spot "${missing}".` });
      const [row] = await context.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, userId));
      const availability = availabilityOf(settingsOf(row));

      // One spot after the other: neighbours share a cell of the forecast, which the first of
      // them fetches for all.
      const assessed = [];
      for (const spotId of input.spotIds) {
        const place = spots.find((candidate) => candidate.id === spotId)!;
        const result = await Effect.runPromise(
          Effect.result(
            assessSpot(context.forecasts, { ...place, criteria: input.criteria }, input.days),
          ),
        );
        if (Result.isFailure(result)) throw forecastUnavailable(result.failure);
        assessed.push({ place, found: result.success });
      }

      const source = assessed.find((entry) => entry.found.hasSea)?.found;
      if (!source?.hasSea) {
        throw new ORPCError("NOT_FOUND", { message: "No sea forecast for these spots." });
      }
      return {
        spots: assessed.map(({ place, found }) => ({
          spotId: place.id,
          forecastFetchedAt: found.forecastFetchedAt,
          forecastStale: found.forecastStale,
          ...(found.hasSea
            ? {
                hasSea: true,
                hasTide: found.tideStation !== null,
                hours: found.hours,
                windows: found.windows,
                open: found.windows.flatMap((sea) =>
                  openHours(sea, place, availability, input.shortestMinutes),
                ),
              }
            : { hasSea: false, hasTide: false, hours: [], windows: [], open: [] }),
        })),
        forecastSource: source.forecastSource,
      };
    }),

  getSettings: protectedProcedure
    .route({
      method: "GET",
      path: "/alert-settings",
      summary: "How the caller wants to be told, for all their alerts",
      description: "An account that has set nothing is given the defaults.",
      tags: ["Alerts"],
    })
    .output(settingsSchema)
    .handler(async ({ context }) => {
      const [row] = await context.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, context.session.user.id));
      return settingsOf(row);
    }),

  updateSettings: protectedProcedure
    .route({
      method: "PATCH",
      path: "/alert-settings",
      summary: "Change how the caller wants to be told",
      description:
        "What is left out stays as it is. A setting changes what is told from then on: it " +
        "calls nothing off, and tells nothing again.",
      tags: ["Alerts"],
    })
    .input(
      z
        .object({
          horizonDays: z.number().int().min(1).max(MAX_HORIZON_DAYS),
          zone: z
            .string()
            .max(64)
            // Kept as the runtime spells it, whatever case it came in.
            .transform((name, context) => {
              const zone = zoneNamed(name);
              if (zone) return zone;
              context.addIssue({ code: "custom", message: "must be the IANA name of a time zone" });
              return z.NEVER;
            }),
          locale: z.enum(["en", "fr"]),
          onFound: z.boolean(),
          onEvening: z.boolean(),
          eveningMinutes: minutesOfDay,
          onChange: z.boolean(),
          onBegin: z.boolean(),
          noticeMinutes: z.number().int().min(0).max(240).multipleOf(15),
          daylightOnly: z.boolean(),
          week: z.array(dayHoursSchema).length(7).nullable(),
          awayUntil: z.coerce.date().nullable(),
          quietFrom: minutesOfDay.nullable(),
          quietTo: minutesOfDay.nullable(),
          byMail: z.boolean(),
          namesInSubject: z.boolean(),
          byPush: z.boolean(),
        })
        .partial()
        .refine(
          (settings) => (settings.quietFrom === null) === (settings.quietTo === null),
          "quiet hours have a beginning and an end, or neither",
        ),
    )
    .output(settingsSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const changes = { ...input, ...(input.week ? { week: tidied(input.week) } : {}) };
      // Quiet hours are given whole: a beginning without an end would leave the other as it was.
      if ((changes.quietFrom === undefined) !== (changes.quietTo === undefined)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Quiet hours are given with both their beginning and their end.",
        });
      }
      const [row] = await context.db
        .insert(alertSettings)
        .values({ userId, ...changes })
        .onConflictDoUpdate({
          target: alertSettings.userId,
          set: { ...changes, updatedAt: new Date() },
        })
        .returning();
      return settingsOf(row);
    }),
};
