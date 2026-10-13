import { ORPCError } from "@orpc/server";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "@repo/db/schema/auth";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

// The assistants an account signed in to read it, and how it takes its word back: decision
// 047. The sign-in library keeps the account's agreement, one row for each assistant, and the
// tokens it made. The MCP server asks for that row at every request, so an assistant whose row
// is gone reads nothing more, though a token of its own still has minutes to live.

const agentSchema = z.object({
  // The assistant's client, as the sign-in library names it.
  clientId: z.string(),
  // What the assistant named itself, and its site: its own word, which nobody checked.
  name: z.string().nullable(),
  site: z.string().nullable(),
  // When the account agreed.
  since: z.date().nullable(),
});

export const agentsRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/agents",
      summary: "The assistants the caller signed in to read their account",
      description:
        "An assistant is an agent's client that the account allowed, on the web app's page, " +
        "to read what it keeps through the MCP server. Its name is the one it gave itself.",
      tags: ["Agents"],
    })
    .output(z.object({ agents: z.array(agentSchema) }))
    .handler(async ({ context }) => {
      const agents = await context.db
        .select({
          clientId: oauthConsent.clientId,
          name: oauthClient.name,
          site: oauthClient.uri,
          since: oauthConsent.createdAt,
        })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .where(eq(oauthConsent.userId, context.session.user.id))
        .orderBy(asc(oauthConsent.createdAt), asc(oauthConsent.id));
      return { agents };
    }),

  disconnect: protectedProcedure
    .route({
      method: "DELETE",
      path: "/agents/{clientId}",
      summary: "Take back what the caller allowed an assistant",
      description:
        "The assistant reads nothing more of the account from the next request on, and what " +
        "it holds gets it no new token. It may ask the account again.",
      tags: ["Agents"],
    })
    .input(z.object({ clientId: z.string().min(1).max(200) }))
    .output(z.object({ clientId: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { clientId } = input;
      const gone = await context.db.transaction(async (tx) => {
        const agreed = await tx
          .delete(oauthConsent)
          .where(and(eq(oauthConsent.clientId, clientId), eq(oauthConsent.userId, userId)))
          .returning({ id: oauthConsent.id });
        // What the assistant holds of the account's: nothing of it opens anything again.
        await tx
          .delete(oauthAccessToken)
          .where(and(eq(oauthAccessToken.clientId, clientId), eq(oauthAccessToken.userId, userId)));
        await tx
          .delete(oauthRefreshToken)
          .where(
            and(eq(oauthRefreshToken.clientId, clientId), eq(oauthRefreshToken.userId, userId)),
          );
        return agreed.length > 0;
      });
      if (!gone) throw new ORPCError("NOT_FOUND", { message: "No such assistant." });
      return { clientId };
    }),
};
