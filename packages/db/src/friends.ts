import { and, count, eq, isNull, or } from "drizzle-orm";

import { holdAccounts } from "./accounts";
import type { Database } from "./index";
import { accountLink, friendship, sponsorship } from "./schema/community";

// What makes two accounts friends and one the sponsor of another: decision 041. The sign-in
// library does it for an account that is made through a link, and the API for one that exists
// already, so the rules are here, where both read them.

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;

// How many friends an account has at most.
export const FRIENDS_MOST = 200;

/**
 * The two accounts of a friendship as its row names them: the one whose id sorts first, then
 * the other. They are sorted byte by byte, which is the order the table checks them in: the
 * language sorts by another, and so does the database's own collation.
 */
export function pairOf(one: string, other: string) {
  return Buffer.compare(Buffer.from(one), Buffer.from(other)) < 0
    ? { userId: one, friendId: other }
    : { userId: other, friendId: one };
}

/** The account a link is of. Null for a link that opens nothing. */
export async function ownerOfLink(db: Reader, token: string) {
  const [link] = await db
    .select({ userId: accountLink.userId })
    .from(accountLink)
    .where(eq(accountLink.token, token));
  return link?.userId ?? null;
}

/** How many friends an account has. */
export async function friendsOf(db: Reader, userId: string) {
  const [counted] = await db
    .select({ total: count() })
    .from(friendship)
    .where(
      and(
        or(eq(friendship.userId, userId), eq(friendship.friendId, userId)),
        isNull(friendship.endedAt),
      ),
    );
  return counted?.total ?? 0;
}

/**
 * Makes two accounts friends, at the word of `by`, who opened the link of `owner`. It answers
 * `made`, `already` for two that are friends, `ended` when the link's owner ended the
 * friendship, which its link no longer makes, and `full` when either has all the friends an
 * account may have. Whoever ended a friendship makes it again by opening the other's link.
 */
export async function befriend(tx: Transaction, by: string, owner: string) {
  // Both accounts are held first: of two friendships made at once, the second counts the first,
  // and one that is being ended is ended before this reads it.
  await holdAccounts(tx, [by, owner]);
  const pair = pairOf(by, owner);
  const [found] = await tx
    .select()
    .from(friendship)
    .where(and(eq(friendship.userId, pair.userId), eq(friendship.friendId, pair.friendId)))
    .for("update");
  if (found && found.endedAt === null) return "already" as const;
  if (found && found.endedBy !== by) return "ended" as const;
  if ((await friendsOf(tx, by)) >= FRIENDS_MOST || (await friendsOf(tx, owner)) >= FRIENDS_MOST) {
    return "full" as const;
  }
  await tx
    .insert(friendship)
    .values(pair)
    .onConflictDoUpdate({
      target: [friendship.userId, friendship.friendId],
      set: { endedBy: null, endedAt: null, createdAt: new Date() },
    });
  return "made" as const;
}

/** Records that an account was made through another's link. An account has one sponsor, for good. */
export async function sponsor(tx: Transaction, sponsorId: string, sponsoredId: string) {
  await tx.insert(sponsorship).values({ sponsorId, sponsoredId }).onConflictDoNothing();
}
