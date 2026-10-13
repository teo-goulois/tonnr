import { oauthProvider } from "@better-auth/oauth-provider";
import { APP_NAME } from "@repo/config/app";
import type { Database } from "@repo/db";
import { accountSuspension } from "@repo/db/schema/access";
import { oauthClient, oauthConsent, oauthResource, user } from "@repo/db/schema/auth";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { and, eq, exists, notExists, sql } from "drizzle-orm";

import type { Session } from "./index";

// What signs an agent in as an account: decision 047. An agent's client, such as a desktop
// assistant, opens a page where the account agrees, and is given a token that stands for that
// account at the MCP server, for reading. The sign-in library is the authorization server, by
// its own plugin: nothing here writes a token or checks one.

type AgentConfig = { BETTER_AUTH_URL: string; CORS_ORIGIN: string };

/**
 * What a token lets an agent do. `read` is what every tool of the MCP server asks for: an
 * agent reads what the account keeps, and changes nothing. `offline_access` lets its client
 * ask for a new token when one ends, without the account agreeing again. Neither says who the
 * account is: the library's own scopes, which give a name and an address, are left out.
 */
export const AGENT_SCOPES = ["read", "offline_access"] as const;

/** The MCP server's address, which a token is made for and for nothing else. */
export const agentResource = (env: AgentConfig) => new URL("/mcp", env.BETTER_AUTH_URL).href;

/** Who makes the tokens: the sign-in library, at its own address. */
export const agentIssuer = (env: AgentConfig) => new URL("/api/auth", env.BETTER_AUTH_URL).href;

/**
 * The web app's page where an account signs in and agrees, or does not. The library adds a
 * question mark and the query it signed to this address. The address ends with `#`, so that
 * the query comes after it: the browser then keeps it to itself. The web app's server never
 * reads it, and its router, which writes a query its own way and would undo the signature,
 * leaves it as it came.
 */
export const agentPage = (env: AgentConfig) => `${new URL("/connect", env.CORS_ORIGIN).href}#`;

