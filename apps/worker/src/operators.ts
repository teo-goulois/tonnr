import type { Database } from "@repo/db";
import { apiKey, operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { and, eq, isNull } from "drizzle-orm";

import { cleanText } from "./clean-text";
import { type Outcome, readArguments, refused } from "./command";

const keys = (count: number) => `${count} ${count === 1 ? "key" : "keys"}`;

/**
 * The account with this id, in words that let whoever runs the command recognise it. The
 * account is held until the transaction ends, so that it is not deleted under the command.
 */
async function accountOf(db: Pick<Database, "select">, id: string) {
  const [account] = await db.select().from(user).where(eq(user.id, id)).for("share");
  if (!account) return null;
  const since = account.createdAt.toISOString().slice(0, 10);
  // Whoever created the account chose its name: a control character in it would redraw the
  // terminal this is read on.
  return `${cleanText(account.name)} <${cleanText(account.email)}>, an account since ${since}`;
}

const noAccount = (id: string) =>
  refused(`No account "${cleanText(id)}". An account reads its id, signed in, at GET /v1/account.`);

/**
 * `job operator <account id> [--write]`: names an account and, with `--write`, makes it an
 * operator of the instance. The account is given by its id, which only its holder reads, signed
 * in: an address proves nothing, since the instance does not check addresses.
 */
export async function grantOperator(db: Database, args: string[]): Promise<Outcome> {
  const read = readArguments(args);
  if (!read) return refused("Usage: job operator <account id> [--write]");
  const id = read.value;

  return db.transaction(async (tx) => {
    const who = await accountOf(tx, id);
    if (!who) return noAccount(id);

    const [already] = await tx.select().from(operator).where(eq(operator.userId, id));
    if (already) return { ok: true, lines: [`operator: ${who} is already an operator.`] };
    if (!read.write) {
      return {
        ok: true,
        lines: [
          `operator: ${who} would become an operator.`,
          "Nothing was changed. Run it again with --write to make it one.",
        ],
      };
    }

    await tx.insert(operator).values({ userId: id }).onConflictDoNothing();
    return { ok: true, lines: [`operator: ${who} is now an operator.`] };
  });
}

/**
 * `job operator-remove <account id> [--write]`: with `--write`, the account stops being an
 * operator and every key it made is revoked for good, so that none works again if the account
 * is made an operator later.
 */
export async function removeOperator(db: Database, args: string[]): Promise<Outcome> {
  const read = readArguments(args);
  if (!read) return refused("Usage: job operator-remove <account id> [--write]");
  const id = read.value;

  return db.transaction(async (tx) => {
    const who = await accountOf(tx, id);
    if (!who) return noAccount(id);

    const isLive = and(eq(apiKey.userId, id), isNull(apiKey.revokedAt));
    if (!read.write) {
      const [held] = await tx.select().from(operator).where(eq(operator.userId, id));
      if (!held) return refused(`operator: ${who} is not an operator.`);
      const live = await tx.select({ id: apiKey.id }).from(apiKey).where(isLive);
      return {
        ok: true,
        lines: [
          `operator: ${who} would stop being an operator, with ${keys(live.length)} revoked.`,
          "Nothing was changed. Run it again with --write to do it.",
        ],
      };
    }

    // The row goes first. Making a key holds it, so a key made at this instant is either
    // refused or there to be revoked.
    const removed = await tx.delete(operator).where(eq(operator.userId, id)).returning();
    if (removed.length === 0) return refused(`operator: ${who} is not an operator.`);
    const revoked = await tx
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(isLive)
      .returning({ id: apiKey.id });
    return {
      ok: true,
      lines: [`operator: ${who} is no longer an operator, with ${keys(revoked.length)} revoked.`],
    };
  });
}
