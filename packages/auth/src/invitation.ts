import type { Database } from "@repo/db";
import { befriend, ownerOfLink, sponsor } from "@repo/db/friends";
import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware, getOAuthState } from "better-auth/api";

type InvitedAccount = { id: string; username?: unknown };

async function keepInvitation(database: Database, made: InvitedAccount, token: unknown) {
  if (typeof token !== "string" || token.length > 64) return;
  await database.transaction(async (tx) => {
    const owner = await ownerOfLink(tx, token);
    if (owner === null || owner === made.id) return;
    await sponsor(tx, owner, made.id);
    if (typeof made.username === "string") await befriend(tx, made.id, owner);
  });
}

// Where a sign-in with a provider carries its link. Through a browser, in the OAuth state, which
// the callback reads back. With the ID token a provider's sheet gave an app, in the body's
// `additionalData`, which the library leaves unread on that route. Decision 070.
async function providerInvitation(context: GenericEndpointContext) {
  if (context.path === "/sign-in/social") {
    const body: unknown = context.body;
    const data =
      typeof body === "object" && body !== null && "additionalData" in body
        ? body.additionalData
        : undefined;
    return typeof data === "object" && data !== null && "invitation" in data
      ? data.invitation
      : undefined;
  }
  if (context.path === "/callback/:id") {
    return (await getOAuthState<{ invitation?: unknown }>())?.invitation;
  }
  return undefined;
}

/**
 * Runs only when a provider creates an account, through a browser or by an ID token; returning
 * accounts acquire no sponsor.
 */
export async function oauthInvitation(
  database: Database,
  made: InvitedAccount,
  context: GenericEndpointContext,
) {
  try {
    await keepInvitation(database, made, await providerInvitation(context));
  } catch {
    context.context.logger.error("An invitation was not kept");
  }
}

/**
 * An account that is made through another's link has the link's owner as its sponsor, and the
 * two are friends: decision 041. The link comes with the sign-up, in `invitation`, and is read
 * here once the account is made, so that only an account made through a link has a sponsor: one
 * that exists already and opens a link becomes a friend, and no more. An account with no
 * username is sponsored, and makes friends once it has one: a friend is read by a name.
 *
 * A link that opens nothing, or that fails, does not undo the sign-up: the account is made.
 */
export function invitations(database: Database) {
  return createAuthMiddleware(async (answering) => {
    if (answering.path !== "/sign-up/email") return;
    const body: unknown = answering.body;
    const token =
      typeof body === "object" && body !== null && "invitation" in body
        ? body.invitation
        : undefined;
    const made: { id: string; username?: unknown } | undefined = answering.context.newSession?.user;
    if (typeof token !== "string" || token.length > 64 || !made) return;

    try {
      await keepInvitation(database, made, token);
    } catch (error) {
      answering.context.logger.error("An invitation was not kept", error);
    }
  });
}
