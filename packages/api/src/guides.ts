import type { Database } from "@repo/db";
import { user } from "@repo/db/schema/auth";
import {
  breakContribution,
  GUIDE_LANGUAGES,
  GUIDE_WORD_LINES,
  RANKS,
} from "@repo/db/schema/community";
import { stationList, stationListBreak } from "@repo/db/schema/lists";
import { spot, type surfBreak } from "@repo/db/schema/spots";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { type GuideLine, isWordLine, type WordLine } from "./community";
import { settleRanks, standingsOf } from "./standings";

// What reads and writes the guide of a break, for the procedures that answer it, that take a
// contribution, and that an operator reads them with: decision 041.

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select" | "selectDistinctOn">;

export type Contribution = typeof breakContribution.$inferSelect;
export type Language = (typeof GUIDE_LANGUAGES)[number];
type Break = typeof surfBreak.$inferSelect;

/** What a line of a guide holds: a list of words of the catalogue, or a short text. */
export const valueSchema = z.union([z.array(z.string()), z.string()]);

/** Who wrote a line, as anyone reads it: its username and its rank, and nothing else. */
export const authorSchema = z.object({
  username: z.string(),
  rank: z.enum(RANKS).nullable(),
});

/** The lines of words that were confirmed for some breaks: for each line, its latest. */
export async function confirmedWordsOf(db: Reader, breakIds: string[]) {
  const confirmed = new Map<string, Partial<Record<WordLine, string[]>>>();
  if (breakIds.length === 0) return confirmed;
  // One query for a page of breaks, whatever its length: the latest row of each line.
  const rows = await db
    .selectDistinctOn([breakContribution.breakId, breakContribution.line], {
      breakId: breakContribution.breakId,
      line: breakContribution.line,
      value: breakContribution.value,
    })
    .from(breakContribution)
    .where(
      and(
        inArray(breakContribution.breakId, breakIds),
        eq(breakContribution.status, "confirmed"),
        inArray(breakContribution.line, GUIDE_WORD_LINES),
      ),
    )
    .orderBy(
      breakContribution.breakId,
      breakContribution.line,
      desc(breakContribution.confirmedAt),
      desc(breakContribution.id),
    );
  for (const row of rows) {
    if (row.breakId === null || !isWordLine(row.line) || !Array.isArray(row.value)) continue;
    confirmed.set(row.breakId, { ...confirmed.get(row.breakId), [row.line]: row.value });
  }
  return confirmed;
}

/**
 * What a line of a break says now: what was last confirmed for it, or else what the catalogue
 * holds from the list the break came from. A text is one of its language. Null where nobody has
 * said.
 */
export async function currentOf(
  db: Reader,
  found: Break,
  line: GuideLine,
  language: Language | null,
): Promise<string[] | string | null> {
  const [latest] = await db
    .select({ value: breakContribution.value })
    .from(breakContribution)
    .where(
      and(
        eq(breakContribution.breakId, found.id),
        eq(breakContribution.line, line),
        eq(breakContribution.status, "confirmed"),
        language === null
          ? isNull(breakContribution.language)
          : eq(breakContribution.language, language),
      ),
    )
    .orderBy(desc(breakContribution.confirmedAt), desc(breakContribution.id))
    .limit(1);
  if (latest) return latest.value;
  return isWordLine(line) ? found[line] : null;
}

/**
 * Whether an account keeps a break: it holds it in a list of its own, or has a spot of its own
 * on it. A list of someone else that it kept by its link says nothing of it.
 */
export async function keepsBreak(db: Reader, userId: string, breakId: string) {
  const [listed] = await db
    .select({ listId: stationListBreak.listId })
    .from(stationListBreak)
    .innerJoin(stationList, eq(stationList.id, stationListBreak.listId))
    .where(and(eq(stationList.userId, userId), eq(stationListBreak.breakId, breakId)))
    .limit(1);
  if (listed) return true;
  const [standing] = await db
    .select({ id: spot.id })
    .from(spot)
    .where(and(eq(spot.userId, userId), eq(spot.breakId, breakId)))
    .limit(1);
  return standing !== undefined;
}

// What holds a line of a guide lives beside what holds the accounts, in packages/db, where
// deleting an account reads it too: decision 071.
export { holdLine } from "@repo/db/accounts";

/** The username and the rank of each of some accounts that have a username. */
export async function authorsOf(db: Reader, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((id) => id !== null))];
  const authors = new Map<string, z.infer<typeof authorSchema>>();
  if (ids.length === 0) return authors;
  const named = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(inArray(user.id, ids));
  const standings = await standingsOf(db, ids);
  for (const account of named) {
    // An account whose username an operator took away is read under no name.
    if (account.username === null) continue;
    authors.set(account.id, {
      username: account.username,
      rank: standings.get(account.id)?.rank ?? null,
    });
  }
  return authors;
}

/**
 * Confirms a contribution that the transaction holds, with its line and the rows of its author
 * and of its author's sponsor: it becomes what its line says. Another that showed on the same
 * line as waiting to be confirmed is closed, since it was written of what the line said before.
 * The ranks its author reaches by it are written with it.
 */
export async function confirmHeld(tx: Transaction, held: Contribution, operatorId: string | null) {
  const now = new Date();
  const [confirmed] = await tx
    .update(breakContribution)
    .set({
      status: "confirmed",
      confirmedAt: now,
      shownAt: held.shownAt ?? now,
      ...(operatorId !== null && { decidedBy: operatorId, decidedAt: now }),
    })
    .where(eq(breakContribution.id, held.id))
    .returning();
  if (!confirmed) throw new Error(`The contribution "${held.id}" is gone.`);

  if (held.breakId !== null) {
    await tx
      .update(breakContribution)
      .set({ status: "superseded" })
      .where(
        and(
          eq(breakContribution.breakId, held.breakId),
          eq(breakContribution.line, held.line),
          eq(breakContribution.status, "shown"),
          ne(breakContribution.id, held.id),
          sql`${breakContribution.language} is not distinct from ${held.language}`,
        ),
      );
  }
  await settleRanks(tx, [held.userId]);
  return confirmed;
}
