import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { user } from "@repo/db/schema/auth";
import {
  breakContribution,
  CONTRIBUTION_LICENSES,
  CONTRIBUTION_STATES,
  contributionVerdict,
  GUIDE_LANGUAGES,
  GUIDE_TEXT_LINES,
  GUIDE_WORD_LINES,
} from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { and, asc, count, desc, eq, exists, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAction } from "../actions";
import { isTextLine, isWordLine } from "../community";
import { confirmHeld, type Contribution, currentOf, valueSchema } from "../guides";
import { adminProcedure } from "../index";
import { standingsOf } from "../standings";
import { hasControlCharacter } from "../text";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Parameters<typeof currentOf>[0];

// What an operator reads of the contributions: those that wait to be read, those an account
// that keeps the break contested, those that show and that nobody confirmed yet, and what was
// answered.
const QUEUES = ["pending", "contested", "shown", "confirmed", "refused"] as const;

const reviewSchema = z.object({
  id: z.string(),
  status: z.enum(CONTRIBUTION_STATES),
  line: z.enum([...GUIDE_WORD_LINES, ...GUIDE_TEXT_LINES]),
  value: valueSchema,
  language: z.enum(GUIDE_LANGUAGES).nullable(),
  license: z.enum(CONTRIBUTION_LICENSES),
  // Why it was refused.
  reason: z.string().nullable(),
  createdAt: z.date(),
  decidedAt: z.date().nullable(),
  // The break it was written of. Null once the break has left the catalogue.
  break: z
    .object({
      id: z.string(),
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      location: z.array(z.string()).nullable(),
    })
    .nullable(),
  // What the line says now, which this would take the place of. Null where nobody has said,
  // and for the contribution that is what the line says.
  current: valueSchema.nullable(),
  // Who wrote it, with how many of its contributions were confirmed. Null once its account is
  // deleted.
  author: z
    .object({ id: z.string(), username: z.string().nullable(), confirmed: z.number() })
    .nullable(),
  // How many accounts that keep the break said it is right.
  confirmations: z.number(),
  // The contests that wait, the oldest first: who gave each, and why. The account wrote to the
  // operator, who reads who it is as they read who asks to publish a spot.
  contests: z.array(
    z.object({
      accountId: z.string(),
      username: z.string().nullable(),
      reason: z.string(),
      at: z.date(),
    }),
  ),
});

const noContribution = (id: string) =>
  new ORPCError("NOT_FOUND", { message: `No contribution "${id}".` });

type Found = { contribution: Contribution; found: typeof surfBreak.$inferSelect | null };

async function describe(db: Reader, rows: Found[]) {
  const ids = rows.map((row) => row.contribution.id);
  const verdicts =
    ids.length > 0
      ? await db
          .select({
            contributionId: contributionVerdict.contributionId,
            verdict: contributionVerdict.verdict,
            reason: contributionVerdict.reason,
            dismissedAt: contributionVerdict.dismissedAt,
            at: contributionVerdict.createdAt,
            accountId: contributionVerdict.userId,
            username: user.username,
          })
          .from(contributionVerdict)
          .innerJoin(user, eq(user.id, contributionVerdict.userId))
          .where(inArray(contributionVerdict.contributionId, ids))
          .orderBy(asc(contributionVerdict.createdAt))
      : [];
  const authorIds = rows.flatMap((row) => row.contribution.userId ?? []);
  const named =
    authorIds.length > 0
      ? await db
          .select({ id: user.id, username: user.username })
          .from(user)
          .where(inArray(user.id, authorIds))
      : [];
  const standings = await standingsOf(db, authorIds);

  const reviews = [];
  for (const { contribution, found } of rows) {
    const { line } = contribution;
    if (!isWordLine(line) && !isTextLine(line)) continue;
    const author = named.find((account) => account.id === contribution.userId);
    const mine = verdicts.filter((verdict) => verdict.contributionId === contribution.id);
    const current =
      found && contribution.status !== "confirmed"
        ? await currentOf(db, found, line, contribution.language)
        : null;
    reviews.push({
      id: contribution.id,
      status: contribution.status,
      line,
      value: contribution.value,
      language: contribution.language,
      license: contribution.license,
      reason: contribution.reason,
      createdAt: contribution.createdAt,
      decidedAt: contribution.decidedAt,
      break: found && {
        id: found.id,
        name: found.name,
        latitude: found.latitude,
        longitude: found.longitude,
        location: found.location,
      },
      current,
      author: author
        ? {
            id: author.id,
            username: author.username,
            confirmed: standings.get(author.id)?.confirmed ?? 0,
          }
        : null,
      confirmations: mine.filter((verdict) => verdict.verdict === "confirm").length,
      contests: mine.flatMap((verdict) =>
        verdict.verdict === "contest" && verdict.dismissedAt === null && verdict.reason !== null
          ? [
              {
                accountId: verdict.accountId,
                username: verdict.username,
                reason: verdict.reason,
                at: verdict.at,
              },
            ]
          : [],
      ),
    });
  }
  return reviews;
}