// Where a client that runs on the account's own machine is sent back to: an address of that
// machine, or one that an app of its own answers.
function isOwnMachine(address: unknown) {
  if (typeof address !== "string" || !URL.canParse(address)) return false;
  const { protocol, hostname } = new URL(address);
  if (protocol === "https:") return false;
  return protocol !== "http:" || ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

/**
 * What this instance adds to the library's plugin, as a plugin that comes before it.
 *
 * The library writes the MCP server among what a token may be made for when it starts, by
 * looking for its row and then writing it. Two programs that start at once on one database
 * both look, both write, and the second fails and signs no one in. So the row is written
 * here first, in a statement that a second writer passes over, and the library finds it.
 *
 * The library also takes a client that does not say what it is for one of the web, and
 * refuses such a client an address of the account's own machine. The clients of agents that
 * run there, a terminal or a desktop app, register that way and say nothing: a client whose
 * every address is of its own machine is read as the app it is.
 */
const agentClients = (database: Database, resource: string) =>
  ({
    id: "agent-clients",
    init: async () => {
      const at = new Date();
      await database
        .insert(oauthResource)
        .values({
          id: crypto.randomUUID(),
          identifier: resource,
          name: resource,
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing({ target: oauthResource.identifier });
    },
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/oauth2/register",
          handler: createAuthMiddleware(async (answering) => {
            const body = answering.body as Record<string, unknown> | undefined;
            const addresses = body?.redirect_uris;
            if (!body || body.application_type !== undefined || !Array.isArray(addresses)) return;
            if (addresses.length === 0 || !addresses.every(isOwnMachine)) return;
            return { context: { body: { ...body, application_type: "native" } } };
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

/**
 * The plugins that make the sign-in library an authorization server for agents.
 *
 * - A client registers itself, with no account and no word from an operator: an account that
 *   adds the server to its assistant has nothing else to do. What a client says of itself is
 *   its own word, so the page that asks the account names where the client sends it back.
 * - No account makes or changes a client through the library's own routes for that.
 * - A token is made for the MCP server alone, and says `read`.
 */
export function agentSignIn(env: AgentConfig, database: Database) {
  const resource = agentResource(env);
  const page = agentPage(env);
  return [
    agentClients(database, resource),
    // The key the tokens are signed with. A session's answer carries no token of it.
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      // One page for both: it shows the form to whoever is not signed in, then asks.
      loginPage: page,
      consentPage: page,
      scopes: [...AGENT_SCOPES],
      resources: [resource],
      clientRegistrationDefaultResources: [resource],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientPrivileges: () => false,
      // A client that asks twice for a new token within these seconds, as one that tries
      // again does, is not taken for a thief of the first.
      refreshTokenReuseInterval: 10,
    }),
  ];
}

/** Where a client reads who makes the tokens: the address RFC 8414 gives the library's own. */
export const AGENT_SERVER_METADATA = "/.well-known/oauth-authorization-server/api/auth";
/** Where a client reads what the MCP server takes, as RFC 9728 names it for `/mcp`. */
export const AGENT_RESOURCE_METADATA = "/.well-known/oauth-protected-resource/mcp";
/** The same at the root, where a client that knows no path looks. */
export const AGENT_RESOURCE_METADATA_ROOT = "/.well-known/oauth-protected-resource";

type Payload = {
  sub?: unknown;
  azp?: unknown;
  client_id?: unknown;
  scope?: unknown;
  cnf?: unknown;
  jti?: unknown;
  iat?: unknown;
  exp?: unknown;
};

/**
 * What the MCP server asks of the sign-in library: the account a token stands for, what a
 * refusal tells a client that looks for where to sign in, and what the server says of itself.
 *
 * A token is read with the key it was signed with, kept some minutes, and no address is
 * called. It names its account, its client and what it lets do. Then one read of the database
 * says whether it still holds: the account exists and is not suspended, the client was not
 * closed, and the account still agrees. So an account that takes its word back, or one that
 * an operator suspends, is out at the next request, though the token itself lasts its hour.
 */
export function agentAccounts(
  env: AgentConfig,
  database: Database,
  auth: { api: { getJwks: () => Promise<unknown> } },
) {
  const resource = agentResource(env);
  const issuer = agentIssuer(env);
  // One object for every call: the library keeps the key under it.
  const jwksCacheKey = {};
  const metadata = new URL(AGENT_RESOURCE_METADATA, env.BETTER_AUTH_URL).href;

  return {
    challenge: `Bearer resource_metadata="${metadata}", scope="${AGENT_SCOPES.join(" ")}"`,

    resourceMetadata: {
      resource,
      resource_name: APP_NAME,
      authorization_servers: [issuer],
      scopes_supported: [...AGENT_SCOPES],
      bearer_methods_supported: ["header"],
    },

    async sessionOf(token: string): Promise<Session | null> {
      let payload: Payload;
      try {
        payload = await verifyJwsAccessToken(token, {
          jwksFetch: () => auth.api.getJwks() as never,
          jwksCacheKey,
          verifyOptions: { issuer, audience: resource },
        });
      } catch {
        // Not a token of this instance's, not one for this server, or one that has ended.
        return null;
      }
      const { sub: userId, exp } = payload;
      const clientId = payload.azp ?? payload.client_id;
      if (typeof userId !== "string" || typeof clientId !== "string" || typeof exp !== "number") {
        return null;
      }
      // A token a client made for itself names no account, and one tied to a key of its
      // client's asks for a proof this server does not read.
      if (userId === clientId || payload.cnf !== undefined) return null;
      if (
        !String(payload.scope ?? "")
          .split(" ")
          .includes("read")
      )
        return null;

      const [found] = await database
        .select({ user })
        .from(user)
        .where(
          and(
            eq(user.id, userId),
            notExists(
              database
                .select({ one: sql`1` })
                .from(accountSuspension)
                .where(eq(accountSuspension.userId, user.id)),
            ),
            exists(
              database
                .select({ one: sql`1` })
                .from(oauthClient)
                .where(
                  and(eq(oauthClient.clientId, clientId), sql`${oauthClient.disabled} is not true`),
                ),
            ),
            exists(
              database
                .select({ one: sql`1` })
                .from(oauthConsent)
                .where(and(eq(oauthConsent.clientId, clientId), eq(oauthConsent.userId, user.id))),
            ),
          ),
        );
      if (!found) return null;

      const at = new Date((typeof payload.iat === "number" ? payload.iat : exp) * 1000);
      return {
        user: found.user,
        // No session of the web app's: what the token says of its own life, under a name of
        // its own.
        session: {
          id: `agent:${typeof payload.jti === "string" ? payload.jti : clientId}`,
          userId,
          token: "",
          expiresAt: new Date(exp * 1000),
          createdAt: at,
          updatedAt: at,
          ipAddress: null,
          userAgent: null,
        },
      } as Session;
    },
  };
}
