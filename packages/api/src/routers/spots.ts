import { ORPCError } from "@orpc/server";
import { user } from "@repo/db/schema/auth";
import { spot } from "@repo/db/schema/spots";
import { and, asc, count, eq } from "drizzle-orm";
import { Effect, Result } from "effect";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { assessSpot } from "@repo/conditions/spots/conditions";
import { criteriaSchema } from "@repo/conditions/spots/criteria";

const MAX_SPOTS_PER_USER = 100;

// The database refuses some control characters, and none belongs in a name.
function hasControlCharacter(text: string) {
  return Array.from(text).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

const spotFields = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((name) => !hasControlCharacter(name), "must not contain control characters"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  visibility: z.enum(["private", "public"]),
  criteria: criteriaSchema,
  // Whether the owner is notified when the spot is forecast to work.
  alertsEnabled: z.boolean(),
};

const spotSchema = z.object({
  id: z.string(),
  ...spotFields,
  // Whether the caller owns the spot. The owner's identity is not exposed.
  isOwner: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const criterionSchema = criteriaSchema.keyof();

function describeSpot(row: typeof spot.$inferSelect, userId: string | undefined) {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    visibility: row.visibility,
    criteria: row.criteria,
    alertsEnabled: row.alertsEnabled,
    isOwner: row.userId === userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// A private spot that is not the caller's is reported as missing, so its existence stays private.
function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No spot "${id}".` });
}

export const spotsRouter = {
  create: protectedProcedure
    .route({
      method: "POST",
      path: "/spots",
      successStatus: 201,
      summary: "Save a spot with the conditions that make it work",
      tags: ["Spots"],
    })
    .input(
      z.object({
        ...spotFields,
        visibility: spotFields.visibility.default("private"),
        criteria: criteriaSchema.default({}),
        alertsEnabled: spotFields.alertsEnabled.default(false),
      }),
    )
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const created = await context.db.transaction(async (tx) => {
        // Locking the account row makes its creations run one after the other, so two requests
        // at once cannot both pass the limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");

        const [owned] = await tx
          .select({ total: count() })
          .from(spot)
          .where(eq(spot.userId, userId));
        if ((owned?.total ?? 0) >= MAX_SPOTS_PER_USER) return null;

        const [row] = await tx
          .insert(spot)
          .values({ id: crypto.randomUUID(), userId, ...input })
          .returning();
        return row;
      });
      if (created === null) {
        throw new ORPCError("FORBIDDEN", {
          message: `An account holds at most ${MAX_SPOTS_PER_USER} spots.`,
        });
      }
      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return describeSpot(created, userId);
    }),

  list: protectedProcedure
    .route({ method: "GET", path: "/spots", summary: "The caller's spots", tags: ["Spots"] })
    .output(z.object({ spots: z.array(spotSchema) }))
    .handler(async ({ context }) => {
      const userId = context.session.user.id;
      const rows = await context.db
        .select()
        .from(spot)
        .where(eq(spot.userId, userId))
        .orderBy(asc(spot.createdAt));
      return { spots: rows.map((row) => describeSpot(row, userId)) };
    }),

  get: publicProcedure
    .route({
      method: "GET",
      path: "/spots/{id}",
      summary: "One spot, if it is public or the caller's",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string() }))
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session?.user.id;
      const [row] = await context.db.select().from(spot).where(eq(spot.id, input.id));
      if (!row || (row.visibility === "private" && row.userId !== userId)) throw notFound(input.id);
      return describeSpot(row, userId);
    }),

  update: protectedProcedure
    .route({
      method: "PATCH",
      path: "/spots/{id}",
      summary: "Change a spot the caller owns",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string(), ...z.object(spotFields).partial().shape }))
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { id, ...changes } = input;
      const [updated] = await context.db
        .update(spot)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(spot.id, id), eq(spot.userId, userId)))
        .returning();
      if (!updated) throw notFound(id);
      return describeSpot(updated, userId);
    }),

  delete: protectedProcedure
    .route({
      method: "DELETE",
      path: "/spots/{id}",
      summary: "Delete a spot the caller owns",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [deleted] = await context.db
        .delete(spot)
        .where(and(eq(spot.id, input.id), eq(spot.userId, context.session.user.id)))
        .returning({ id: spot.id });
      if (!deleted) throw notFound(input.id);
      return deleted;
    }),

  conditions: publicProcedure
    .route({
      method: "GET",
      path: "/spots/{id}/conditions",
      summary: "When a spot works: forecast and tide hour by hour, checked against its criteria",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string(), days: z.coerce.number().int().min(1).max(7).default(3) }))
    .output(
      z.object({
        // The periods during which every criterion is met.
        windows: z.array(z.object({ start: z.date(), end: z.date() })),
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
            // The criteria this hour does not meet. Empty when the spot works.
            unmet: z.array(criterionSchema),
          }),
        ),
        forecastSource: z.object({
          name: z.string(),
          url: z.string(),
          attribution: z.string(),
          license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
        }),
        // Null when no tide station is close enough. Tide criteria are then never met.
        tideStation: z
          .object({
            id: z.string(),
            name: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            distanceKm: z.number(),
            datum: z.string(),
            source: z.object({ name: z.string(), url: z.string() }),
            license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
          })
          .nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await context.db.select().from(spot).where(eq(spot.id, input.id));
      if (!row || (row.visibility === "private" && row.userId !== context.session?.user.id)) {
        throw notFound(input.id);
      }

      const result = await Effect.runPromise(Effect.result(assessSpot(row, input.days)));
      if (Result.isFailure(result)) {
        console.error(result.failure);
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "The forecast provider did not answer. Try again in a moment.",
        });
      }
      if (!result.success) {
        throw new ORPCError("NOT_FOUND", { message: "No sea forecast for this spot." });
      }
      return result.success;
    }),
};
