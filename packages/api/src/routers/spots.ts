import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { alert, alertSpot } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { and, asc, count, eq, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import {
  characteristicsInput,
  characteristicsSchema,
  describeCharacteristics,
  keptCharacteristics,
} from "../characteristics";
import { type Caller, callerProcedure, protectedProcedure } from "../index";
import { hasControlCharacter } from "../text";
import { type Transaction, forgetSeen } from "./alerts";

const MAX_SPOTS_PER_USER = 100;

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
};

const spotSchema = z.object({
  id: z.string(),
  // The catalogue break the spot was created from. Null for a point the user placed, and once
  // the break has left the catalogue.
  breakId: z.string().nullable(),
  ...spotFields,
  // What its owner says the spot is like, in the words the catalogue has for a break. Null
  // where they have not said.
  characteristics: characteristicsSchema,
  // The alert the spot is in, for its owner. Null for a spot in none, and for anyone else:
  // an alert is its owner's alone (decision 031).
  alertId: z.string().nullable(),
  // Whether the caller owns the spot. The owner's identity is not exposed.
  isOwner: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// What the owner says the spot is like. Given, it stands for all that is said of the spot: a
// characteristic it leaves out is one they have not spoken of. Null says nothing at all.
const saidOfTheSpot = characteristicsInput.nullable();

const defaultedFields = {
  visibility: spotFields.visibility.default("private"),
  characteristics: saidOfTheSpot.default(null),
};
// A spot starts from a break of the catalogue, or from a point of the caller's own.
const fromBreakSchema = z.object({
  breakId: z.uuid(),
  name: spotFields.name.optional(),
  latitude: spotFields.latitude.optional(),
  longitude: spotFields.longitude.optional(),
  ...defaultedFields,
});
const fromPointSchema = z.object({
  // Left out or null: anything else is a break that the first form would have taken.
  breakId: z.null().optional(),
  name: spotFields.name,
  latitude: spotFields.latitude,
  longitude: spotFields.longitude,
  ...defaultedFields,
});

function describeSpot(
  row: typeof spot.$inferSelect,
  userId: string | undefined,
  alertId: string | null,
) {
  return {
    id: row.id,
    breakId: row.breakId,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    visibility: row.visibility,
    characteristics: describeCharacteristics(row.characteristics),
    alertId: row.userId === userId ? alertId : null,
    isOwner: row.userId === userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// A private spot that is not the caller's is reported as missing, so its existence stays private.
// The account a caller is. A key is no account, so it sees a spot as a stranger does.
function accountOf(caller: Caller) {
  return caller.via === "session" ? caller.userId : undefined;
}

function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No spot "${id}".` });
}

// What a transaction answers to be started over.
const AGAIN = Symbol("again");

/**
 * Holds a spot of the caller's, and before it the alert it is in. Whatever writes to an alert's
 * spots holds the alert first, as the worker does for the whole of a look: two transactions
 * that took them in opposite orders would wait for one another, and one would be refused. The
 * spot's alert is read before anything is held, so it is read again once both are: `AGAIN` when
 * the spot joined or left an alert meanwhile. Null for a spot the caller does not own.
 */
async function holdSpot(tx: Transaction, userId: string, id: string) {
  const itsAlert = async () => {
    const [membership] = await tx
      .select({ alertId: alertSpot.alertId })
      .from(alertSpot)
      .innerJoin(spot, eq(spot.id, alertSpot.spotId))
      .where(and(eq(alertSpot.spotId, id), eq(spot.userId, userId)));
    return membership?.alertId ?? null;
  };
  const alertId = await itsAlert();
  if (alertId)
    await tx.select({ id: alert.id }).from(alert).where(eq(alert.id, alertId)).for("update");
  const [held] = await tx
    .select()
    .from(spot)
    .where(and(eq(spot.id, id), eq(spot.userId, userId)))
    .for("update");
  if (!held) return null;
  return (await itsAlert()) === alertId ? { spot: held, alertId } : AGAIN;
}

/** Runs a change to a spot, and again when the spot's alert changed as it was taken hold of. */
async function changingSpot<Result>(
  db: Database,
  change: (tx: Transaction) => Promise<Result | typeof AGAIN>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await db.transaction(change);
    if (result !== AGAIN) return result;
  }
  throw new ORPCError("CONFLICT", {
    message: "The spot's alert was changed at the same moment. Try again.",
  });
}

export const spotsRouter = {
  create: protectedProcedure
    .route({
      method: "POST",
      path: "/spots",
      successStatus: 201,
      summary: "Save a spot: a place of the caller's own, with a name",
      description:
        "The spot starts from a break of the catalogue, or from a point of the caller's own. " +
        "From a break it takes the name and the point, unless the request gives others. It then " +
        "keeps them as its own: a later change to the break does not move the spot. It takes " +
        "nothing of what the catalogue says the break is like: `characteristics` are what the " +
        "owner says, and null until they do.",
      tags: ["Spots"],
    })
    .input(z.union([fromBreakSchema, fromPointSchema]))
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { breakId, characteristics, ...fields } = input;

      const created = await context.db.transaction(async (tx) => {
        // Locking the account row makes its creations run one after the other, so two requests
        // at once cannot both pass the limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");

        const [owned] = await tx
          .select({ total: count() })
          .from(spot)
          .where(eq(spot.userId, userId));
        if ((owned?.total ?? 0) >= MAX_SPOTS_PER_USER) return null;

        // The break is held until the spot is written, so an import cannot delete it meanwhile.
        const [origin] = breakId
          ? await tx.select().from(surfBreak).where(eq(surfBreak.id, breakId)).for("share")
          : [];
        if (breakId && !origin) {
          throw new ORPCError("NOT_FOUND", { message: `No break "${breakId}".` });
        }
        const name = fields.name ?? origin?.name;
        const latitude = fields.latitude ?? origin?.latitude;
        const longitude = fields.longitude ?? origin?.longitude;
        if (name === undefined || latitude === undefined || longitude === undefined) {
          throw new ORPCError("BAD_REQUEST");
        }

        const [row] = await tx
          .insert(spot)
          .values({
            ...fields,
            characteristics: keptCharacteristics(characteristics),
            id: crypto.randomUUID(),
            userId,
            breakId: origin?.id ?? null,
            name,
            latitude,
            longitude,
          })
          .returning();
        return row;
      });
      if (created === null) {
        throw new ORPCError("FORBIDDEN", {
          message: `An account holds at most ${MAX_SPOTS_PER_USER} spots.`,
        });
      }
      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return describeSpot(created, userId, null);
    }),

  list: protectedProcedure
    .route({ method: "GET", path: "/spots", summary: "The caller's spots", tags: ["Spots"] })
    .output(z.object({ spots: z.array(spotSchema) }))
    .handler(async ({ context }) => {
      const userId = context.session.user.id;
      const rows = await context.db
        .select({ spot, alertId: alertSpot.alertId })
        .from(spot)
        .leftJoin(alertSpot, eq(alertSpot.spotId, spot.id))
        .where(eq(spot.userId, userId))
        .orderBy(asc(spot.createdAt));
      return { spots: rows.map((row) => describeSpot(row.spot, userId, row.alertId)) };
    }),

  get: callerProcedure
    .route({
      method: "GET",
      path: "/spots/{id}",
      summary: "One spot, if it is public or the caller's",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string() }))
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = accountOf(context.caller);
      const [row] = await context.db
        .select({ spot, alertId: alertSpot.alertId })
        .from(spot)
        .leftJoin(alertSpot, eq(alertSpot.spotId, spot.id))
        .where(eq(spot.id, input.id));
      if (!row || (row.spot.visibility === "private" && row.spot.userId !== userId)) {
        throw notFound(input.id);
      }
      return describeSpot(row.spot, userId, row.alertId);
    }),

  update: protectedProcedure
    .route({
      method: "PATCH",
      path: "/spots/{id}",
      summary: "Change a spot the caller owns",
      description:
        "What is left out stays as it is. `characteristics`, when given, replaces all that was " +
        "said of the spot, and null clears it.",
      tags: ["Spots"],
    })
    .input(
      z.object({
        id: z.string(),
        ...z.object(spotFields).partial().shape,
        characteristics: saidOfTheSpot.optional(),
      }),
    )
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { id, characteristics, ...changes } = input;
      return changingSpot(context.db, async (tx) => {
        const held = await holdSpot(tx, userId, id);
        if (held === AGAIN) return AGAIN;
        if (!held) throw notFound(id);
        const before = held.spot;

        const [updated] = await tx
          .update(spot)
          .set({
            ...changes,
            // Left out, what was said of the spot stays.
            ...(characteristics === undefined
              ? {}
              : { characteristics: keptCharacteristics(characteristics) }),
            updatedAt: new Date(),
          })
          .where(eq(spot.id, id))
          .returning();
        if (!updated) throw notFound(id);

        // A spot that moved is another place to its alert: what was seen and told of the sea
        // where it stood is forgotten, and a look that read the forecast of the old place
        // writes nothing.
        const moved =
          updated.latitude !== before.latitude || updated.longitude !== before.longitude;
        if (held.alertId && moved) {
          await forgetSeen(tx, held.alertId, id);
          await tx
            .update(alert)
            .set({ revision: sql`${alert.revision} + 1` })
            .where(eq(alert.id, held.alertId));
        }
        return describeSpot(updated, userId, held.alertId);
      });
    }),

  delete: protectedProcedure
    .route({
      method: "DELETE",
      path: "/spots/{id}",
      summary: "Delete a spot the caller owns",
      description:
        "The spot leaves its alert. An alert whose last spot is deleted is deleted with it.",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return changingSpot(context.db, async (tx) => {
        const held = await holdSpot(tx, userId, input.id);
        if (held === AGAIN) return AGAIN;
        if (!held) throw notFound(input.id);
        const membership = held.alertId ? { alertId: held.alertId } : null;
        const [deleted] = await tx
          .delete(spot)
          .where(and(eq(spot.id, input.id), eq(spot.userId, userId)))
          .returning({ id: spot.id });
        if (!deleted) throw notFound(input.id);

        if (membership) {
          // An alert set on nothing is no alert. One that keeps other spots is read anew.
          const emptied = await tx
            .delete(alert)
            .where(
              and(
                eq(alert.id, membership.alertId),
                notExists(
                  tx
                    .select({ spotId: alertSpot.spotId })
                    .from(alertSpot)
                    .where(eq(alertSpot.alertId, alert.id)),
                ),
              ),
            )
            .returning({ id: alert.id });
          if (emptied.length === 0) {
            await tx
              .update(alert)
              .set({ revision: sql`${alert.revision} + 1` })
              .where(eq(alert.id, membership.alertId));
          }
        }
        return deleted;
      });
    }),
};
