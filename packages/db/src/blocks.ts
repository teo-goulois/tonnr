import { and, eq, or, type SQL, sql, type SQLWrapper } from "drizzle-orm";

import type { Database } from "./index";
import { accountBlock } from "./schema/community";

// What an account that blocked another no longer reads of it: decision 071. The API leaves it
// out of what it answers the blocker, and the worker out of what it tells the blocker, so the
// rules are here, where both read them. A block goes one way: the blocked account reads
// everything as before.

type Reader = Pick<Database, "select">;

// How many accounts an account blocks at most.
export const BLOCKS_MOST = 500;

/** The accounts an account blocked, by their ids. Empty for no account, as a visitor is. */
export async function blockedBy(db: Reader, blockerId: string | null | undefined) {
  if (!blockerId) return new Set<string>();
  const rows = await db
    .select({ blockedId: accountBlock.blockedId })
    .from(accountBlock)
    .where(eq(accountBlock.blockerId, blockerId));
  return new Set(rows.map((row) => row.blockedId));
}

/** Which of two accounts blocked the other: `one`, `other`, or null when neither did. */
export async function blockBetween(db: Reader, one: string, other: string) {
  const rows = await db
    .select({ blockerId: accountBlock.blockerId })
    .from(accountBlock)
    .where(
      or(
        and(eq(accountBlock.blockerId, one), eq(accountBlock.blockedId, other)),
        and(eq(accountBlock.blockerId, other), eq(accountBlock.blockedId, one)),
      ),
    );
  if (rows.some((row) => row.blockerId === one)) return "one" as const;
  if (rows.length > 0) return "other" as const;
  return null;
}

/**
 * A condition of a query: the account `author` names is not one that `blocker` blocked. Each is
 * an id or what names one in the query. For a query that leaves out of its answer what a blocked
 * account wrote, and that the worker tells no blocker of.
 */
export function notBlockedBy(blocker: SQLWrapper | string, author: SQLWrapper | string): SQL {
  return sql`not exists (select 1 from ${accountBlock} where ${accountBlock.blockerId} = ${blocker} and ${accountBlock.blockedId} = ${author})`;
}
