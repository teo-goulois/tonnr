import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { user } from "@repo/db/schema/auth";
import { station } from "@repo/db/schema/buoys";
import {
  stationList,
  stationListBreak,
  stationListItem,
  stationListMember,
  stationListShare,
  stationListSpot,
} from "@repo/db/schema/lists";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { hashPassword, newToken } from "../shares";
import { hasControlCharacter } from "../text";
import { describeSpot, spotSchema } from "./spots";

// The favorites are not counted: they are created on their own, the first time they are used.
const MAX_LISTS_PER_USER = 50;
const MAX_STATIONS_PER_LIST = 200;
const MAX_BREAKS_PER_LIST = 200;
// As many as an account holds.
const MAX_SPOTS_PER_LIST = 100;

// In place of a list's id, the caller's default list. No list has it as its id: ids are UUIDs.
const FAVORITES = "favorites";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// The password a link may ask for. It is the owner's to choose: a word friends are told.
const passwordSchema = z.string().min(4).max(72);

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((name) => !hasControlCharacter(name), "must not contain control characters");

const listIdSchema = z
  .string()
  .describe(`A list's id, or "${FAVORITES}" for the caller's default list.`);

const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  // True for the favorites. A client shows them under a label of its own.
  isDefault: z.boolean(),
  // In the order the stations were added.
  stationIds: z.array(z.string()),
  // The surf breaks of the catalogue the list holds, in the order they were added.
  breakIds: z.array(z.string()),
  // The caller's own spots the list holds, in the order they were added.
  spotIds: z.array(z.string()),
  // The link the list is shared by, which whoever has it reads the list with. Null for a list
  // that is its owner's alone. Decision 035.
  share: z
    .object({
      // What the link ends with: the web app's address for it is `/app?shared=<token>`.
      token: z.string(),
      hasPassword: z.boolean(),
      // How many accounts opened the link and kept the list.
      members: z.number(),
    })
    .nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

type ShareInfo = { token: string; hasPassword: boolean; members: number };

/** What a list holds, each kind by its ids in the order they were added, and how it is shared. */
type Held = {
  stationIds: string[];
  breakIds: string[];
  spotIds: string[];
  share: ShareInfo | null;
};

const NOTHING: Held = { stationIds: [], breakIds: [], spotIds: [], share: null };

/**
 * A list as whoever may read it does: its owner, an account that kept it, or whoever has its
 * link. Its stations and its breaks come by their ids, as in a list of one's own. Its spots
 * come whole: they are their owner's, and no other route answers them.
 */
export const listViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  // True for its owner's favorites. A client shows them under a label of its own.
  isDefault: z.boolean(),
  // How the caller reads it.
  access: z.enum(["owner", "member", "link"]),
  stationIds: z.array(z.string()),
  breakIds: z.array(z.string()),
  spots: z.array(spotSchema),
});

function describeList(row: typeof stationList.$inferSelect, held: Held) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    stationIds: held.stationIds,
    breakIds: held.breakIds,
    spotIds: held.spotIds,
    share: held.share,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// A list that is not the caller's is reported as missing, so its existence stays private.
