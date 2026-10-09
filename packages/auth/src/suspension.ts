import type { Database } from "@repo/db";
import { isSuspended } from "@repo/db/accounts";
import { session, user } from "@repo/db/schema/auth";
import { APIError } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";

/** The code of the sign-in's refusal for an account that an operator suspended. */
export const ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED";

const refusal = () =>
  new APIError("FORBIDDEN", { code: ACCOUNT_SUSPENDED, message: "This account is suspended." });

type Created = { id: string; userId: string };
// What the sign-in library hands a hook, as far as this reads it: the request it answers.
type Answering = Parameters<typeof deleteSessionCookie>[0] | null;

/**
 * What keeps a suspended account from opening a session: decision 025. The sign-in library
 * calls `before` when it is about to write a session, and `after` once it has written one.
 *
 * `before` refuses an account that is suspended. `after` catches the sign-in that was under way
 * when the suspension was written: a suspension holds the account's row while it closes the
 * sessions, so sharing that row here waits for it, and what is read next sees it. The session
 * that slipped in is then deleted, and the sign-in refused like any other.
 */
export function suspensionHooks(database: Database) {
  return {
    before: async (created: { userId: string }) => {
      if (await isSuspended(database, created.userId)) throw refusal();
    },
    after: async (created: Created, answering: Answering) => {
      const closed = await database.transaction(async (tx) => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, created.userId)).for("share");
        // A statement of its own, after the lock: it sees what was written while this waited.
        if (!(await isSuspended(tx, created.userId))) return false;
        await tx.delete(session).where(eq(session.id, created.id));
        return true;
      });
      if (!closed) return;

      // The deletion is written. The refusal comes after it, so that it does not undo it.
      if (answering) {
        try {
          deleteSessionCookie(answering);
        } catch {
          // The cookie names a session that no longer exists: it opens nothing.
        }
      }
      throw refusal();
    },
  };
}
