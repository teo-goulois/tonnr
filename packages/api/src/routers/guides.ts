import { ORPCError } from "@orpc/server";
import { user } from "@repo/db/schema/auth";
import {
  breakAnswer,
  breakContribution,
  CONTRIBUTION_LICENSES,
  CONTRIBUTION_VERDICTS,
  contributionVerdict,
  GUIDE_ANSWERS,
  GUIDE_LANGUAGES,
  GUIDE_QUESTIONS,
  GUIDE_TEXT_LINES,
  GUIDE_WORD_LINES,
} from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import {
  ANSWERS_SHOWN_FROM,
  type GuideLine,
  isTextLine,
  isWordLine,
  mayConfirm,
  SHOWN_MOST,
} from "../community";
import { authorSchema, authorsOf, type Contribution, keepsBreak, valueSchema } from "../guides";
import { callerProcedure, protectedProcedure } from "../index";
import { standingOf } from "../standings";

const GUIDE_LINES = [...GUIDE_WORD_LINES, ...GUIDE_TEXT_LINES] as const;

const proposedSchema = z.object({
  id: z.string(),
  value: valueSchema,
  // The language a text is written in. Null for a list of words.
  language: z.enum(GUIDE_LANGUAGES).nullable(),
  // Who wrote it. Null once its account is deleted, or has no username.
  by: authorSchema.nullable(),
  at: z.date(),
  // How many accounts that keep the break said it is right. They are counted and never named:
  // a name would tell which breaks an account keeps.
  confirmations: z.number(),
});

const lineSchema = z.object({
  line: z.enum(GUIDE_LINES),
  // What the guide says. Null where nobody has said.
  value: valueSchema.nullable(),
  // Where it comes from: the list the break was added from, or a contribution that was
  // confirmed. Null with no value.
  origin: z.enum(["list", "contribution"]).nullable(),
  // Of a contribution: which, who wrote it, when it was confirmed, in what language for a text,
  // and the terms its author gave it under. Null otherwise.
  contributionId: z.string().nullable(),
  by: authorSchema.nullable(),
  at: z.date().nullable(),
  language: z.enum(GUIDE_LANGUAGES).nullable(),
  license: z.enum(CONTRIBUTION_LICENSES).nullable(),
  // What accounts whose words show at once wrote of this line, and nobody has confirmed yet:
  // the latest first. It is not what the guide says.
  proposed: z.array(proposedSchema),
});

const spreadSchema = z.object({
  question: z.enum(GUIDE_QUESTIONS),
  // How many accounts answered.
  total: z.number(),
  // How many gave each answer. Null until enough accounts answered: fewer, and it would be one
  // account's word.
  counts: z.record(z.string(), z.number()).nullable(),
});

const guideSchema = z.object({
  breakId: z.string(),
  lines: z.array(lineSchema),
  answers: z.array(spreadSchema),
});

type Reader = Parameters<typeof authorsOf>[0];