/** Holds a contribution until the transaction ends, with the break it was written of. */
async function hold(tx: Transaction, id: string) {
  const [held] = await tx
    .select()
    .from(breakContribution)
    .where(eq(breakContribution.id, id))
    .for("update");
  // A spot that became a break is answered as decision 034 says, and not here.
  if (!held || held.line === "place") throw noContribution(id);
  const [found] = held.breakId
    ? await tx.select().from(surfBreak).where(eq(surfBreak.id, held.breakId))
    : [];
  return { held, found: found ?? null };
}

const waitingContest = and(
  eq(contributionVerdict.verdict, "contest"),
  isNull(contributionVerdict.dismissedAt),
);

export const reviewsRouter = {
  list: adminProcedure
    .route({
      method: "GET",
      path: "/reviews",
      summary: "The contributions to the guides, as an operator reads them",
      description:
        `${ADMIN_ONLY} \`queue\` is \`pending\` for those that wait to be read, \`contested\` ` +
        "for those that show and that an account which keeps the break contested, `shown` " +
        "for those that show and that nobody confirmed yet, `confirmed` or `refused` for what " +
        "was answered. The first three come the oldest first, the last two the latest first. " +
        "Each comes with its break, what its line says now, its author and the contests that " +
        "wait. Decision 041.",
      tags: ["Reviews"],
    })
    .input(z.object({ queue: z.enum(QUEUES).default("pending") }))
    .output(z.object({ reviews: z.array(reviewSchema), total: z.number() }))
    .handler(async ({ input, context }) => {
      const { db } = context;
      const contested = exists(
        db
          .select({ one: sql`1` })
          .from(contributionVerdict)
          .where(and(eq(contributionVerdict.contributionId, breakContribution.id), waitingContest)),
      );
      const inQueue =
        input.queue === "contested"
          ? and(inArray(breakContribution.status, ["shown", "confirmed"]), contested)
          : eq(breakContribution.status, input.queue);
      const where = and(ne(breakContribution.line, "place"), inQueue);
      const answered = input.queue === "confirmed" || input.queue === "refused";

      const rows = await db
        .select({ contribution: breakContribution, found: surfBreak })
        .from(breakContribution)
        .leftJoin(surfBreak, eq(surfBreak.id, breakContribution.breakId))
        .where(where)
        .orderBy(
          answered
            ? desc(sql`coalesce(${breakContribution.decidedAt}, ${breakContribution.confirmedAt})`)
            : asc(breakContribution.createdAt),
          asc(breakContribution.id),
        )
        .limit(100);
      const [counted] = await db.select({ total: count() }).from(breakContribution).where(where);
      return { reviews: await describe(db, rows), total: counted?.total ?? 0 };
    }),

  accept: adminProcedure
    .route({
      method: "POST",
      path: "/reviews/{id}/accept",
      summary: "Confirm a contribution: it becomes what its line says",
      description:
        `${ADMIN_ONLY} It is said of a contribution that waits to be read, or that shows and ` +
        "that nobody confirmed yet. The guide then says it, under its author's username, and " +
        "it counts for its author. A contribution to a break that left the catalogue is not " +
        "confirmed: the answer is 409. Decision 041.",
      tags: ["Reviews"],
    })
    .input(z.object({ id: z.string().min(1).max(200) }))
    .output(reviewSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const { held, found } = await hold(tx, input.id);
        if (held.status !== "pending" && held.status !== "shown") {
          throw new ORPCError("CONFLICT", { message: "This contribution was already answered." });
        }
        if (!found) {
          throw new ORPCError("CONFLICT", { message: "Its break has left the catalogue." });
        }
        const confirmed = await confirmHeld(tx, held, operatorId);
        await recordAction(tx, {
          operatorId,
          action: "contribution.accept",
          developer: null,
          ...(held.userId && { account: { id: held.userId } }),
          changes: { contributionId: held.id },
        });
        const [review] = await describe(tx, [{ contribution: confirmed, found }]);
        if (!review) throw noContribution(input.id);
        return review;
      });
    }),

  refuse: adminProcedure
    .route({
      method: "POST",
      path: "/reviews/{id}/refuse",
      summary: "Refuse a contribution, and say why",
      description:
        `${ADMIN_ONLY} Its author reads the reason. It is said of a contribution that waits, ` +
        "that shows, or that was confirmed: a line that said it then says what it said " +
        "before, and the contribution no longer counts for its author, who keeps the rank it " +
        "reached. Decision 041.",
      tags: ["Reviews"],
    })
    .input(
      z.object({
        id: z.string().min(1).max(200),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(280)
          .refine((reason) => !hasControlCharacter(reason), "must not contain control characters"),
      }),
    )
    .output(reviewSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const { held, found } = await hold(tx, input.id);
        if (!["pending", "shown", "confirmed"].includes(held.status)) {
          throw new ORPCError("CONFLICT", { message: "This contribution was already answered." });
        }
        const [refused] = await tx
          .update(breakContribution)
          .set({
            status: "refused",
            reason: input.reason,
            decidedBy: operatorId,
            decidedAt: new Date(),
          })
          .where(eq(breakContribution.id, held.id))
          .returning();
        if (!refused) throw noContribution(input.id);
        await recordAction(tx, {
          operatorId,
          action: "contribution.refuse",
          developer: null,
          ...(held.userId && { account: { id: held.userId } }),
          changes: { contributionId: held.id },
        });
        const [review] = await describe(tx, [{ contribution: refused, found }]);
        if (!review) throw noContribution(input.id);
        return review;
      });
    }),

  keep: adminProcedure
    .route({
      method: "POST",
      path: "/reviews/{id}/keep",
      summary: "Keep a contribution that was contested",
      description:
        `${ADMIN_ONLY} The contests that the operator read are closed: \`through\` is the ` +
        "moment of the latest of them, and one that came since still waits. A contribution " +
        "that showed as waiting to be confirmed is confirmed by it: an operator read it. The " +
        "answer is 409 when no contest waits. Decision 041.",
      tags: ["Reviews"],
    })
    .input(z.object({ id: z.string().min(1).max(200), through: z.coerce.date() }))
    .output(reviewSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const { held, found } = await hold(tx, input.id);
        if (held.status !== "shown" && held.status !== "confirmed") {
          throw new ORPCError("CONFLICT", { message: "This contribution no longer shows." });
        }
        const read = await tx
          .update(contributionVerdict)
          .set({ dismissedAt: new Date() })
          .where(
            and(
              eq(contributionVerdict.contributionId, held.id),
              waitingContest,
              // The moment an operator read lost what it held under the millisecond on its way
              // there and back: the contest is compared without it.
              lte(sql`date_trunc('milliseconds', ${contributionVerdict.createdAt})`, input.through),
            ),
          )
          .returning({ userId: contributionVerdict.userId });
        if (read.length === 0) {
          throw new ORPCError("CONFLICT", { message: "No contest of this contribution waits." });
        }
        const kept =
          held.status === "shown" && found ? await confirmHeld(tx, held, operatorId) : held;
        await recordAction(tx, {
          operatorId,
          action: "contribution.keep",
          developer: null,
          ...(held.userId && { account: { id: held.userId } }),
          changes: { contributionId: held.id },
        });
        const [review] = await describe(tx, [{ contribution: kept, found }]);
        if (!review) throw noContribution(input.id);
        return review;
      });
    }),
};
