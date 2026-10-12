import type { Database } from "@repo/db";
import { breakContribution, rankAward } from "@repo/db/schema/community";
import { and, eq, inArray, sql } from "drizzle-orm";

import { higherRank, pointsOf, type Rank, ranksAt, TRUSTED_FROM } from "./community";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;

/** Where an account stands: what its confirmed contributions count for, and the rank it reached. */
export type Standing = {
  score: number;
  // How many of its contributions are confirmed, each line of a break once.
  confirmed: number;
  rank: Rank | null;
  // Whether its lists of words show at once, as waiting to be confirmed.
  trusted: boolean;
};

const NONE: Standing = { score: 0, confirmed: 0, rank: null, trusted: false };

/**
 * The score of each account, from its confirmed contributions: nothing keeps it. A line of a
 * break counts once for an account, however often it wrote it. A break that left the catalogue
 * still counts, each of its rows as a line of its own.
 */
async function scoresOf(db: Reader, userIds: string[]) {
  const scores = new Map<string, { score: number; confirmed: number }>();
  if (userIds.length === 0) return scores;
  const place = sql`coalesce(${breakContribution.breakId}, ${breakContribution.id})`;
  const credited = await db
    .select({ userId: breakContribution.userId, line: breakContribution.line })
    .from(breakContribution)
    .where(
      and(inArray(breakContribution.userId, userIds), eq(breakContribution.status, "confirmed")),
    )
    .groupBy(breakContribution.userId, place, breakContribution.line);
  for (const row of credited) {
    if (row.userId === null) continue;
    const so = scores.get(row.userId) ?? { score: 0, confirmed: 0 };
    scores.set(row.userId, { score: so.score + pointsOf(row.line), confirmed: so.confirmed + 1 });
  }
  return scores;
}

/**
 * Where each of some accounts stands. An account's rank is the highest it reached: the one its
 * score gives now, or one it was awarded before a contribution of its own was refused.
 */
export async function standingsOf(db: Reader, userIds: string[]) {
  const ids = [...new Set(userIds)];
  const standings = new Map<string, Standing>();
  if (ids.length === 0) return standings;
  const scores = await scoresOf(db, ids);
  const awards = await db
    .select({ userId: rankAward.userId, rank: rankAward.rank })
    .from(rankAward)
    .where(inArray(rankAward.userId, ids));

  for (const id of ids) {
    const { score, confirmed } = scores.get(id) ?? NONE;
    let rank = ranksAt(score).at(-1) ?? null;
    for (const award of awards) if (award.userId === id) rank = higherRank(rank, award.rank);
    standings.set(id, { score, confirmed, rank, trusted: confirmed >= TRUSTED_FROM });
  }
  return standings;
}

/** Where one account stands. */
export async function standingOf(db: Reader, userId: string) {
  return (await standingsOf(db, [userId])).get(userId) ?? NONE;
}

/**
 * Writes the ranks some accounts have just reached, in the transaction that raised their score:
 * a rank is kept from the day it is reached, whatever becomes of the score later.
 */
export async function settleRanks(tx: Transaction, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((id) => id !== null))];
  const scores = await scoresOf(tx, ids);
  const reached = ids.flatMap((userId) =>
    ranksAt(scores.get(userId)?.score ?? 0).map((rank) => ({ userId, rank })),
  );
  if (reached.length > 0) await tx.insert(rankAward).values(reached).onConflictDoNothing();
}
