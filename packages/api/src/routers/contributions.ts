import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { holdAccounts } from "@repo/db/accounts";
import { blockedBy } from "@repo/db/blocks";
import { user } from "@repo/db/schema/auth";
import {
  breakContribution,
  CONTRIBUTION_LINES,
  CONTRIBUTION_STATES,
  contributionVerdict,
  GUIDE_LANGUAGES,
  GUIDE_TEXT_LINES,
  GUIDE_WORD_LINES,
  RANKS,
} from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { and, count, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import {
  CONFIRMATIONS_NEEDED,
  CONTESTS_A_DAY,
  isWordLine,
  keptText,
  keptWords,
  LINE_WORDS,
  mayConfirm,
  nextRank,
  PROPOSALS_A_DAY,
  sameValue,
  SIZE_NOTES_MOST,
  TEXT_LEAST,
  TEXT_MOST,
  textMostOf,
  WAITING_MOST,
} from "../community";
import {
  confirmHeld,
  type Contribution,
  currentOf,
  holdLine,
  keepsBreak,
  type Language,
  valueSchema,
} from "../guides";
import { protectedProcedure } from "../index";
import { sponsorOf, standingOf } from "../standings";
import { hasControlCharacter } from "../text";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const contributionSchema = z.object({
  id: z.string(),
  // The break it was written of. Null once the break has left the catalogue: the contribution
  // still counts.
  break: z.object({ id: z.string(), name: z.string() }).nullable(),
  // A line of the guide, or `place` for a spot that became a break of the catalogue.
  line: z.enum(CONTRIBUTION_LINES),
  value: valueSchema,
  // The language a text is written in. Null for a line that is not a text.
  language: z.enum(GUIDE_LANGUAGES).nullable(),
  // It waits to be read (`pending`), shows as waiting to be confirmed (`shown`), is
  // `confirmed` or `refused`, was taken back (`withdrawn`), or was written of what the line
  // said before another was confirmed (`superseded`).
  status: z.enum(CONTRIBUTION_STATES),
  // Why it was refused.
  reason: z.string().nullable(),
  createdAt: z.date(),
  confirmedAt: z.date().nullable(),
});

function describe(row: Contribution, found: { id: string; name: string } | null) {
  return {
    id: row.id,
    break: found && { id: found.id, name: found.name },
    line: row.line,
    value: row.value,
    language: row.language,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
  };
}

const noContribution = (id: string) =>
  new ORPCError("NOT_FOUND", { message: `No contribution "${id}".` });

/**
 * Holds a contribution of another account until the transaction ends, so that what is said of
 * it is said of what it is: an operator who refuses it at the same moment waits, or is waited
 * for. What it holds, it holds in the one order every change of a guide follows: the accounts'
 * rows, the caller's and, where a confirmation may raise a score, the author's and its
 * sponsor's, then the line, then the contribution.
 */
async function holdOthers(tx: Transaction, id: string, userId: string, raises: boolean) {
  // Read first without a hold, to know which accounts and which line to hold before it.
  const [seen] = await tx.select().from(breakContribution).where(eq(breakContribution.id, id));
  // A break that left the catalogue has no guide to say anything of.
  if (!seen || seen.breakId === null || seen.line === "place") throw noContribution(id);
  await holdAccounts(
    tx,
    raises ? [userId, seen.userId, await sponsorOf(tx, seen.userId)] : [userId],
  );
  await holdLine(tx, seen.breakRef, seen.line);
  const [held] = await tx
    .select()
    .from(breakContribution)
    .where(eq(breakContribution.id, id))
    .for("update");
  if (!held || held.breakId === null) throw noContribution(id);
  if (held.userId === userId) {
    throw new ORPCError("FORBIDDEN", {
      message: "An account says nothing of its own contribution. Others do.",
    });
  }
  // What an account it blocked has waiting, it does not read: decision 071. A line that was
  // confirmed is the guide's, the same for every reader, and may be contested still.
  const waits = held.status === "pending" || held.status === "shown";
  if (waits && held.userId !== null && (await blockedBy(tx, userId)).has(held.userId)) {
    throw noContribution(id);
  }
  return { ...held, breakId: held.breakId };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const contributionsRouter = {
  propose: protectedProcedure
    .meta({ analytics: "contribution_proposed" })
    .route({
      method: "POST",
      path: "/contributions",
      summary: "Write a line of a break's guide",
      description:
        "Takes a signed-in session of an account that has a username: the line is read under " +
        "it. `line` is one of the guide's lists of words, with `value` a list of the " +
        "catalogue's words for it, or one of its five texts (`access`, `entry`, `hazards`, " +
        `\`rules\`, \`sizeNotes\`), with \`value\` a text of ${TEXT_LEAST} to ${TEXT_MOST} ` +
        `characters, ${SIZE_NOTES_MOST} for \`sizeNotes\`, and ` +
        "`language` the language it is written in. `agreed` says that the account gives it " +
        "under the Open Database License, and a text under the Database Contents License: " +
        "the row keeps which. A contribution waits for an operator of the instance to read " +
        "it. A list of words from an account that had three contributions confirmed shows at " +
        "once, as waiting to be confirmed. Writing a line again takes back what waited of it. " +
        "The answer is 409 when the guide already says so, 403 for an account with no " +
        `username or with ${WAITING_MOST} contributions waiting, and 429 after ` +
        `${PROPOSALS_A_DAY} in a day. Decision 041.`,
      tags: ["Contributions"],
    })
    .input(
      z.object({
        breakId: z.uuid(),
        line: z.enum([...GUIDE_WORD_LINES, ...GUIDE_TEXT_LINES]),
        value: z.union([z.array(z.string().max(40)).max(40), z.string().max(TEXT_MOST * 4)]),
        language: z.enum(GUIDE_LANGUAGES).optional(),
        agreed: z.literal(true),
      }),
    )
    .output(contributionSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { line } = input;

      let value: string[] | string;
      let language: Language | null = null;
      if (isWordLine(line)) {
        const words: readonly string[] = LINE_WORDS[line];
        const kept = Array.isArray(input.value) ? keptWords(line, input.value) : null;
        if (
          !kept ||
          !Array.isArray(input.value) ||
          input.value.some((word) => !words.includes(word))
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: `"${line}" takes a list of at least one of: ${words.join(", ")}.`,
          });
        }
        value = kept;
      } else {
        const text = typeof input.value === "string" ? keptText(input.value) : "";
        const most = textMostOf(line);
        if (text.length < TEXT_LEAST || text.length > most || hasControlCharacter(text)) {
          throw new ORPCError("BAD_REQUEST", {
            message: `"${line}" takes a text of ${TEXT_LEAST} to ${most} characters.`,
          });
        }
        if (!input.language) {
          throw new ORPCError("BAD_REQUEST", {
            message: "A text says the language it is written in, in `language`.",
          });
        }
        value = text;
        language = input.language;
      }

      return context.db.transaction(async (tx) => {
        // Holding the account's row makes its contributions run one after the other, so two
        // at once cannot both pass a limit.
        await holdAccounts(tx, [userId]);
        const [account] = await tx
          .select({ username: user.username })
          .from(user)
          .where(eq(user.id, userId));
        if (!account?.username) {
          throw new ORPCError("FORBIDDEN", {
            message: "Choose a username first: a contribution is read under it.",
          });
        }
        const [found] = await tx.select().from(surfBreak).where(eq(surfBreak.id, input.breakId));
        if (!found) throw new ORPCError("NOT_FOUND", { message: `No break "${input.breakId}".` });
        // What the line says is read, and what waited of it is closed, with the line held.
        await holdLine(tx, found.id, line);
        if (sameValue(await currentOf(tx, found, line, language), value)) {
          throw new ORPCError("CONFLICT", { message: "The guide already says so." });
        }

        const mine = eq(breakContribution.userId, userId);
        const [today] = await tx
          .select({ total: count() })
          .from(breakContribution)
          .where(
            and(
              mine,
              ne(breakContribution.line, "place"),
              gt(breakContribution.createdAt, new Date(Date.now() - DAY_MS)),
            ),
          );
        if ((today?.total ?? 0) >= PROPOSALS_A_DAY) {
          context.reply.retryAfterSeconds = 60 * 60;
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: `An account writes at most ${PROPOSALS_A_DAY} contributions in a day.`,
          });
        }
        // What the account had waiting on this line gives way: the row stays, closed.
        const waits = inArray(breakContribution.status, ["pending", "shown"]);
        await tx
          .update(breakContribution)
          .set({ status: "withdrawn" })
          .where(
            and(
              mine,
              eq(breakContribution.breakId, found.id),
              eq(breakContribution.line, line),
              waits,
            ),
          );
        const [waiting] = await tx
          .select({ total: count() })
          .from(breakContribution)
          .where(and(mine, waits));
        if ((waiting?.total ?? 0) >= WAITING_MOST) {
          throw new ORPCError("FORBIDDEN", {
            message: `An account has at most ${WAITING_MOST} contributions waiting.`,
          });
        }

        // The words of an account that an operator read three times show at once. A text
        // always waits for someone to read it.
        const shows = isWordLine(line) && (await standingOf(tx, userId)).trusted;
        const [written] = await tx
          .insert(breakContribution)
          .values({
            id: crypto.randomUUID(),
            breakId: found.id,
            breakRef: found.id,
            userId,
            line,
            value,
            language,
            license: isWordLine(line) ? "ODbL-1.0" : "DbCL-1.0",
            status: shows ? "shown" : "pending",
            shownAt: shows ? new Date() : null,
          })
          .returning();
        if (!written) throw new Error("The contribution was not written.");
        return describe(written, found);
      });
    }),

  withdraw: protectedProcedure
    .meta({ analytics: "contribution_withdrawn" })
    .route({
      method: "DELETE",
      path: "/contributions/{id}",
      summary: "Take back a contribution of the caller's that waits",
      description:
        "Takes a signed-in session. A contribution that waits to be read or to be confirmed " +
        "is closed, and its row stays. One that was confirmed or refused is not taken back: " +
        "the answer is 404. Decision 041.",
      tags: ["Contributions"],
    })
    .input(z.object({ id: z.string().min(1).max(200) }))
    .output(z.object({ withdrawn: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const [closed] = await context.db
        .update(breakContribution)
        .set({ status: "withdrawn" })
        .where(
          and(
            eq(breakContribution.id, input.id),
            eq(breakContribution.userId, context.session.user.id),
            inArray(breakContribution.status, ["pending", "shown"]),
          ),
        )
        .returning({ id: breakContribution.id });
      if (!closed) throw noContribution(input.id);
      return { withdrawn: true as const };
    }),

  mine: protectedProcedure
    .route({
      method: "GET",
      path: "/contributions",
      summary: "What the caller wrote, and where it stands",
      description:
        "Takes a signed-in session. The caller's contributions, the latest first, with what " +
        "became of each, and its standing: a score, computed from the contributions that " +
        "were confirmed and kept nowhere, and a rank, which is kept once it is reached. A " +
        "line of a break counts once, 5 points for a list of words and 10 for a text. A spot " +
        "that became a break of the catalogue counts 20, and an account made through the " +
        "caller's link 15, once it had a contribution confirmed. The ranks are `qs` from 20 " +
        "points, `cs` from 150 and `ct` from 600. Decision 041.",
      tags: ["Contributions"],
    })
    .output(
      z.object({
        // Null for an account that has chosen none: it chooses one before it contributes.
        username: z.string().nullable(),
        score: z.number(),
        // The highest rank the account reached. Null before the first.
        rank: z.enum(RANKS).nullable(),
        // The rank after it, and the score it is reached at. Null after the last.
        next: z.object({ rank: z.enum(RANKS), from: z.number() }).nullable(),
        // How many of its contributions are confirmed, each line of a break once.
        confirmed: z.number(),
        // How many accounts were made through its link and then had a contribution confirmed.
        sponsorships: z.number(),
        // Whether its lists of words show at once, as waiting to be confirmed.
        trusted: z.boolean(),
        contributions: z.array(contributionSchema),
      }),
    )
    .handler(async ({ context }) => {
      const { db } = context;
      const userId = context.session.user.id;
      const [account] = await db
        .select({ username: user.username })
        .from(user)
        .where(eq(user.id, userId));
      const standing = await standingOf(db, userId);
      const rows = await db
        .select({ contribution: breakContribution, breakId: surfBreak.id, name: surfBreak.name })
        .from(breakContribution)
        .leftJoin(surfBreak, eq(surfBreak.id, breakContribution.breakId))
        .where(and(eq(breakContribution.userId, userId), ne(breakContribution.status, "withdrawn")))
        .orderBy(desc(breakContribution.createdAt), desc(breakContribution.id))
        .limit(200);
      return {
        username: account?.username ?? null,
        score: standing.score,
        rank: standing.rank,
        next: nextRank(standing.rank),
        confirmed: standing.confirmed,
        sponsorships: standing.sponsorships,
        trusted: standing.trusted,
        contributions: rows.map((row) =>
          describe(
            row.contribution,
            row.breakId !== null && row.name !== null ? { id: row.breakId, name: row.name } : null,
          ),
        ),
      };
    }),

  confirm: protectedProcedure
    .meta({ analytics: "contribution_confirmed" })
    .route({
      method: "PUT",
      path: "/contributions/{id}/confirmation",
      summary: "Say that a contribution of another account is right",
      description:
        "Takes a signed-in session of an account that keeps the break: it holds it in a list " +
        "of its own, or has a spot of its own on it. Its address is checked, where the " +
        "instance checks addresses, and one of its own contributions was confirmed. It is " +
        "said of a contribution that shows as waiting to be confirmed, once, by an account " +
        `that did not write it. ${CONFIRMATIONS_NEEDED} accounts make it confirmed: it is ` +
        "then what its line says. An account that contested it does not confirm it: the " +
        "answer is 409. Who said so is answered to nobody. Decision 041.",
      tags: ["Contributions"],
    })
    .input(z.object({ id: z.string().min(1).max(200) }))
    .output(z.object({ status: z.enum(CONTRIBUTION_STATES), confirmations: z.number() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const held = await holdOthers(tx, input.id, userId, true);
        if (held.status !== "shown") {
          throw new ORPCError("CONFLICT", {
            message: "This contribution no longer waits to be confirmed.",
          });
        }
        const [account] = await tx
          .select({ emailVerified: user.emailVerified })
          .from(user)
          .where(eq(user.id, userId));
        const allowed = mayConfirm(context.verification.isOn, {
          keeps: await keepsBreak(tx, userId, held.breakId),
          emailVerified: account?.emailVerified ?? false,
          confirmed: (await standingOf(tx, userId)).confirmed,
        });
        if (!allowed) {
          throw new ORPCError("FORBIDDEN", {
            message:
              "Confirming takes an account that keeps the break, whose address is checked, " +
              "and that had a contribution of its own confirmed.",
          });
        }

        // An account says one thing of a contribution. One that contested it gave its reason
        // to the operator, and does not take it back by confirming: a contest stays one, with
        // its reason and its day.
        const [before] = await tx
          .select({ verdict: contributionVerdict.verdict })
          .from(contributionVerdict)
          .where(
            and(
              eq(contributionVerdict.contributionId, held.id),
              eq(contributionVerdict.userId, userId),
            ),
          );
        if (before?.verdict === "contest") {
          throw new ORPCError("CONFLICT", {
            message: "You contested this contribution. An operator reads your reason.",
          });
        }
        await tx
          .insert(contributionVerdict)
          .values({ contributionId: held.id, userId, verdict: "confirm" })
          .onConflictDoNothing();
        const [said] = await tx
          .select({ total: count() })
          .from(contributionVerdict)
          .where(
            and(
              eq(contributionVerdict.contributionId, held.id),
              eq(contributionVerdict.verdict, "confirm"),
            ),
          );
        const confirmations = said?.total ?? 0;
        if (confirmations < CONFIRMATIONS_NEEDED) return { status: held.status, confirmations };
        const confirmed = await confirmHeld(tx, held, null);
        return { status: confirmed.status, confirmations };
      });
    }),

  contest: protectedProcedure
    .meta({ analytics: "contribution_contested" })
    .route({
      method: "PUT",
      path: "/contributions/{id}/contest",
      summary: "Say that a contribution of another account is wrong, and why",
      description:
        "Takes a signed-in session of an account that keeps the break. It is said of a " +
        "contribution that shows, confirmed or not, once, with a reason that an operator of " +
        "the instance reads. It changes nothing by itself: the contribution stays as it is " +
        "until the operator refuses it, or keeps it. Neither the reason nor who gave it is " +
        `answered to another account. An account contests at most ${CONTESTS_A_DAY} ` +
        "contributions in a day. Decision 041.",
      tags: ["Contributions"],
    })
    .input(
      z.object({
        id: z.string().min(1).max(200),
        reason: z
          .string()
          .trim()
          .min(3)
          .max(280)
          .refine((reason) => !hasControlCharacter(reason), "must not contain control characters"),
      }),
    )
    .output(z.object({ contested: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const held = await holdOthers(tx, input.id, userId, false);
        if (held.status !== "shown" && held.status !== "confirmed") {
          throw new ORPCError("CONFLICT", { message: "This contribution no longer shows." });
        }
        if (!(await keepsBreak(tx, userId, held.breakId))) {
          throw new ORPCError("FORBIDDEN", {
            message: "Contesting takes an account that keeps the break.",
          });
        }

        const [before] = await tx
          .select()
          .from(contributionVerdict)
          .where(
            and(
              eq(contributionVerdict.contributionId, held.id),
              eq(contributionVerdict.userId, userId),
            ),
          );
        if (before?.verdict === "contest") {
          throw new ORPCError("CONFLICT", {
            message: before.dismissedAt
              ? "An operator read your reason and kept the contribution."
              : "You contested this contribution already.",
          });
        }
        const [today] = await tx
          .select({ total: count() })
          .from(contributionVerdict)
          .where(
            and(
              eq(contributionVerdict.userId, userId),
              eq(contributionVerdict.verdict, "contest"),
              gt(contributionVerdict.createdAt, new Date(Date.now() - DAY_MS)),
            ),
          );
        if ((today?.total ?? 0) >= CONTESTS_A_DAY) {
          context.reply.retryAfterSeconds = 60 * 60;
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: `An account contests at most ${CONTESTS_A_DAY} contributions in a day.`,
          });
        }

        await tx
          .insert(contributionVerdict)
          .values({ contributionId: held.id, userId, verdict: "contest", reason: input.reason })
          .onConflictDoUpdate({
            target: [contributionVerdict.contributionId, contributionVerdict.userId],
            set: { verdict: "contest", reason: input.reason, createdAt: sql`now()` },
          });
        return { contested: true as const };
      });
    }),
};
