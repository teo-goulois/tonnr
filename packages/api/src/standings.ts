import type { Database } from "@repo/db";
import { breakContribution, rankAward, sponsorship } from "@repo/db/schema/community";
import { and, eq, inArray } from "drizzle-orm";

import { higherRank, POINTS, pointsOf, type Rank, ranksAt, TRUSTED_FROM } from "./community";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;

/** Where an account stands: what its confirmed contributions count for, and the rank it reached. */
export type Standing = {
  score: number;
  // How many of its contributions are confirmed, each line of a break once.
  confirmed: number;
  // How many accounts it brought, through its link, that had a contribution confirmed.
  sponsorships: number;
  rank: Rank | null;
  // Whether its lists of words show at once, as waiting to be confirmed.
  trusted: boolean;
};

const NONE: Standing = { score: 0, confirmed: 0, sponsorships: 0, rank: null, trusted: false };

/**
 * The score of each account, from its confirmed contributions: nothing keeps it. A line of a
 * break counts once for an account, however often it wrote it, and still does once the break
 * has left the catalogue. An account that another was made through counts for that other once
 * it has a contribution confirmed.
 */
async function scoresOf(db: Reader, userIds: string[]) {
  const scores = new Map<string, { score: number; confirmed: number; sponsorships: number }>();
  if (userIds.length === 0) return scores;
  const credited = await db
    .select({ userId: breakContribution.userId, line: breakContribution.line })
    .from(breakContribution)
    .where(
      and(inArray(breakContribution.userId, userIds), eq(breakContribution.status, "confirmed")),
    )
    .groupBy(breakContribution.userId, breakContribution.breakRef, breakContribution.line);
  for (const row of credited) {
    if (row.userId === null) continue;
    const so = scores.get(row.userId) ?? { score: 0, confirmed: 0, sponsorships: 0 };
    scores.set(row.userId, {
      ...so,
      score: so.score + pointsOf(row.line),
      confirmed: so.confirmed + 1,
    });
  }

  const brought = await db
    .select({ sponsorId: sponsorship.sponsorId, sponsoredId: sponsorship.sponsoredId })
    .from(sponsorship)
    .where(inArray(sponsorship.sponsorId, userIds));
  if (brought.length === 0) return scores;
  const contributed = await db
    .select({ userId: breakContribution.userId })
    .from(breakContribution)
    .where(
      and(
        inArray(
          breakContribution.userId,
          brought.map((row) => row.sponsoredId),
        ),
        eq(breakContribution.status, "confirmed"),
      ),
    )
    .groupBy(breakContribution.userId);
  const active = new Set(contributed.map((row) => row.userId));
  for (const row of brought) {
    if (row.sponsorId === null || !active.has(row.sponsoredId)) continue;
    const so = scores.get(row.sponsorId) ?? { score: 0, confirmed: 0, sponsorships: 0 };
    scores.set(row.sponsorId, {
      ...so,
      score: so.score + POINTS.sponsorship,
      sponsorships: so.sponsorships + 1,
    });
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
    const { score, confirmed, sponsorships } = scores.get(id) ?? NONE;
    let rank = ranksAt(score).at(-1) ?? null;
    for (const award of awards) if (award.userId === id) rank = higherRank(rank, award.rank);
    standings.set(id, {
      score,
      confirmed,
      sponsorships,
      rank,
      trusted: confirmed >= TRUSTED_FROM,
    });
  }
  return standings;
}

/** Where one account stands. */
export async function standingOf(db: Reader, userId: string) {
  return (await standingsOf(db, [userId])).get(userId) ?? NONE;
}

/** The account another was made through. Null for an account that has no sponsor. */
export async function sponsorOf(db: Reader, userId: string | null) {
  if (userId === null) return null;
  const [found] = await db
    .select({ sponsorId: sponsorship.sponsorId })
    .from(sponsorship)
    .where(eq(sponsorship.sponsoredId, userId));
  return found?.sponsorId ?? null;
}

/**
 * Writes the ranks some accounts have just reached, in the transaction that raised their score:
 * a rank is kept from the day it is reached, whatever becomes of the score later. The account
 * each of them was made through is settled with it: its score may have gone up too. Whatever
 * calls this holds those accounts' rows since its first step, with `holdAccounts`: of two
 * transactions that raise one score at once, the second then counts what the first wrote, and
 * neither misses a rank that the two reach together.
 */
export async function settleRanks(tx: Transaction, userIds: (string | null)[]) {
  const raised = [...new Set(userIds.filter((id) => id !== null))];
  if (raised.length === 0) return;
  const sponsors = await tx
    .select({ sponsorId: sponsorship.sponsorId })
    .from(sponsorship)
    .where(inArray(sponsorship.sponsoredId, raised));
  const ids = [...new Set([...raised, ...sponsors.flatMap((row) => row.sponsorId ?? [])])];
  const scores = await scoresOf(tx, ids);
  const reached = ids.flatMap((userId) =>
    ranksAt(scores.get(userId)?.score ?? 0).map((rank) => ({ userId, rank })),
  );
  if (reached.length > 0) await tx.insert(rankAward).values(reached).onConflictDoNothing();
}
