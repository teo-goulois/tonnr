import { USERNAME_MAX, USERNAME_MIN, usernameProblem } from "@repo/config/username";
import type { Database } from "@repo/db";
import { removedUsername } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";

/**
 * What others read of an account: decision 041. The sign-in library keeps it, with its own
 * plugin, in small letters whatever was typed, so that no two accounts have names that differ by
 * a capital. The library can keep a second form beside it, as it was typed, and checks nothing
 * of that one: an account could write another's name there, so it is left out.
 *
 * A username an operator took away is nobody's to take again, the account's it was taken from
 * no more than another's.
 */
export function usernames(database: Database) {
  return username({
    displayUsername: false,
    minUsernameLength: USERNAME_MIN,
    maxUsernameLength: USERNAME_MAX,
    usernameValidator: async (given) => {
      if (usernameProblem(given) !== null) return false;
      const [removed] = await database
        .select({ username: removedUsername.username })
        .from(removedUsername)
        .where(eq(removedUsername.username, given.toLowerCase()));
      return removed === undefined;
    },
  });
}

/**
 * What keeps a username that an operator took away from coming back. The library checks a
 * username, then writes it, in two steps: an account that sends its own again at the moment an
 * operator takes it away is checked before the removal and written after it. So the username is
 * read again once it is written, and taken off when it is one that was removed.
 */
export function usernameHooks(database: Database) {
  const settle = async (written: { id: string; username?: unknown }) => {
    if (typeof written.username !== "string") return;
    const [removed] = await database
      .select({ username: removedUsername.username })
      .from(removedUsername)
      .where(eq(removedUsername.username, written.username));
    if (!removed) return;
    await database
      .update(user)
      .set({ username: null })
      .where(and(eq(user.id, written.id), eq(user.username, written.username)));
  };
  return { create: { after: settle }, update: { after: settle } };
}

/**
 * An account changes its username for another, and does not go back to none: what it wrote in a
 * guide would name nobody at its own word. The library takes `null` for a field it does not
 * require, and checks nothing of it, so the request is refused before it gets there.
 */
export const keepsUsername = createAuthMiddleware(async (answering) => {
  if (answering.path !== "/update-user") return;
  const body: unknown = answering.body;
  if (typeof body !== "object" || body === null || !("username" in body)) return;
  if (typeof body.username !== "string") {
    throw new APIError("BAD_REQUEST", {
      message: "A username is changed for another. It is not taken off.",
    });
  }
});
