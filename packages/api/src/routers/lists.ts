import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { user } from "@repo/db/schema/auth";
import { station } from "@repo/db/schema/buoys";
import { stationList, stationListItem } from "@repo/db/schema/lists";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { hasControlCharacter } from "../text";

// The favorites are not counted: they are created on their own, the first time they are used.
const MAX_LISTS_PER_USER = 50;
const MAX_STATIONS_PER_LIST = 200;

// In place of a list's id, the caller's default list. No list has it as its id: ids are UUIDs.
const FAVORITES = "favorites";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
  createdAt: z.date(),
  updatedAt: z.date(),
});

function describeList(row: typeof stationList.$inferSelect, stationIds: string[]) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    stationIds,
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

// Locking the list makes the changes to its stations run one after the other, so two requests at
// once cannot both pass the limit, and each answers with the list as it left it.
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

// A list changes when its stations do.
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
      summary: "The caller's lists of stations, the favorites first",
      tags: ["Lists"],
    })
    .output(z.object({ lists: z.array(listSchema) }))
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

      const itemsByList = Map.groupBy(items, (item) => item.listId);
      return {
        lists: rows.map((row) =>
          describeList(
            row,
            (itemsByList.get(row.id) ?? []).map((item) => item.stationId),
          ),
        ),
      };
    }),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/lists",
      successStatus: 201,
      summary: "Create a list of stations",
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
      return describeList(created, []);
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
      return describeList(updated, await stationIdsOf(context.db, updated.id));
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
        let list = await lockList(tx, userId, input.id);
        if (!list && input.id === FAVORITES) {
          // The favorites exist from the first station saved. Of two requests at once, the unique
          // index lets one create them, and the other waits for it, then finds them.
          await tx
            .insert(stationList)
            .values({ id: crypto.randomUUID(), userId, name: "Favorites", isDefault: true })
            .onConflictDoNothing();
          list = await lockList(tx, userId, input.id);
        }
        if (!list) throw notFound(input.id);

        const stationIds = await stationIdsOf(tx, list.id);
        // Adding a station twice changes nothing, even in a full list.
        if (stationIds.includes(input.stationId)) return describeList(list, stationIds);
        if (stationIds.length >= MAX_STATIONS_PER_LIST) {
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
        return describeList(await touch(tx, list), [...stationIds, input.stationId]);
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
        return describeList(
          removed ? await touch(tx, list) : list,
          await stationIdsOf(tx, list.id),
        );
      });
    }),
};
