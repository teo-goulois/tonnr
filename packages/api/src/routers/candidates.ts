import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { holdCatalogue } from "@repo/db/catalogue";
import {
  breakCandidate,
  breakCandidateImage,
  CANDIDATE_ACTIONS,
  CANDIDATE_STATES,
} from "@repo/db/schema/catalogue";
import { surfBreak, surfBreakListing } from "@repo/db/schema/spots";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAction } from "../actions";
import {
  ADMIN_ONLY,
  breakValuesInput,
  breaksNear,
  changedFields,
  columnsOf,
  describeAllForOperator,
  holdBreak,
  nearbySchema,
  operatorBreakSchema,
} from "../catalogue";
import { characteristicsSchema, describeCharacteristics } from "../characteristics";
import { adminProcedure } from "../index";
import { hasControlCharacter } from "../text";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Candidate = typeof breakCandidate.$inferSelect;

// How far around a candidate the breaks it may be are looked for.
const NEARBY_METERS = 3_000;
// What a candidate becomes, by what is decided of it.
const DECIDED = ["added", "merged", "ignored"] as const;
const OPEN = ["waiting", "later"] as const;

const candidateSummarySchema = z.object({
  id: z.string(),
  list: z.string(),
  ref: z.string(),
  name: z.string(),
  location: z.array(z.string()).nullable(),
  status: z.enum(CANDIDATE_STATES),
  // What whoever prepared the list proposes. Null when they said nothing.
  action: z.enum(CANDIDATE_ACTIONS).nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  decidedAt: z.date().nullable(),
});

const candidateSchema = candidateSummarySchema.extend({
  pointNote: z.string().nullable(),
  pointUrl: z.string().nullable(),
  characteristics: characteristicsSchema,
  proposal: z
    .object({
      action: z.enum(CANDIDATE_ACTIONS),
      breakId: z.string().optional(),
      name: z.string().optional(),
      note: z.string().optional(),
      doubts: z.array(z.string()).optional(),
    })
    .nullable(),
  evidence: z.array(
    z.object({ url: z.string(), title: z.string().optional(), note: z.string().optional() }),
  ),
  texts: z.array(
    z.object({ label: z.string(), language: z.string().optional(), text: z.string() }),
  ),
  figures: z.array(
    z.object({
      image: z.string(),
      crop: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      mark: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      caption: z.string().optional(),
    }),
  ),
  details: z.record(z.string(), z.unknown()).nullable(),
  note: z.string().nullable(),
  breakId: z.string().nullable(),
  updatedAt: z.date(),
});

/** What an operator reads of a candidate, to decide it. */
const candidatePageSchema = z.object({
  candidate: candidateSchema,
  // The break it became or was merged into, or else the one it is proposed to be merged into.
  target: operatorBreakSchema.nullable(),
  // The breaks around its point, or around its target's.
  nearby: z.array(nearbySchema),
  // The candidates that wait after it, in the order of the queue: the next to read.
  next: z.string().nullable(),
});

function summaryOf(row: Candidate) {
  return {
    id: row.id,
    list: row.list,
    ref: row.ref,
    name: row.name,
    location: row.location,
    status: row.status,
    action: row.proposal?.action ?? null,
    latitude: row.latitude,
    longitude: row.longitude,
    decidedAt: row.decidedAt,
  };
}

