import type { Database } from "@repo/db";
import { account } from "@repo/db/schema/auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, isNotNull } from "drizzle-orm";

// An account's password, as the sign-in library keeps it, for what asks for it again outside the
// library's own routes: deleting the account, decision 071.

/** The hash of an account's password. Null for an account that signs in with another service alone. */
export async function passwordHashOf(db: Pick<Database, "select">, userId: string) {
  const [found] = await db
    .select({ password: account.password })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
      ),
    );
  return found?.password ?? null;
}

/** Whether a password is the one an account chose, compared as the library compares it. */
export function isPassword(hash: string, given: string) {
  return verifyPassword({ hash, password: given });
}

/** A password as the library keeps it: for a test that makes an account with one. */
export function passwordHash(given: string) {
  return hashPassword(given);
}
