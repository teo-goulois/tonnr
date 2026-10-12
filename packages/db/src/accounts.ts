import { eq } from "drizzle-orm";

import type { Database } from "./index";
import { accountSuspension } from "./schema/access";
import { user } from "./schema/auth";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Holds the rows of some accounts until the transaction ends, one after the other in the order
 * of their ids: two transactions that hold the same accounts then never wait on each other.
 * What changes an account's score, its friends or what it has waiting holds it first, before
 * anything else, so that two such changes run one after the other. The hold leaves a row free to
 * be pointed at: writing a row that names the account does not wait for it.
 */
export async function holdAccounts(tx: Transaction, ids: (string | null | undefined)[]) {
  const held = [...new Set(ids.filter((id) => id != null))].sort();
  for (const id of held) {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, id)).for("no key update");
  }
}

/** Whether an operator suspended this account: decision 025. */
export async function isSuspended(db: Pick<Database, "select">, userId: string) {
  const [found] = await db
    .select({ userId: accountSuspension.userId })
    .from(accountSuspension)
    .where(eq(accountSuspension.userId, userId));
  return found !== undefined;
}