function noCandidate(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No candidate "${id}".` });
}

// The order a queue is read in: a list's references, which follow its pages.
const queueOrder = [asc(breakCandidate.list), asc(breakCandidate.ref)] as const;

async function pageOf(db: Pick<Database, "select" | "selectDistinctOn">, row: Candidate) {
  const targetId = row.breakId ?? row.proposal?.breakId ?? null;
  const [found] = targetId
    ? await db.select().from(surfBreak).where(eq(surfBreak.id, targetId))
    : [];
  const [target] = found ? await describeAllForOperator(db, [found]) : [];
  const around =
    row.latitude !== null && row.longitude !== null
      ? { latitude: row.latitude, longitude: row.longitude }
      : found
        ? { latitude: found.latitude, longitude: found.longitude }
        : null;
  // The next that waits in the same list and the same region, after this one.
  const region = row.location?.[0] ?? null;
  const [next] = await db
    .select({ id: breakCandidate.id })
    .from(breakCandidate)
    .where(
      and(
        eq(breakCandidate.list, row.list),
        eq(breakCandidate.status, "waiting"),
        sql`${breakCandidate.ref} > ${row.ref}`,
        region === null ? undefined : sql`${breakCandidate.location}[1] = ${region}`,
      ),
    )
    .orderBy(...queueOrder)
    .limit(1);
  return {
    candidate: {
      ...summaryOf(row),
      pointNote: row.pointNote,
      pointUrl: row.pointUrl,
      characteristics: describeCharacteristics(row.characteristics),
      proposal: row.proposal,
      evidence: row.evidence,
      texts: row.texts,
      figures: row.figures,
      details: row.details,
      note: row.note,
      breakId: row.breakId,
      updatedAt: row.updatedAt,
    },
    target: target ?? null,
    nearby: around ? await breaksNear(db, around, NEARBY_METERS) : [],
    next: next?.id ?? null,
  };
}

/**
 * Holds a candidate until the transaction ends, and checks that it is still the version that
 * was read and that it may still be decided.
 */
async function holdCandidate(
  tx: Transaction,
  id: string,
  updatedAt: Date,
  from: readonly Candidate["status"][] = OPEN,
) {
  const [row] = await tx
    .select()
    .from(breakCandidate)
    .where(eq(breakCandidate.id, id))
    .for("update");
  if (!row) throw noCandidate(id);
  if (row.updatedAt.getTime() !== updatedAt.getTime()) {
    throw new ORPCError("CONFLICT", {
      message: "The candidate changed since it was read. Read it again.",
    });
  }
  if (!from.includes(row.status)) {
    throw new ORPCError("CONFLICT", { message: "This candidate was already decided." });
  }
  return row;
}

/** Says that the list's reference leads to a break of the catalogue, with what the list said. */
async function listCandidate(tx: Transaction, row: Candidate, breakId: string) {
  await tx
    .insert(surfBreakListing)
    .values({ list: row.list, ref: row.ref, breakId, details: row.details })
    .onConflictDoUpdate({
      target: [surfBreakListing.list, surfBreakListing.ref],
      set: { breakId, details: row.details },
    });
}

async function decide(
  tx: Transaction,
  row: Candidate,
  operatorId: string,
  status: Candidate["status"],
  set: Partial<Candidate> = {},
) {
  const decided = (DECIDED as readonly string[]).includes(status);
  const [changed] = await tx
    .update(breakCandidate)
    .set({
      status,
      decidedBy: decided ? operatorId : null,
      decidedAt: decided ? new Date() : null,
      updatedAt: new Date(),
      ...set,
    })
    .where(eq(breakCandidate.id, row.id))
    .returning();
  if (!changed) throw noCandidate(row.id);
  return changed;
}

const versionInput = z.object({ id: z.string(), updatedAt: z.coerce.date() });

export const candidatesRouter = {
  list: adminProcedure
    .route({
      method: "GET",
      path: "/candidates",
      summary: "The breaks lists propose to the catalogue",
      description:
        `${ADMIN_ONLY} The candidates in one state, of every list or of one, in the order ` +
        "their list gives them, with how many there are in each state and in each region. " +
        "Decision 049.",
      tags: ["Catalogue"],
    })
    .input(
      z.object({
        status: z.enum(CANDIDATE_STATES).default("waiting"),
        list: z.string().optional(),
        // The widest place a candidate lies in, as its list names it.
        region: z.string().optional(),
      }),
    )
    .output(
      z.object({
        candidates: z.array(candidateSummarySchema),
        counts: z.record(z.enum(CANDIDATE_STATES), z.number()),
        regions: z.array(z.object({ name: z.string(), total: z.number() })),
        lists: z.array(z.string()),
      }),
    )
    .handler(async ({ input, context }) => {
      const ofList = input.list ? eq(breakCandidate.list, input.list) : undefined;
      const rows = await context.db
        .select()
        .from(breakCandidate)
        .where(
          and(
            ofList,
            eq(breakCandidate.status, input.status),
            input.region ? sql`${breakCandidate.location}[1] = ${input.region}` : undefined,
          ),
        )
        .orderBy(...queueOrder);
      const states = await context.db
        .select({ status: breakCandidate.status, total: count() })
        .from(breakCandidate)
        .where(ofList)
        .groupBy(breakCandidate.status);
      const regions = await context.db
        .select({ name: sql<string | null>`${breakCandidate.location}[1]`, total: count() })
        .from(breakCandidate)
        .where(and(ofList, eq(breakCandidate.status, input.status)))
        .groupBy(sql`${breakCandidate.location}[1]`)
        .orderBy(sql`${breakCandidate.location}[1]`);
      const lists = await context.db
        .selectDistinct({ list: breakCandidate.list })
        .from(breakCandidate)
        .orderBy(asc(breakCandidate.list));
      const counts = Object.fromEntries(CANDIDATE_STATES.map((state) => [state, 0])) as Record<
        (typeof CANDIDATE_STATES)[number],
        number
      >;
      for (const { status, total } of states) counts[status] = total;
      return {
        candidates: rows.map(summaryOf),
        counts,
        regions: regions.flatMap(({ name, total }) => (name === null ? [] : [{ name, total }])),
        lists: lists.map(({ list }) => list),
      };
    }),

  get: adminProcedure
    .route({
      method: "GET",
      path: "/candidates/{id}",
      summary: "One break a list proposes, with what to decide it on",
      description:
        `${ADMIN_ONLY} The candidate with everything its list says of it, the break it went ` +
        `into or is proposed to go into, the breaks within ${NEARBY_METERS} meters, and the ` +
        "next that waits. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(z.object({ id: z.string() }))
    .output(candidatePageSchema)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select()
        .from(breakCandidate)
        .where(eq(breakCandidate.id, input.id));
      if (!row) throw noCandidate(input.id);
      return pageOf(context.db, row);
    }),

  image: adminProcedure
    .route({
      method: "GET",
      path: "/candidates/images/{list}/{name}",
      summary: "A picture a list's candidates show",
      description: `${ADMIN_ONLY} Such as a page of a guide's map. Decision 049.`,
      tags: ["Catalogue"],
    })
    .input(z.object({ list: z.string(), name: z.string() }))
    .output(z.file())
    .handler(async ({ input, context }) => {
      const [found] = await context.db
        .select()
        .from(breakCandidateImage)
        .where(
          and(eq(breakCandidateImage.list, input.list), eq(breakCandidateImage.name, input.name)),
        );
      if (!found) throw new ORPCError("NOT_FOUND", { message: `No picture "${input.name}".` });
      return new File([new Uint8Array(found.bytes)], found.name, { type: found.contentType });
    }),

  add: adminProcedure
    .route({
      method: "POST",
      path: "/candidates/{id}/add",
      summary: "Add a candidate to the catalogue",
      description:
        `${ADMIN_ONLY} A break is made of it with \`values\`, and named by its list and its ` +
        "reference, with no source page, attribution or licence: those of a list are not " +
        "published. What the list said besides is kept aside with it. `updatedAt` is the " +
        "candidate's as it was read. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(versionInput.extend({ values: breakValuesInput }))
    .output(candidatePageSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        await holdCatalogue(tx);
        const row = await holdCandidate(tx, input.id, input.updatedAt);
        const breakId = crypto.randomUUID();
        const [made] = await tx
          .insert(surfBreak)
          .values({
            id: breakId,
            ...columnsOf(input.values),
            location: row.location,
            provider: row.list,
            providerRef: row.ref,
          })
          .onConflictDoNothing({ target: [surfBreak.provider, surfBreak.providerRef] })
          .returning({ id: surfBreak.id });
        if (!made) {
          throw new ORPCError("CONFLICT", {
            message: "The catalogue holds a break of this list's reference already.",
          });
        }
        await listCandidate(tx, row, breakId);
        const decided = await decide(tx, row, operatorId, "added", { breakId });
        await recordAction(tx, {
          operatorId,
          action: "candidate.add",
          developer: null,
          changes: { breakId, candidate: { list: row.list, ref: row.ref } },
        });
        return pageOf(tx, decided);
      });
    }),

  merge: adminProcedure
    .route({
      method: "POST",
      path: "/candidates/{id}/merge",
      summary: "Merge a candidate into a break of the catalogue",
      description:
        `${ADMIN_ONLY} The break \`breakId\` takes \`values\`, and what the list said of the ` +
        "candidate is kept aside with it. Both `updatedAt` are as they were read. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(
      versionInput.extend({
        breakId: z.string(),
        breakUpdatedAt: z.coerce.date(),
        values: breakValuesInput,
      }),
    )
    .output(candidatePageSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        await holdCatalogue(tx);
        const row = await holdCandidate(tx, input.id, input.updatedAt);
        const target = await holdBreak(tx, input.breakId, input.breakUpdatedAt);
        const columns = columnsOf(input.values);
        const fields = changedFields(target, columns);
        if (fields.length > 0) {
          await tx
            .update(surfBreak)
            .set({ ...columns, updatedAt: new Date() })
            .where(eq(surfBreak.id, target.id));
        }
        await listCandidate(tx, row, target.id);
        const decided = await decide(tx, row, operatorId, "merged", { breakId: target.id });
        await recordAction(tx, {
          operatorId,
          action: "candidate.merge",
          developer: null,
          changes: { breakId: target.id, candidate: { list: row.list, ref: row.ref }, fields },
        });
        return pageOf(tx, decided);
      });
    }),

  ignore: adminProcedure
    .route({
      method: "POST",
      path: "/candidates/{id}/ignore",
      summary: "Leave a candidate out of the catalogue",
      description:
        `${ADMIN_ONLY} It stays, decided, and may be put back in the queue. \`note\` says why, ` +
        "for the operator. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(
      versionInput.extend({
        note: z
          .string()
          .trim()
          .max(500)
          .refine((note) => !hasControlCharacter(note), "must not contain control characters")
          .optional(),
      }),
    )
    .output(candidatePageSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const row = await holdCandidate(tx, input.id, input.updatedAt);
        const decided = await decide(tx, row, operatorId, "ignored", {
          note: input.note || null,
        });
        await recordAction(tx, {
          operatorId,
          action: "candidate.ignore",
          developer: null,
          changes: { candidate: { list: row.list, ref: row.ref } },
        });
        return pageOf(tx, decided);
      });
    }),

  later: adminProcedure
    .route({
      method: "POST",
      path: "/candidates/{id}/later",
      summary: "Put off a candidate, to read it after the others",
      description: `${ADMIN_ONLY} Decision 049.`,
      tags: ["Catalogue"],
    })
    .input(versionInput)
    .output(candidatePageSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const row = await holdCandidate(tx, input.id, input.updatedAt, ["waiting"]);
        const decided = await decide(tx, row, operatorId, "later");
        await recordAction(tx, {
          operatorId,
          action: "candidate.later",
          developer: null,
          changes: { candidate: { list: row.list, ref: row.ref } },
        });
        return pageOf(tx, decided);
      });
    }),

  reopen: adminProcedure
    .route({
      method: "POST",
      path: "/candidates/{id}/reopen",
      summary: "Put a candidate that was left out or put off back in the queue",
      description:
        `${ADMIN_ONLY} One that became a break, or was merged into one, waits again once that ` +
        "break is deleted. Decision 049.",
      tags: ["Catalogue"],
    })
    .input(versionInput)
    .output(candidatePageSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const row = await holdCandidate(tx, input.id, input.updatedAt, ["ignored", "later"]);
        const decided = await decide(tx, row, operatorId, "waiting");
        await recordAction(tx, {
          operatorId,
          action: "candidate.reopen",
          developer: null,
          changes: { candidate: { list: row.list, ref: row.ref } },
        });
        return pageOf(tx, decided);
      });
    }),
};