function noBreak(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No break "${id}".` });
}

/** How the answers to the questions about a break spread. */
async function spreadsOf(db: Reader, breakId: string) {
  const counted = await db
    .select({ question: breakAnswer.question, answer: breakAnswer.answer, total: count() })
    .from(breakAnswer)
    .where(eq(breakAnswer.breakId, breakId))
    .groupBy(breakAnswer.question, breakAnswer.answer);
  return GUIDE_QUESTIONS.map((question) => {
    const mine = counted.filter((row) => row.question === question);
    const total = mine.reduce((sum, row) => sum + row.total, 0);
    return {
      question,
      total,
      counts:
        total >= ANSWERS_SHOWN_FROM
          ? Object.fromEntries(
              GUIDE_ANSWERS[question].map((answer) => [
                answer,
                mine.find((row) => row.answer === answer)?.total ?? 0,
              ]),
            )
          : null,
    };
  });
}

export const guidesRouter = {
  get: callerProcedure
    .route({
      method: "GET",
      path: "/breaks/{breakId}/guide",
      summary: "What is written of a surf break, line by line",
      description:
        "The guide of a break of the catalogue: its lists of words, as `GET /breaks/{id}` gives " +
        "them in `characteristics`, and four short texts, on the access, on where to enter the " +
        "water, on the hazards and on the rules of the place. Each line says where its value " +
        "comes from: the list the break was added from, or a contribution of an account, which " +
        "an operator or the accounts that keep the break confirmed. A contribution names its " +
        "author by a username and a rank. A text is given in the language asked for when " +
        "someone wrote one, and in another otherwise. `proposed` holds what was written and " +
        "not confirmed yet. `answers` says how the accounts that answered spread on three " +
        `questions, once ${ANSWERS_SHOWN_FROM} of them did. Decision 041.`,
      tags: ["Guides"],
    })
    .input(z.object({ breakId: z.uuid(), language: z.enum(GUIDE_LANGUAGES).default("en") }))
    .output(guideSchema)
    .handler(async ({ input, context }) => {
      const { db } = context;
      const [found] = await db.select().from(surfBreak).where(eq(surfBreak.id, input.breakId));
      if (!found) throw noBreak(input.breakId);

      // The latest confirmed row of each line, and of each language for a text.
      const confirmed = await db
        .selectDistinctOn([breakContribution.line, breakContribution.language])
        .from(breakContribution)
        .where(
          and(
            eq(breakContribution.breakId, found.id),
            eq(breakContribution.status, "confirmed"),
            ne(breakContribution.line, "place"),
          ),
        )
        .orderBy(
          breakContribution.line,
          breakContribution.language,
          desc(breakContribution.confirmedAt),
          desc(breakContribution.id),
        );
      const shown = await db
        .select()
        .from(breakContribution)
        .where(and(eq(breakContribution.breakId, found.id), eq(breakContribution.status, "shown")))
        .orderBy(desc(breakContribution.shownAt), desc(breakContribution.id))
        .limit(GUIDE_LINES.length * SHOWN_MOST * 4);
      const said =
        shown.length > 0
          ? await db
              .select({ contributionId: contributionVerdict.contributionId, total: count() })
              .from(contributionVerdict)
              .where(
                and(
                  inArray(
                    contributionVerdict.contributionId,
                    shown.map((row) => row.id),
                  ),
                  eq(contributionVerdict.verdict, "confirm"),
                ),
              )
              .groupBy(contributionVerdict.contributionId)
          : [];
      const confirmations = new Map(said.map((row) => [row.contributionId, row.total]));
      const authors = await authorsOf(
        db,
        [...confirmed, ...shown].map((row) => row.userId),
      );
      const by = (row: Contribution) => (row.userId ? (authors.get(row.userId) ?? null) : null);

      const lines = GUIDE_LINES.map((line: GuideLine) => {
        const mine = confirmed.filter((row) => row.line === line);
        // A text in the reader's language first, and else the latest in another.
        const latest =
          mine.find((row) => row.language === input.language) ??
          mine.toSorted(
            (one, other) => (other.confirmedAt?.getTime() ?? 0) - (one.confirmedAt?.getTime() ?? 0),
          )[0];
        const listed = isWordLine(line) ? found[line] : null;
        const proposed = shown
          .filter((row) => row.line === line)
          .slice(0, SHOWN_MOST)
          .map((row) => ({
            id: row.id,
            value: row.value,
            language: row.language,
            by: by(row),
            at: row.shownAt ?? row.createdAt,
            confirmations: confirmations.get(row.id) ?? 0,
          }));
        if (latest) {
          return {
            line,
            value: latest.value,
            origin: "contribution" as const,
            contributionId: latest.id,
            by: by(latest),
            at: latest.confirmedAt,
            language: latest.language,
            license: latest.license,
            proposed,
          };
        }
        return {
          line,
          value: listed,
          origin: listed === null ? null : ("list" as const),
          contributionId: null,
          by: null,
          at: null,
          language: null,
          license: null,
          proposed,
        };
      });
      return { breakId: found.id, lines, answers: await spreadsOf(db, found.id) };
    }),

  mine: protectedProcedure
    .route({
      method: "GET",
      path: "/breaks/{breakId}/guide/mine",
      summary: "What the caller wrote of a break, and what it may do there",
      description:
        "Takes a signed-in session. It gives the caller's contributions that wait, what it " +
        "said of the contributions of others, its answers to the three questions, and whether " +
        "it keeps the break: an account that holds a break in a list of its own, or has a spot " +
        "of its own on it, may contest what is written there, and confirm it once one of its " +
        "own contributions was confirmed. Decision 041.",
      tags: ["Guides"],
    })
    .input(z.object({ breakId: z.uuid() }))
    .output(
      z.object({
        // The caller's username. Null for an account that has chosen none: it chooses one
        // before it contributes.
        username: z.string().nullable(),
        // Whether its lists of words show at once, as waiting to be confirmed.
        trusted: z.boolean(),
        // Whether it keeps the break, and so may contest what is written of it.
        keeps: z.boolean(),
        // Whether it may say that a contribution of another is right.
        mayConfirm: z.boolean(),
        // Its contributions to this break that wait: to be read, or to be confirmed.
        waiting: z.array(
          z.object({
            id: z.string(),
            line: z.enum(GUIDE_LINES),
            value: valueSchema,
            language: z.enum(GUIDE_LANGUAGES).nullable(),
            status: z.enum(["pending", "shown"]),
            createdAt: z.date(),
          }),
        ),
        // What it said of contributions of others to this break.
        verdicts: z.array(
          z.object({ contributionId: z.string(), verdict: z.enum(CONTRIBUTION_VERDICTS) }),
        ),
        // Its answers to the questions. A question it has not answered is left out.
        answers: z.partialRecord(z.enum(GUIDE_QUESTIONS), z.string()),
      }),
    )
    .handler(async ({ input, context }) => {
      const { db } = context;
      const userId = context.session.user.id;
      const [found] = await db
        .select({ id: surfBreak.id })
        .from(surfBreak)
        .where(eq(surfBreak.id, input.breakId));
      if (!found) throw noBreak(input.breakId);

      const [account] = await db
        .select({ username: user.username, emailVerified: user.emailVerified })
        .from(user)
        .where(eq(user.id, userId));
      const standing = await standingOf(db, userId);
      const keeps = await keepsBreak(db, userId, found.id);
      const waiting = await db
        .select()
        .from(breakContribution)
        .where(
          and(
            eq(breakContribution.breakId, found.id),
            eq(breakContribution.userId, userId),
            inArray(breakContribution.status, ["pending", "shown"]),
          ),
        )
        .orderBy(desc(breakContribution.createdAt));
      const verdicts = await db
        .select({
          contributionId: contributionVerdict.contributionId,
          verdict: contributionVerdict.verdict,
        })
        .from(contributionVerdict)
        .innerJoin(breakContribution, eq(breakContribution.id, contributionVerdict.contributionId))
        .where(
          and(eq(contributionVerdict.userId, userId), eq(breakContribution.breakId, found.id)),
        );
      const answered = await db
        .select({ question: breakAnswer.question, answer: breakAnswer.answer })
        .from(breakAnswer)
        .where(and(eq(breakAnswer.breakId, found.id), eq(breakAnswer.userId, userId)));

      return {
        username: account?.username ?? null,
        trusted: standing.trusted,
        keeps,
        mayConfirm: mayConfirm(context.verification.isOn, {
          keeps,
          emailVerified: account?.emailVerified ?? false,
          confirmed: standing.confirmed,
        }),
        waiting: waiting.flatMap((row) =>
          (isWordLine(row.line) || isTextLine(row.line)) &&
          (row.status === "pending" || row.status === "shown")
            ? [
                {
                  id: row.id,
                  line: row.line,
                  value: row.value,
                  language: row.language,
                  status: row.status,
                  createdAt: row.createdAt,
                },
              ]
            : [],
        ),
        verdicts,
        answers: Object.fromEntries(answered.map((row) => [row.question, row.answer])),
      };
    }),

  answer: protectedProcedure
    .meta({ analytics: "guide_question_answered" })
    .route({
      method: "PUT",
      path: "/breaks/{breakId}/guide/answers/{question}",
      summary: "Answer one of the questions about a break, or take the answer back",
      description:
        "Takes a signed-in session. How many people surf a break, how they take a visitor and " +
        "the level it asks are not one account's to state: each account gives its own answer, " +
        "once, and changes it here. `answer` null takes it back. The guide shows how the " +
        `answers spread once ${ANSWERS_SHOWN_FROM} accounts gave one, and never whose they ` +
        "are. An answer gives no points. Decision 041.",
      tags: ["Guides"],
    })
    .input(
      z.object({
        breakId: z.uuid(),
        question: z.enum(GUIDE_QUESTIONS),
        answer: z.string().max(40).nullable(),
      }),
    )
    .output(z.object({ spread: spreadSchema, answer: z.string().nullable() }))
    .handler(async ({ input, context }) => {
      const { db } = context;
      const userId = context.session.user.id;
      const words: readonly string[] = GUIDE_ANSWERS[input.question];
      if (input.answer !== null && !words.includes(input.answer)) {
        throw new ORPCError("BAD_REQUEST", {
          message: `"${input.question}" is answered with one of: ${words.join(", ")}.`,
        });
      }
      const [found] = await db
        .select({ id: surfBreak.id })
        .from(surfBreak)
        .where(eq(surfBreak.id, input.breakId));
      if (!found) throw noBreak(input.breakId);

      const mine = and(
        eq(breakAnswer.breakId, found.id),
        eq(breakAnswer.userId, userId),
        eq(breakAnswer.question, input.question),
      );
      if (input.answer === null) {
        await db.delete(breakAnswer).where(mine);
      } else {
        await db
          .insert(breakAnswer)
          .values({ breakId: found.id, userId, question: input.question, answer: input.answer })
          .onConflictDoUpdate({
            target: [breakAnswer.breakId, breakAnswer.userId, breakAnswer.question],
            set: { answer: input.answer, updatedAt: sql`now()` },
          });
      }
      const spreads = await spreadsOf(db, found.id);
      const spread = spreads.find((one) => one.question === input.question);
      if (!spread) throw noBreak(input.breakId);
      return { spread, answer: input.answer };
    }),
};
