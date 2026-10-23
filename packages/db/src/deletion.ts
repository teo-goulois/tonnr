import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import { and, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";

import { holdAccounts, holdLine } from "./accounts";
import { recordAction } from "./actions";
import type { Database } from "./index";
import { operator, removedUsername } from "./schema/access";
import { account, user } from "./schema/auth";
import { breakContribution } from "./schema/community";

// Deleting an account: decision 071. The API deletes the account that asks, and the worker's
// command `job account-delete` one that asked by mail, so the rules are here, where both read
// them.

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the sign-in library keeps of one link of an account to Apple, which Apple revokes: the
 * Apple account it names, the same for the web's sign-in and the app's, and its tokens.
 */
export type AppleLink = {
  appleUser: string;
  refreshToken: string | null;
  accessToken: string | null;
};

/** Whether this account runs the instance: an operator's account is not deleted. */
export async function isOperator(db: Pick<Database, "select">, userId: string) {
  const [runs] = await db
    .select({ userId: operator.userId })
    .from(operator)
    .where(eq(operator.userId, userId));
  return runs !== undefined;
}

/**
 * Deletes what the account wrote that was never confirmed, each line held as decision 041
 * orders, after the account's row: what waits, what was refused or taken back, and what another
 * confirmation closed. Left to the cascade, they would stay with no name on them. What was
 * confirmed stays, and names nobody once the row of `user` goes.
 */
async function deleteUnconfirmed(tx: Transaction, userId: string) {
  const rows = await tx
    .select({
      id: breakContribution.id,
      breakRef: breakContribution.breakRef,
      line: breakContribution.line,
    })
    .from(breakContribution)
    .where(and(eq(breakContribution.userId, userId), ne(breakContribution.status, "confirmed")));
  // Each line once, always in the same order.
  const lines = [...new Set(rows.map((row) => `${row.breakRef}\u0000${row.line}`))].sort();
  for (const held of lines) {
    const [breakRef = "", line = ""] = held.split("\u0000");
    await holdLine(tx, breakRef, line);
  }
  if (rows.length === 0) return;
  await tx.delete(breakContribution).where(
    and(
      inArray(
        breakContribution.id,
        rows.map((row) => row.id),
      ),
      // What was confirmed meanwhile, before the line was held, stays.
      ne(breakContribution.status, "confirmed"),
    ),
  );
}

/**
 * Deletes an account, in the transaction it is given: the account's row held first, as decision
 * 041 orders, so that a change of its friends, of a score or of what it has waiting waits for the
 * deletion, or finds the account gone; then what it wrote that was never confirmed; its username
 * kept from everyone for thirty days; the operators' record, which names it by its id; and the
 * row, after which the database's cascade takes the rest. It answers the links to Apple whose
 * tokens Apple is asked to revoke once the transaction has ended, and refuses an operator and an
 * account that is not there.
 */
export async function deleteAccount(
  tx: Transaction,
  userId: string,
  record: {
    // `account.delete` when the account asked itself, `account.delete_by_command` when an
    // operator ran `job account-delete` for it.
    action: "account.delete" | "account.delete_by_command";
    // The account that asked, which the deletion sets to null at once, or null for a command.
    operatorId: string | null;
  },
): Promise<{ deleted: true; apple: AppleLink[] } | { deleted: false; why: "gone" | "operator" }> {
  await holdAccounts(tx, [userId]);
  const [had] = await tx.select({ username: user.username }).from(user).where(eq(user.id, userId));
  if (!had) return { deleted: false, why: "gone" };
  // Made an operator meanwhile, by `job operator`, which holds the row too.
  if (await isOperator(tx, userId)) return { deleted: false, why: "operator" };
  await deleteUnconfirmed(tx, userId);
  const apple = await tx
    .select({
      appleUser: account.accountId,
      refreshToken: account.refreshToken,
      accessToken: account.accessToken,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "apple")));

  // Its username is nobody's for thirty days: no one takes it at once and passes for the
  // account. One that an operator took away for good stays so.
  if (had.username) {
    const freeAt = new Date(Date.now() + DELETED_USERNAME_DAYS * DAY_MS);
    await tx
      .insert(removedUsername)
      .values({ username: had.username, freeAt })
      .onConflictDoUpdate({
        target: removedUsername.username,
        set: { at: new Date(), freeAt },
        setWhere: isNotNull(removedUsername.freeAt),
      });
  }

  // The operators' record keeps that it was deleted, and when, by its id alone.
  await recordAction(tx, {
    operatorId: record.operatorId,
    action: record.action,
    developer: null,
    account: { id: userId },
  });
  // The database does the rest: what goes with the account, and what is set to null.
  await tx.delete(user).where(eq(user.id, userId));
  return { deleted: true, apple };
}

/**
 * Forgets the usernames of deleted accounts once they are free again, so that the instance keeps
 * none of them past its thirty days. Those an operator took away stay, for good. The worker runs
 * it every night: decision 071.
 */
export async function forgetFreedUsernames(db: Pick<Database, "delete">, now = new Date()) {
  const forgotten = await db
    .delete(removedUsername)
    .where(and(isNotNull(removedUsername.freeAt), lt(removedUsername.freeAt, now)))
    .returning({ username: removedUsername.username });
  return forgotten.length;
}
