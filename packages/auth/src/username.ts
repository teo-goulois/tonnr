import { USERNAME_MAX, USERNAME_MIN, usernameProblem } from "@repo/config/username";
import type { Database } from "@repo/db";
import { removedUsername } from "@repo/db/schema/access";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";

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
