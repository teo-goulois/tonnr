import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { holdCatalogue } from "@repo/db/catalogue";
import { breakCandidate } from "@repo/db/schema/catalogue";
import { surfBreak } from "@repo/db/schema/spots";
import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAction } from "../actions";
import {
  ADMIN_ONLY,
  breakValuesInput,
  breaksNear,
  changedFields,
  columnsOf,
  deleteBreak,
  describeAllForOperator,
  holdBreak,
  holdListsOf,
  listingsOf,
  mergeBreaks,
  nearbySchema,
  noBreak,
  operatorBreakSchema,
  usesOf,
  usesSchema,
} from "../catalogue";
import { adminProcedure } from "../index";

// How far around a break the breaks that may be the same place are looked for.
const NEARBY_METERS = 1_000;

/** What an operator reads of a break: the break, what uses it, and where it came from. */
const breakPageSchema = z.object({
  break: operatorBreakSchema,
  uses: usesSchema,
  // What each list said of it, as the list gave it: its own, and those of the breaks merged
  // into it.
  listings: z.array(
    z.object({
      list: z.string(),
      ref: z.string(),
      details: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  // The candidates of a list that became it, or were merged into it.
  candidates: z.array(
    z.object({
      id: z.string(),
      list: z.string(),
      ref: z.string(),
      name: z.string(),
      status: z.string(),
    }),
  ),
  nearby: z.array(nearbySchema),
});

type Reader = Pick<Database, "select" | "selectDistinctOn">;

async function pageOf(db: Reader, row: typeof surfBreak.$inferSelect) {
  const [described] = await describeAllForOperator(db, [row]);
  if (!described) throw noBreak(row.id);
  return {
    break: described,
    uses: await usesOf(db, row.id),
    listings: (await listingsOf(db, [row.id])).map(({ list, ref, details }) => ({
      list,
      ref,
      details,
    })),
    candidates: await db
      .select({
        id: breakCandidate.id,
        list: breakCandidate.list,
        ref: breakCandidate.ref,
        name: breakCandidate.name,
        status: breakCandidate.status,
      })
      .from(breakCandidate)
      .where(eq(breakCandidate.breakId, row.id))
      .orderBy(asc(breakCandidate.list), asc(breakCandidate.ref)),
    nearby: await breaksNear(db, row, NEARBY_METERS, [row.id]),
  };
}

const versionInput = z.object({ id: z.string(), updatedAt: z.coerce.date() });

export const catalogueRouter = {
  map: adminProcedure
    .route({
      method: "GET",
      path: "/catalogue/map",
      summary: "Every break of the catalogue, to draw on a map",
      description:
        `${ADMIN_ONLY} Each break with its point, its list, and whether anything is known of ` +
        "it and whether it has a description, in one answer. Decision 049.",
      tags: ["Catalogue"],
    })
    .output(
      z.object({
        breaks: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            provider: z.string().nullable(),
            // Whether any of what it is like is known.
            known: z.boolean(),
            described: z.boolean(),
          }),
        ),
      }),
    )
    .handler(async ({ context }) => {
      const breaks = await context.db
        .select({
          id: surfBreak.id,
          name: surfBreak.name,
          latitude: surfBreak.latitude,
          longitude: surfBreak.longitude,
          provider: surfBreak.provider,
          known: sql<boolean>`coalesce(${surfBreak.breakTypes}, ${surfBreak.waveDirections}, ${surfBreak.bottomTypes}, ${surfBreak.abilityLevels}, ${surfBreak.boardTypes}, ${surfBreak.bestSeasons}, ${surfBreak.bestTides}, ${surfBreak.bestSwellDirections}, ${surfBreak.bestWindDirections}) is not null or ${surfBreak.offshoreDirectionDegrees} is not null or ${surfBreak.waveSizeMeters} is not null`,
          described: isNotNull(surfBreak.description).mapWith(Boolean),
        })
        .from(surfBreak)
        .orderBy(asc(surfBreak.id));
      return { breaks };
    }),

  get: adminProcedure
    .route({
      method: "GET",
      path: "/catalogue/{id}",
      summary: "One break of the catalogue, as an operator reads it",
      description:
        `${ADMIN_ONLY} The break with what the catalogue holds and what accounts confirmed of ` +
        "it, what uses it, what each list said of it, the candidates that went into it, and " +
        `the breaks within ${NEARBY_METERS} meters. Decision 049.`,
      tags: ["Catalogue"],
    })
    .input(z.object({ id: z.string() }))
    .output(breakPageSchema)
    .handler(async ({ input, context }) => {
      const [row] = await context.db.select().from(surfBreak).where(eq(surfBreak.id, input.id));
      if (!row) throw noBreak(input.id);
      return pageOf(context.db, row);
    }),

  update: adminProcedure
    .route({
      method: "PATCH",
      path: "/catalogue/{id}",
      summary: "Change a break of the catalogue",
      description:
        `${ADMIN_ONLY} Its name, its point, what it is like and its description, all given. ` +
        "`updatedAt` is the break's as it was read: one that changed since is not changed, and " +
        "the answer is 409. What accounts confirmed of a line still shows over the catalogue's " +
        "words. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(versionInput.extend({ values: breakValuesInput }))
    .output(breakPageSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        await holdCatalogue(tx);
        const row = await holdBreak(tx, input.id, input.updatedAt);
        const columns = columnsOf(input.values);
        const fields = changedFields(row, columns);
        // Saving what is there already changes nothing, and is not recorded.
        if (fields.length === 0) return pageOf(tx, row);

        const [changed] = await tx
          .update(surfBreak)
          .set({ ...columns, updatedAt: new Date() })
          .where(eq(surfBreak.id, row.id))
          .returning();
        if (!changed) throw noBreak(row.id);
        await recordAction(tx, {
          operatorId,
          action: "break.update",
          developer: null,
          changes: { breakId: row.id, fields },
        });
        return pageOf(tx, changed);
      });
    }),

  merge: adminProcedure
    .route({
      method: "POST",
      path: "/catalogue/{id}/merge",
      summary: "Merge another break into this one",
      description:
        `${ADMIN_ONLY} The break \`mergeId\` goes: the spots, lists, sessions, answers and ` +
        "listings that named it name this one, which takes `values`, and the source of the " +
        "one `sourceOf` says. A break that accounts wrote in the guide of, or that was made of " +
        "a spot, does not go: the answer is 409, and the other is merged into it. Both " +
        "`updatedAt` are as they were read. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(
      versionInput.extend({
        mergeId: z.string(),
        mergeUpdatedAt: z.coerce.date(),
        values: breakValuesInput,
        sourceOf: z.enum(["kept", "merged"]).default("kept"),
      }),
    )
    .output(breakPageSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      if (input.mergeId === input.id) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A break is not merged into itself.",
        });
      }
      return context.db.transaction(async (tx) => {
        await holdCatalogue(tx);
        // The lists that hold either break, before the breaks: adding a break to a list holds
        // the list, then the break, and a merge that held them the other way round would wait
        // on it while it waits on the merge.
        await holdListsOf(tx, [input.id, input.mergeId]);
        // The two rows in the order of their ids, as anything that holds both does.
        const [first, second] = [
          [input.id, input.updatedAt],
          [input.mergeId, input.mergeUpdatedAt],
        ].sort(([one], [other]) => String(one).localeCompare(String(other))) as [
          [string, Date],
          [string, Date],
        ];
        const held = new Map([
          [first[0], await holdBreak(tx, first[0], first[1])],
          [second[0], await holdBreak(tx, second[0], second[1])],
        ]);
        const keep = held.get(input.id);
        const merge = held.get(input.mergeId);
        if (!keep || !merge) throw noBreak(input.id);

        const { merged, fields } = await mergeBreaks(tx, {
          keep,
          merge,
          values: input.values,
          sourceOf: input.sourceOf,
        });
        await recordAction(tx, {
          operatorId,
          action: "break.merge",
          developer: null,
          changes: {
            breakId: keep.id,
            mergedId: merge.id,
            fields: input.sourceOf === "merged" ? [...fields, "source"] : fields,
          },
        });
        return pageOf(tx, merged);
      });
    }),

  remove: adminProcedure
    .route({
      method: "DELETE",
      path: "/catalogue/{id}",
      summary: "Delete a break of the catalogue that no account uses",
      description:
        `${ADMIN_ONLY} A break that a spot, a list, a session, a guide or a request uses is ` +
        "not deleted: the answer is 409, with what uses it, and the break is merged into " +
        "another instead. The candidates that went into it wait to be decided again. Adding " +
        "its list again does not bring it back. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(versionInput)
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        await holdCatalogue(tx);
        const row = await holdBreak(tx, input.id, input.updatedAt);
        await deleteBreak(tx, row);
        await recordAction(tx, {
          operatorId,
          action: "break.delete",
          developer: null,
          changes: { breakId: row.id },
        });
        return { id: row.id };
      });
    }),
};
