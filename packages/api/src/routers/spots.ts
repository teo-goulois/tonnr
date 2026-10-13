import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { alert, alertSpot } from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { PUBLICATION_STATES, spot, spotPublication, surfBreak } from "@repo/db/schema/spots";
import { and, asc, count, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import {
  characteristicsInput,
  characteristicsSchema,
  describeCharacteristics,
  keptCharacteristics,
} from "../characteristics";
import { protectedProcedure } from "../index";
import { hasControlCharacter } from "../text";
import { type Transaction, forgetSeen } from "./alerts";

const MAX_SPOTS_PER_USER = 100;
// How many of an account's spots wait for an operator's answer at once.
const MAX_PENDING_PER_USER = 10;

const spotFields = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((name) => !hasControlCharacter(name), "must not contain control characters"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};

// What became of the owner's latest request to make the spot public: decision 034.
const publicationSchema = z.object({
  status: z.enum(PUBLICATION_STATES),
  // What the owner told the operator.
  note: z.string().nullable(),
  // Why the operator refused. Null otherwise.
  reason: z.string().nullable(),
  // The break of the catalogue the spot became. Null until it is accepted, and once that
  // break has left the catalogue.
  breakId: z.string().nullable(),
  requestedAt: z.date(),
  decidedAt: z.date().nullable(),
});

export const spotSchema = z.object({
  id: z.string(),
  // The catalogue break the spot was created from. Null for a point the user placed, and once
  // the break has left the catalogue.
  breakId: z.string().nullable(),
  ...spotFields,
  // What its owner says the spot is like, in the words the catalogue has for a break. Null
  // where they have not said.
  characteristics: characteristicsSchema,
  // The owner's latest request to make the spot public, and what was answered. Null for a spot
  // that was never asked to be: it is its owner's alone.
  publication: publicationSchema.nullable(),
  // The alerts the spot is in, the oldest first. None for a spot in none (decision 031).
  alertIds: z.array(z.string()),
  // Whether the caller owns the spot. The owner's identity is not exposed.
  isOwner: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// What the owner says the spot is like. Given, it stands for all that is said of the spot: a
// characteristic it leaves out is one they have not spoken of. Null says nothing at all.
const saidOfTheSpot = characteristicsInput.nullable();

const defaultedFields = {
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

type Publication = typeof spotPublication.$inferSelect;

function describePublication(row: Publication | undefined) {
  if (!row) return null;
  return {
    status: row.status,
    note: row.note,
    reason: row.reason,
    breakId: row.breakId,
    requestedAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

/** The latest request of each of these spots, by the spot's id. */
async function publicationsOf(db: Database | Transaction, spotIds: string[]) {
  const latest = new Map<string, Publication>();
  if (spotIds.length === 0) return latest;
  const rows = await db
    .select()
    .from(spotPublication)
    .where(inArray(spotPublication.spotId, spotIds))
    .orderBy(desc(spotPublication.createdAt), desc(spotPublication.id));
  for (const row of rows) if (!latest.has(row.spotId)) latest.set(row.spotId, row);
  return latest;
}

export function describeSpot(
  row: typeof spot.$inferSelect,
  userId: string | undefined,
  alertIds: string[],
  publication: Publication | undefined,
) {
  return {
    id: row.id,
    breakId: row.breakId,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    characteristics: describeCharacteristics(row.characteristics),
    publication: row.userId === userId ? describePublication(publication) : null,
    alertIds: row.userId === userId ? alertIds : [],
    isOwner: row.userId === userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// A spot that is not the caller's is reported as missing, so its existence stays private.
function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No spot "${id}".` });
}

// What a transaction answers to be started over.
const AGAIN = Symbol("again");

// The alerts spots are in, the oldest first, by spot.
async function alertsOf(
  db: Database | Transaction,
  where: { userId: string } | { spotId: string },
) {
  const rows = await db
    .select({ spotId: alertSpot.spotId, alertId: alertSpot.alertId })
    .from(alertSpot)
    .innerJoin(alert, eq(alert.id, alertSpot.alertId))
    .where("userId" in where ? eq(alert.userId, where.userId) : eq(alertSpot.spotId, where.spotId))
    .orderBy(asc(alert.createdAt), asc(alert.id));
  const bySpot = new Map<string, string[]>();
  for (const row of rows) bySpot.set(row.spotId, [...(bySpot.get(row.spotId) ?? []), row.alertId]);
  return bySpot;
}

/**
 * Holds a spot of the caller's, and before it the alerts it is in. Whatever writes to an alert's
 * spots holds the alert first, as the worker does for the whole of a look: two transactions
 * that took them in opposite orders would wait for one another, and one would be refused. The
 * alerts are held in the order of their ids, as whatever holds several does. They are read
 * before anything is held, so they are read again once all is: `AGAIN` when the spot joined or
 * left an alert meanwhile. Null for a spot the caller does not own.
 */
async function holdSpot(tx: Transaction, userId: string, id: string) {
  const itsAlerts = async () => {
    const rows = await tx
      .select({ alertId: alertSpot.alertId })
      .from(alertSpot)
      .innerJoin(spot, eq(spot.id, alertSpot.spotId))
      .where(and(eq(alertSpot.spotId, id), eq(spot.userId, userId)))
      .orderBy(asc(alertSpot.alertId));
    return rows.map((row) => row.alertId);
  };
  const alertIds = await itsAlerts();
  if (alertIds.length > 0) {
    await tx
      .select({ id: alert.id })
      .from(alert)
      .where(inArray(alert.id, alertIds))
      .orderBy(asc(alert.id))
      .for("update");
  }
  const [held] = await tx
    .select()
    .from(spot)
    .where(and(eq(spot.id, id), eq(spot.userId, userId)))
    .for("update");
  if (!held) return null;
  const now = await itsAlerts();
  const isSame = now.length === alertIds.length && now.every((one, at) => one === alertIds[at]);
  return isSame ? { spot: held, alertIds } : AGAIN;
}

/** Runs a change to a spot, and again when the spot's alerts changed as it was taken hold of. */
async function changingSpot<Result>(
  db: Database,
  change: (tx: Transaction) => Promise<Result | typeof AGAIN>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await db.transaction(change);
    if (result !== AGAIN) return result;
  }
  throw new ORPCError("CONFLICT", {
    message: "The spot's alerts were changed at the same moment. Try again.",
  });
}

export const spotsRouter = {
  create: protectedProcedure
    .meta({ analytics: "spot_created" })
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
      return describeSpot(created, userId, [], undefined);
    }),

  list: protectedProcedure
    .meta({
      mcp: {
        name: "list_my_spots",
        title: "The account's own spots",
        account: true,
        description:
          "The spots of the account you act for: the places it surfs, each with its name, " +
          "its `latitude` and `longitude`, what its owner says it is like (type of break, " +
          "bottom, the tides, swell and wind directions it likes, as in the catalogue of " +
          "breaks), the alerts it is in (`alertIds`) and whether its owner asked to make it " +
          "public. A spot is private: its owner alone reads it, so do not repeat its name " +
          "or its place to anyone else. Start here when the person asks about their spots: " +
          "then get_forecast and get_tide_extremes at a spot's `latitude` and `longitude`, " +
          "and list_my_alerts for the conditions they wait for there.",
      },
    })
    .route({ method: "GET", path: "/spots", summary: "The caller's spots", tags: ["Spots"] })
    .output(z.object({ spots: z.array(spotSchema) }))
    .handler(async ({ context }) => {
      const userId = context.session.user.id;
      const rows = await context.db
        .select()
        .from(spot)
        .where(eq(spot.userId, userId))
        .orderBy(asc(spot.createdAt));
      const alerts = await alertsOf(context.db, { userId });
      const publications = await publicationsOf(
        context.db,
        rows.map((row) => row.id),
      );
      return {
        spots: rows.map((row) =>
          describeSpot(row, userId, alerts.get(row.id) ?? [], publications.get(row.id)),
        ),
      };
    }),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/spots/{id}",
      summary: "One of the caller's spots",
      description:
        "A spot is its owner's alone. What is public of it is the break of the catalogue that " +
        "an operator made of it, at `GET /breaks/{id}`.",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string() }))
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const [row] = await context.db
        .select()
        .from(spot)
        .where(and(eq(spot.id, input.id), eq(spot.userId, userId)));
      if (!row) throw notFound(input.id);
      const alerts = await alertsOf(context.db, { spotId: row.id });
      const publications = await publicationsOf(context.db, [row.id]);
      return describeSpot(row, userId, alerts.get(row.id) ?? [], publications.get(row.id));
    }),

  update: protectedProcedure
    .meta({ analytics: "spot_updated" })
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
        if (held.alertIds.length > 0 && moved) {
          for (const alertId of held.alertIds) await forgetSeen(tx, alertId, id);
          await tx
            .update(alert)
            .set({ revision: sql`${alert.revision} + 1` })
            .where(inArray(alert.id, held.alertIds));
        }
        const alerts = await alertsOf(tx, { spotId: id });
        const publications = await publicationsOf(tx, [id]);
        return describeSpot(updated, userId, alerts.get(id) ?? [], publications.get(id));
      });
    }),

  requestPublication: protectedProcedure
    .meta({ analytics: "spot_publication_requested" })
    .route({
      method: "PUT",
      path: "/spots/{id}/publication",
      summary: "Ask that one of the caller's spots be made public",
      description:
        "The spot stays its owner's alone until an operator of the instance accepts: it then " +
        "becomes a break of the catalogue, with its name, its point and what its owner says " +
        "it is like, under the Open Database License. The spot's answer says what became of " +
        "the request, in `publication`. Asking again while a request waits changes its note. " +
        `An account has at most ${MAX_PENDING_PER_USER} spots waiting for an answer.`,
      tags: ["Spots"],
    })
    .input(
      z.object({
        id: z.string(),
        // What tells the operator that the spot is known to all.
        note: z
          .string()
          .trim()
          .max(280)
          .refine((note) => !hasControlCharacter(note), "must not contain control characters")
          .optional(),
      }),
    )
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const note = input.note || null;

      return context.db.transaction(async (tx) => {
        // Locking the account row makes its requests run one after the other, so two at once
        // cannot both pass the limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
        const [row] = await tx
          .select()
          .from(spot)
          .where(and(eq(spot.id, input.id), eq(spot.userId, userId)));
        if (!row) throw notFound(input.id);
        const alertIds = (await alertsOf(tx, { spotId: input.id })).get(input.id) ?? [];

        const latest = (await publicationsOf(tx, [input.id])).get(input.id);
        if (latest?.status === "accepted") {
          throw new ORPCError("CONFLICT", { message: "This spot is already public." });
        }
        if (latest?.status === "pending") {
          const [waiting] = await tx
            .update(spotPublication)
            .set({ note })
            .where(eq(spotPublication.id, latest.id))
            .returning();
          return describeSpot(row, userId, alertIds, waiting ?? latest);
        }

        const [pending] = await tx
          .select({ total: count() })
          .from(spotPublication)
          .where(and(eq(spotPublication.userId, userId), eq(spotPublication.status, "pending")));
        if ((pending?.total ?? 0) >= MAX_PENDING_PER_USER) {
          throw new ORPCError("FORBIDDEN", {
            message: `An account has at most ${MAX_PENDING_PER_USER} spots waiting for an answer.`,
          });
        }
        const [asked] = await tx
          .insert(spotPublication)
          .values({ id: crypto.randomUUID(), spotId: input.id, userId, note })
          .returning();
        return describeSpot(row, userId, alertIds, asked);
      });
    }),

  cancelPublication: protectedProcedure
    .meta({ analytics: "spot_publication_cancelled" })
    .route({
      method: "DELETE",
      path: "/spots/{id}/publication",
      summary: "Take back a request to make a spot public, while it waits",
      description:
        "A request that was answered stays as it is: a spot that became a break of the " +
        "catalogue is not taken out of it this way. Taking back a request that does not wait " +
        "changes nothing.",
      tags: ["Spots"],
    })
    .input(z.object({ id: z.string() }))
    .output(spotSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(spot)
          .where(and(eq(spot.id, input.id), eq(spot.userId, userId)));
        if (!row) throw notFound(input.id);
        const alertIds = (await alertsOf(tx, { spotId: input.id })).get(input.id) ?? [];
        await tx
          .delete(spotPublication)
          .where(and(eq(spotPublication.spotId, input.id), eq(spotPublication.status, "pending")));
        const publications = await publicationsOf(tx, [input.id]);
        return describeSpot(row, userId, alertIds, publications.get(input.id));
      });
    }),

  delete: protectedProcedure
    .meta({ analytics: "spot_deleted" })
    .route({
      method: "DELETE",
      path: "/spots/{id}",
      summary: "Delete a spot the caller owns",
      description:
        "The spot leaves its alerts. An alert whose last spot is deleted is deleted with it.",
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
        const [deleted] = await tx
          .delete(spot)
          .where(and(eq(spot.id, input.id), eq(spot.userId, userId)))
          .returning({ id: spot.id });
        if (!deleted) throw notFound(input.id);

        if (held.alertIds.length > 0) {
          // An alert set on nothing is no alert. One that keeps other spots is read anew.
          await tx
            .delete(alert)
            .where(
              and(
                inArray(alert.id, held.alertIds),
                notExists(
                  tx
                    .select({ spotId: alertSpot.spotId })
                    .from(alertSpot)
                    .where(eq(alertSpot.alertId, alert.id)),
                ),
              ),
            );
          await tx
            .update(alert)
            .set({ revision: sql`${alert.revision} + 1` })
            .where(inArray(alert.id, held.alertIds));
        }
        return deleted;
      });
    }),
};