function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No list "${id}".` });
}

function isCallersList(userId: string, id: string) {
  return and(
    eq(stationList.userId, userId),
    id === FAVORITES ? eq(stationList.isDefault, true) : eq(stationList.id, id),
  );
}

// Locking the list makes the changes to what it holds run one after the other, so two requests at
// once cannot both pass a limit, and each answers with the list as it left it.
async function lockList(tx: Transaction, userId: string, id: string) {
  const [row] = await tx.select().from(stationList).where(isCallersList(userId, id)).for("update");
  return row;
}

async function stationIdsOf(db: Database | Transaction, listId: string) {
  const items = await db
    .select({ stationId: stationListItem.stationId })
    .from(stationListItem)
    .where(eq(stationListItem.listId, listId))
    .orderBy(asc(stationListItem.createdAt), asc(stationListItem.stationId));
  return items.map((item) => item.stationId);
}

async function breakIdsOf(db: Database | Transaction, listId: string) {
  const items = await db
    .select({ breakId: stationListBreak.breakId })
    .from(stationListBreak)
    .where(eq(stationListBreak.listId, listId))
    .orderBy(asc(stationListBreak.createdAt), asc(stationListBreak.breakId));
  return items.map((item) => item.breakId);
}

async function spotIdsOf(db: Database | Transaction, listId: string) {
  const items = await db
    .select({ spotId: stationListSpot.spotId })
    .from(stationListSpot)
    .where(eq(stationListSpot.listId, listId))
    .orderBy(asc(stationListSpot.createdAt), asc(stationListSpot.spotId));
  return items.map((item) => item.spotId);
}

async function shareInfoOf(db: Database | Transaction, listId: string): Promise<ShareInfo | null> {
  const [share] = await db
    .select()
    .from(stationListShare)
    .where(eq(stationListShare.listId, listId));
  if (!share) return null;
  const [kept] = await db
    .select({ total: count() })
    .from(stationListMember)
    .where(eq(stationListMember.listId, listId));
  return {
    token: share.token,
    hasPassword: share.passwordHash !== null,
    members: kept?.total ?? 0,
  };
}

async function heldBy(db: Database | Transaction, listId: string): Promise<Held> {
  return {
    stationIds: await stationIdsOf(db, listId),
    breakIds: await breakIdsOf(db, listId),
    spotIds: await spotIdsOf(db, listId),
    share: await shareInfoOf(db, listId),
  };
}

/** A list as one who may read it does. `userId` is the reader's account, when they have one. */
export async function viewOf(
  db: Database | Transaction,
  list: typeof stationList.$inferSelect,
  access: "owner" | "member" | "link",
  userId: string | undefined,
) {
  const held = await heldBy(db, list.id);
  const rows =
    held.spotIds.length > 0
      ? await db.select().from(spot).where(inArray(spot.id, held.spotIds))
      : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
    access,
    stationIds: held.stationIds,
    breakIds: held.breakIds,
    // Nothing of an alert or of a request to publish goes with a spot here: they are read on
    // the spot itself, by its owner.
    spots: held.spotIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [describeSpot(row, userId, [], undefined)] : [];
    }),
  };
}

// The list to add to, locked. The favorites exist from the first thing saved: of two requests at
// once, the unique index lets one create them, and the other waits for it, then finds them.
async function lockListToFill(tx: Transaction, userId: string, id: string) {
  const list = await lockList(tx, userId, id);
  if (list || id !== FAVORITES) return list;
  await tx
    .insert(stationList)
    .values({ id: crypto.randomUUID(), userId, name: "Favorites", isDefault: true })
    .onConflictDoNothing();
  return lockList(tx, userId, id);
}

// A list changes when what it holds does.
async function touch(tx: Transaction, list: typeof stationList.$inferSelect) {
  const [touched] = await tx
    .update(stationList)
    .set({ updatedAt: new Date() })
    .where(eq(stationList.id, list.id))
    .returning();
  return touched ?? list;
}

export const listsRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/lists",
      summary: "The caller's lists of stations, surf breaks and spots, the favorites first",
      tags: ["Lists"],
    })
    .output(
      z.object({
        lists: z.array(listSchema),
        // The lists of other accounts that the caller opened by their link and kept, in the
        // order they were kept. Each is read at `GET /lists/{id}/view`.
        joined: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            isDefault: z.boolean(),
            // How many things it holds, of every kind.
            size: z.number(),
          }),
        ),
      }),
    )
    .handler(async ({ context }) => {
      const userId = context.session.user.id;
      const rows = await context.db
        .select()
        .from(stationList)
        .where(eq(stationList.userId, userId))
        .orderBy(desc(stationList.isDefault), asc(stationList.createdAt), asc(stationList.id));
      const items = await context.db
        .select({ listId: stationListItem.listId, stationId: stationListItem.stationId })
        .from(stationListItem)
        .innerJoin(stationList, eq(stationList.id, stationListItem.listId))
        .where(eq(stationList.userId, userId))
        .orderBy(asc(stationListItem.createdAt), asc(stationListItem.stationId));

      const breaks = await context.db
        .select({ listId: stationListBreak.listId, breakId: stationListBreak.breakId })
        .from(stationListBreak)
        .innerJoin(stationList, eq(stationList.id, stationListBreak.listId))
        .where(eq(stationList.userId, userId))
        .orderBy(asc(stationListBreak.createdAt), asc(stationListBreak.breakId));

      const spots = await context.db
        .select({ listId: stationListSpot.listId, spotId: stationListSpot.spotId })
        .from(stationListSpot)
        .innerJoin(stationList, eq(stationList.id, stationListSpot.listId))
        .where(eq(stationList.userId, userId))
        .orderBy(asc(stationListSpot.createdAt), asc(stationListSpot.spotId));

      const itemsByList = Map.groupBy(items, (item) => item.listId);
      const breaksByList = Map.groupBy(breaks, (item) => item.listId);
      const spotsByList = Map.groupBy(spots, (item) => item.listId);

      const lists = [];
      for (const row of rows) {
        lists.push(
          describeList(row, {
            stationIds: (itemsByList.get(row.id) ?? []).map((item) => item.stationId),
            breakIds: (breaksByList.get(row.id) ?? []).map((item) => item.breakId),
            spotIds: (spotsByList.get(row.id) ?? []).map((item) => item.spotId),
            share: await shareInfoOf(context.db, row.id),
          }),
        );
      }

      const kept = await context.db
        .select({ list: stationList })
        .from(stationListMember)
        .innerJoin(stationList, eq(stationList.id, stationListMember.listId))
        .where(eq(stationListMember.userId, userId))
        .orderBy(asc(stationListMember.createdAt), asc(stationList.id));
      const joined = [];
      for (const { list } of kept) {
        const held = await heldBy(context.db, list.id);
        joined.push({
          id: list.id,
          name: list.name,
          isDefault: list.isDefault,
          size: held.stationIds.length + held.breakIds.length + held.spotIds.length,
        });
      }
      return { lists, joined };
    }),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/lists",
      successStatus: 201,
      summary: "Create a list",
      tags: ["Lists"],
    })
    .input(z.object({ name: nameSchema }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const created = await context.db.transaction(async (tx) => {
        // Locking the account row makes its creations run one after the other, so two requests
        // at once cannot both pass the limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");

        const [owned] = await tx
          .select({ total: count() })
          .from(stationList)
          .where(and(eq(stationList.userId, userId), eq(stationList.isDefault, false)));
        if ((owned?.total ?? 0) >= MAX_LISTS_PER_USER) return null;

        const [row] = await tx
          .insert(stationList)
          .values({ id: crypto.randomUUID(), userId, name: input.name })
          .returning();
        return row;
      });
      if (created === null) {
        throw new ORPCError("FORBIDDEN", {
          message: `An account holds at most ${MAX_LISTS_PER_USER} lists besides its favorites.`,
        });
      }
      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return describeList(created, NOTHING);
    }),

  update: protectedProcedure
    .route({
      method: "PATCH",
      path: "/lists/{id}",
      summary: "Rename a list the caller owns",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, name: nameSchema }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const [row] = await context.db
        .select({ id: stationList.id, isDefault: stationList.isDefault })
        .from(stationList)
        .where(isCallersList(userId, input.id));
      if (!row) throw notFound(input.id);
      // A client shows the favorites under a label of its own, in the reader's language.
      if (row.isDefault) {
        throw new ORPCError("FORBIDDEN", { message: "The favorites cannot be renamed." });
      }

      const [updated] = await context.db
        .update(stationList)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(stationList.id, row.id))
        .returning();
      if (!updated) throw notFound(input.id);
      return describeList(updated, await heldBy(context.db, updated.id));
    }),

  delete: protectedProcedure
    .route({
      method: "DELETE",
      path: "/lists/{id}",
      summary: "Delete a list the caller owns",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select({ id: stationList.id, isDefault: stationList.isDefault })
        .from(stationList)
        .where(isCallersList(context.session.user.id, input.id));
      if (!row) throw notFound(input.id);
      if (row.isDefault) {
        throw new ORPCError("FORBIDDEN", { message: "The favorites cannot be deleted." });
      }

      await context.db.delete(stationList).where(eq(stationList.id, row.id));
      return { id: row.id };
    }),

  addStation: protectedProcedure
    .route({
      method: "PUT",
      path: "/lists/{id}/stations/{stationId}",
      summary: "Add a station to one of the caller's lists",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, stationId: z.string() }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      // Checked first, so that an unknown station does not create the favorites.
      const [known] = await context.db
        .select({ id: station.id })
        .from(station)
        .where(eq(station.id, input.stationId));
      if (!known) throw new ORPCError("NOT_FOUND", { message: `No station "${input.stationId}".` });

      return context.db.transaction(async (tx) => {
        const list = await lockListToFill(tx, userId, input.id);
        if (!list) throw notFound(input.id);

        const held = await heldBy(tx, list.id);
        // Adding a station twice changes nothing, even in a full list.
        if (held.stationIds.includes(input.stationId)) return describeList(list, held);
        if (held.stationIds.length >= MAX_STATIONS_PER_LIST) {
          throw new ORPCError("FORBIDDEN", {
            message: `A list holds at most ${MAX_STATIONS_PER_LIST} stations.`,
          });
        }

        // The time of the insertion, not of the start of the transaction: a request that began
        // earlier may get the lock later, and its station comes after.
        await tx.insert(stationListItem).values({
          listId: list.id,
          stationId: input.stationId,
          createdAt: sql`clock_timestamp()`,
        });
        return describeList(await touch(tx, list), {
          ...held,
          stationIds: [...held.stationIds, input.stationId],
        });
      });
    }),

  removeStation: protectedProcedure
    .route({
      method: "DELETE",
      path: "/lists/{id}/stations/{stationId}",
      summary: "Remove a station from one of the caller's lists",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, stationId: z.string() }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      return context.db.transaction(async (tx) => {
        const list = await lockList(tx, userId, input.id);
        if (!list) throw notFound(input.id);

        // Removing a station that is not in the list changes nothing.
        const [removed] = await tx
          .delete(stationListItem)
          .where(
            and(
              eq(stationListItem.listId, list.id),
              eq(stationListItem.stationId, input.stationId),
            ),
          )
          .returning({ stationId: stationListItem.stationId });
        return describeList(removed ? await touch(tx, list) : list, await heldBy(tx, list.id));
      });
    }),

  addBreak: protectedProcedure
    .route({
      method: "PUT",
      path: "/lists/{id}/breaks/{breakId}",
      summary: "Add a surf break of the catalogue to one of the caller's lists",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, breakId: z.string() }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      // Checked first, so that an unknown break does not create the favorites.
      const [known] = await context.db
        .select({ id: surfBreak.id })
        .from(surfBreak)
        .where(eq(surfBreak.id, input.breakId));
      if (!known) throw new ORPCError("NOT_FOUND", { message: `No break "${input.breakId}".` });

      return context.db.transaction(async (tx) => {
        const list = await lockListToFill(tx, userId, input.id);
        if (!list) throw notFound(input.id);

        const held = await heldBy(tx, list.id);
        // Adding a break twice changes nothing, even in a full list.
        if (held.breakIds.includes(input.breakId)) return describeList(list, held);
        if (held.breakIds.length >= MAX_BREAKS_PER_LIST) {
          throw new ORPCError("FORBIDDEN", {
            message: `A list holds at most ${MAX_BREAKS_PER_LIST} surf breaks.`,
          });
        }

        // The time of the insertion, as for a station: the break of a request that got the lock
        // later comes after.
        await tx.insert(stationListBreak).values({
          listId: list.id,
          breakId: input.breakId,
          createdAt: sql`clock_timestamp()`,
        });
        return describeList(await touch(tx, list), {
          ...held,
          breakIds: [...held.breakIds, input.breakId],
        });
      });
    }),

  removeBreak: protectedProcedure
    .route({
      method: "DELETE",
      path: "/lists/{id}/breaks/{breakId}",
      summary: "Remove a surf break from one of the caller's lists",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, breakId: z.string() }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      return context.db.transaction(async (tx) => {
        const list = await lockList(tx, userId, input.id);
        if (!list) throw notFound(input.id);

        // Removing a break that is not in the list changes nothing.
        const [removed] = await tx
          .delete(stationListBreak)
          .where(
            and(eq(stationListBreak.listId, list.id), eq(stationListBreak.breakId, input.breakId)),
          )
          .returning({ breakId: stationListBreak.breakId });
        return describeList(removed ? await touch(tx, list) : list, await heldBy(tx, list.id));
      });
    }),

  addSpot: protectedProcedure
    .route({
      method: "PUT",
      path: "/lists/{id}/spots/{spotId}",
      summary: "Add one of the caller's spots to one of their lists",
      description:
        "A list holds spots of its owner's alone. A spot that is someone else's is reported as " +
        "missing, as it is everywhere.",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, spotId: z.string() }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      return context.db.transaction(async (tx) => {
        // The spot is held until it is in the list, so that it is not deleted meanwhile. It is
        // looked for first: a spot that is not the caller's creates no favorites.
        const [own] = await tx
          .select({ id: spot.id })
          .from(spot)
          .where(and(eq(spot.id, input.spotId), eq(spot.userId, userId)))
          .for("share");
        if (!own) throw new ORPCError("NOT_FOUND", { message: `No spot "${input.spotId}".` });

        const list = await lockListToFill(tx, userId, input.id);
        if (!list) throw notFound(input.id);

        const held = await heldBy(tx, list.id);
        // Adding a spot twice changes nothing, even in a full list.
        if (held.spotIds.includes(input.spotId)) return describeList(list, held);
        if (held.spotIds.length >= MAX_SPOTS_PER_LIST) {
          throw new ORPCError("FORBIDDEN", {
            message: `A list holds at most ${MAX_SPOTS_PER_LIST} spots.`,
          });
        }

        // The time of the insertion, as for a station: the spot of a request that got the lock
        // later comes after.
        await tx.insert(stationListSpot).values({
          listId: list.id,
          spotId: input.spotId,
          createdAt: sql`clock_timestamp()`,
        });
        return describeList(await touch(tx, list), {
          ...held,
          spotIds: [...held.spotIds, input.spotId],
        });
      });
    }),

  removeSpot: protectedProcedure
    .route({
      method: "DELETE",
      path: "/lists/{id}/spots/{spotId}",
      summary: "Remove a spot from one of the caller's lists",
      description:
        "The spot itself stays: it leaves the list, and is deleted by `DELETE /spots/{id}`.",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, spotId: z.string() }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      return context.db.transaction(async (tx) => {
        const list = await lockList(tx, userId, input.id);
        if (!list) throw notFound(input.id);

        // Removing a spot that is not in the list changes nothing.
        const [removed] = await tx
          .delete(stationListSpot)
          .where(and(eq(stationListSpot.listId, list.id), eq(stationListSpot.spotId, input.spotId)))
          .returning({ spotId: stationListSpot.spotId });
        return describeList(removed ? await touch(tx, list) : list, await heldBy(tx, list.id));
      });
    }),

  share: protectedProcedure
    .route({
      method: "PUT",
      path: "/lists/{id}/share",
      summary: "Share one of the caller's lists by a link, or change its password",
      description:
        "Whoever has the link reads the list: its stations, its breaks, and the owner's spots " +
        "in it, which no one else reads otherwise. They need no account. The first call makes " +
        "the link, and a later one keeps it. `password`, when given, is asked of whoever " +
        "opens the link from then on, and null asks none. Left out, it stays as it is. " +
        "Decision 035.",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema, password: passwordSchema.nullable().optional() }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const list = await lockList(tx, userId, input.id);
        if (!list) throw notFound(input.id);

        const passwordHash =
          input.password === undefined
            ? undefined
            : input.password === null
              ? null
              : hashPassword(input.password);
        await tx
          .insert(stationListShare)
          .values({ listId: list.id, token: newToken(), passwordHash: passwordHash ?? null })
          .onConflictDoUpdate({
            target: stationListShare.listId,
            // A password that changes starts the count of wrong ones again.
            set:
              passwordHash === undefined
                ? { listId: list.id }
                : { passwordHash, wrongPasswords: 0, wrongSince: null },
          });
        return describeList(list, await heldBy(tx, list.id));
      });
    }),

  renewShare: protectedProcedure
    .route({
      method: "POST",
      path: "/lists/{id}/share/renew",
      summary: "Give a shared list a new link, which ends the one before",
      description:
        "The link before opens nothing from then on. The password stays, and so do the " +
        "accounts that kept the list: `DELETE /lists/{id}/share` is what ends it for all.",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const list = await lockList(tx, userId, input.id);
        if (!list) throw notFound(input.id);
        const [renewed] = await tx
          .update(stationListShare)
          .set({ token: newToken(), wrongPasswords: 0, wrongSince: null })
          .where(eq(stationListShare.listId, list.id))
          .returning({ listId: stationListShare.listId });
        if (!renewed) {
          throw new ORPCError("CONFLICT", { message: "This list is not shared." });
        }
        return describeList(list, await heldBy(tx, list.id));
      });
    }),

  unshare: protectedProcedure
    .route({
      method: "DELETE",
      path: "/lists/{id}/share",
      summary: "Stop sharing a list",
      description:
        "Its link opens nothing from then on, and the accounts that kept the list no longer " +
        "read it. Stopping what is not shared changes nothing.",
      tags: ["Lists"],
    })
    .input(z.object({ id: listIdSchema }))
    .output(listSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const list = await lockList(tx, userId, input.id);
        if (!list) throw notFound(input.id);
        await tx.delete(stationListShare).where(eq(stationListShare.listId, list.id));
        await tx.delete(stationListMember).where(eq(stationListMember.listId, list.id));
        return describeList(list, await heldBy(tx, list.id));
      });
    }),

  view: protectedProcedure
    .route({
      method: "GET",
      path: "/lists/{id}/view",
      summary: "A list with its spots, for its owner or an account that kept it",
      description:
        "What `POST /shared/open` answers to whoever has the list's link, for an account that " +
        "needs the link no more: the list's owner, and an account that kept it. A list that " +
        "is neither's is reported as missing.",
      tags: ["Lists"],
    })
    .input(z.object({ id: z.string() }))
    .output(listViewSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const [list] = await context.db
        .select()
        .from(stationList)
        .where(eq(stationList.id, input.id));
      if (!list) throw notFound(input.id);
      if (list.userId === userId) return viewOf(context.db, list, "owner", userId);

      const [kept] = await context.db
        .select({ listId: stationListMember.listId })
        .from(stationListMember)
        .where(and(eq(stationListMember.listId, list.id), eq(stationListMember.userId, userId)));
      if (!kept) throw notFound(input.id);
      return viewOf(context.db, list, "member", userId);
    }),

  leave: protectedProcedure
    .route({
      method: "DELETE",
      path: "/lists/{id}/membership",
      summary: "Let go of a list of someone else's that the caller kept",
      description: "Letting go of a list that was not kept changes nothing.",
      tags: ["Lists"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      await context.db
        .delete(stationListMember)
        .where(
          and(
            eq(stationListMember.listId, input.id),
            eq(stationListMember.userId, context.session.user.id),
          ),
        );
      return { id: input.id };
    }),
};
