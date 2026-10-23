import { hasInsult } from "@repo/config/insults";
import {
  USERNAME_INSULT,
  USERNAME_MAX,
  USERNAME_MIN,
  usernameProblem,
} from "@repo/config/username";
import type { Database } from "@repo/db";
import { removedUsername } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { and, eq, gt, isNull, or } from "drizzle-orm";

/**
 * Whether a username, in small letters, is kept from everyone: one an operator took away, for
 * good, or one of an account deleted in the last thirty days.
 */
export async function isUsernameKept(database: Pick<Database, "select">, given: string) {
  const [kept] = await database
    .select({ username: removedUsername.username })
    .from(removedUsername)
    .where(
      and(
        eq(removedUsername.username, given),
        or(isNull(removedUsername.freeAt), gt(removedUsername.freeAt, new Date())),
      ),
    );
  return kept !== undefined;
}

/**
 * What others read of an account: decision 041. The sign-in library keeps it, with its own
 * plugin, in small letters whatever was typed, so that no two accounts have names that differ by
 * a capital. The library can keep a second form beside it, as it was typed, and checks nothing
 * of that one: an account could write another's name there, so it is left out.
 *
 * A username an operator took away is nobody's to take again, the account's it was taken from
 * no more than another's. The username of an account that was deleted is nobody's for thirty
 * days: decision 071.
 */
export function usernames(database: Database) {
  return username({
    displayUsername: false,
    minUsernameLength: USERNAME_MIN,
    maxUsernameLength: USERNAME_MAX,
    usernameValidator: async (given) =>
      usernameProblem(given) === null && !(await isUsernameKept(database, given.toLowerCase())),
  });
}

/**
 * What keeps a username that is kept from everyone from coming back. The library checks a
 * username, then writes it, in two steps: an account that sends its own again at the moment an
 * operator takes it away is checked before the removal and written after it. So the username is
 * read again once it is written, and taken off when it is one that is kept.
 */
export function usernameHooks(database: Database) {
  const settle = async (written: { id: string; username?: unknown }) => {
    if (typeof written.username !== "string") return;
    if (!(await isUsernameKept(database, written.username))) return;
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
 * require, and checks nothing of it, so the request is refused before it gets there. A username
 * that holds an insult is refused here too, as an account signs up or chooses one, with a code
 * of its own, which the apps say in their words: the library's check says only that it is no
 * username (guideline 1.2, decision 041).
 */
export const keepsUsername = createAuthMiddleware(async (answering) => {
  if (answering.path !== "/update-user" && answering.path !== "/sign-up/email") return;
  const body: unknown = answering.body;
  if (typeof body !== "object" || body === null || !("username" in body)) return;
  if (typeof body.username === "string" && hasInsult(body.username)) {
    throw new APIError("BAD_REQUEST", {
      code: USERNAME_INSULT,
      message: "A username holds no insult.",
    });
  }
  if (answering.path !== "/update-user") return;
  if (typeof body.username !== "string") {
    throw new APIError("BAD_REQUEST", {
      message: "A username is changed for another. It is not taken off.",
    });
  }
});
