import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { analyticsRequest, captureAction, type Analytics } from "@repo/api/analytics";
import type { Context } from "@repo/api/context";
import { clientAddressOf } from "@repo/api/address";
import { adminSitesOf, isCrossSiteWrite, siteOf } from "@repo/api/cross-site";
import { createMcp } from "@repo/api/mcp";
import { appRouter, v1Router } from "@repo/api/routers/index";
import type { Usage } from "@repo/api/usage";
import type { createAuth } from "@repo/auth";
import {
  AGENT_RESOURCE_METADATA,
  AGENT_RESOURCE_METADATA_ROOT,
  AGENT_SERVER_METADATA,
  agentAccounts,
} from "@repo/auth/agents";
import { APP_NAME } from "@repo/config/app";
import type { Database } from "@repo/db";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

type Services = {
  env: { BETTER_AUTH_URL: string; CORS_ORIGIN: string; ADMIN_ORIGIN?: string | undefined };
  db: Database;
  analytics?: Analytics | undefined;
  auth: ReturnType<typeof createAuth>;
  // Where the calls are counted.
  usage: Usage;
  // Where the forecasts are kept, and their requests counted.
  forecasts: Context["forecasts"];
  // What finds a place by its name.
  places: Context["places"];
  // What sends an account the mail that checks its address.
  verification: Context["verification"];
  // What sends the ideas sent from the landing. Without it, none is sent.
  ideas?: Context["ideas"];
  // The separate private catalogue, read only by the admin's operators.
  privateCatalogue?: Context["privateCatalogue"];
  // The public key of the pair the instance sends push with, as `pushKeyOf` checked it. Without
  // it the instance sends none, and takes no subscription.
  pushKey?: string | undefined;
  // When the process started. Without it, when this app was made.
  startedAt?: Date;
  // The commit the program was built from, when it knows.
  revision?: string | null;
};

// An answer was given to one caller, so no cache between the API and its callers may keep it.
const NOT_CACHED = "private, no-store";

const HOUR_SECONDS = 60 * 60;

// The reference's page runs this script at the API's own address, where a signed-in session
// reaches. The version is named, so that the CDN serves what was read and not whatever is newest.
const REFERENCE_SCRIPT = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.1";

// What follows `/push/devices/` in a request's line and is neither the id of a device nor a
// word of the API's own.
const NO_DEVICE_ID =
  /(\/push\/devices\/)(?!(?:forget|renew|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\s|$))\S+/i;

// A procedure that refuses a request has answered it: the request's line in the log says so with
// its status. The refusal itself is not printed: it holds what the caller sent. A fault is
// printed, and reported when the instance has PostHog (decision 054).
function faultLogger(analytics: Analytics | undefined) {
  return (error: unknown) => {
    if (error instanceof ORPCError && error.status < 500) return;
    console.error(error);
    try {
      analytics?.report?.(error);
    } catch {
      /* The report never changes the answer. */
    }
  };
}

/** The API as a Hono app: every route, and nothing that listens. */
// The address of the connection itself, which is the proxy's behind one. A test's request
// has no connection.
function connectionAddressOf(c: Parameters<typeof getConnInfo>[0]) {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

export function createApp({
  env,
  db,
  analytics,
  auth,
  usage,
  forecasts,
  places,
  verification,
  ideas,
  privateCatalogue,
  pushKey,
  startedAt = new Date(),
  revision = null,
}: Services) {
  const app = new Hono();
  const logFault = faultLogger(analytics);

  const webOrigin = new URL(env.CORS_ORIGIN).origin;
  const apiOrigin = new URL(env.BETTER_AUTH_URL).origin;
  // The site that may run the instance. Decision 020 keeps it apart from the web app's.
  const adminSites = adminSitesOf(env);
  // An instance without a web app names the API's own address as CORS_ORIGIN, and then leaves
  // ADMIN_ORIGIN out: naming it would say that one site is both.
  if (env.ADMIN_ORIGIN && adminSites.includes(webOrigin)) {
    throw new Error("ADMIN_ORIGIN must not be the web app's address, CORS_ORIGIN");
  }
  // The sites whose pages may call with a visitor's session, and write with it: the web app,
  // the admin app, and the API's own reference.
  const trustedOrigins = [...new Set([webOrigin, apiOrigin, ...adminSites])];

  // What follows `?` is left out of the log: it holds what a caller searched for. So is what a
  // caller writes where the id of a push device goes, when it is no id: it may be the address
  // of a browser, which is never logged (decision 031).
  app.use(
    logger((line, ...rest) =>
      console.log(line.replace(/\?\S*/, "").replace(NO_DEVICE_ID, "$1…"), ...rest),
    ),
  );
  app.use(
    "/*",
    cors({
      // The API's own pages need no leave to call it.
      origin: [...new Set([webOrigin, ...(env.ADMIN_ORIGIN ? adminSites : [])])],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Analytics-Consent",
        "X-PostHog-Distinct-Id",
        "X-PostHog-Session-Id",
      ],
      exposeHeaders: ["Retry-After"],
      credentials: true,
    }),
  );

  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    const request =
      c.req.header("origin") === webOrigin ? analyticsRequest(c.req.raw.headers) : undefined;
    const event = (
      {
        "/api/auth/sign-up/email": "account_created",
        "/api/auth/sign-in/email": "account_signed_in",
        "/api/auth/sign-out": "account_signed_out",
        "/api/auth/update-user": "account_updated",
      } as Record<string, string>
    )[c.req.path];
    const before =
      request && event === "account_signed_out"
        ? await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null)
        : null;
    const answer = await auth.handler(c.req.raw);
    if (request && event && answer.ok && c.req.method === "POST") {
      // Read only the authenticated identifier, never an email/name/password or token.
      const body = (await answer
        .clone()
        .json()
        .catch(() => null)) as { user?: { id?: string } } | null;
      const account = before?.user.id ?? body?.user?.id;
      // update-user answers no user; read its checked session instead.
      const id =
        account ??
        (event === "account_updated"
          ? (await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null))?.user.id
          : undefined);
      if (id) captureAction(analytics, request, event, id);
    }
    return answer;
  });

  // OpenAPI infers routes even for procedures without `.route()`. Private research is
  // reachable only through the admin's RPC client, so leave it out of this handler itself.
  const { privateCatalogue: _rpcOnlyCatalogue, ...httpRouter } = v1Router;
  const v1Handler = new OpenAPIHandler(httpRouter, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        docsPath: "/docs",
        docsScriptUrl: REFERENCE_SCRIPT,
        specPath: "/openapi.json",
        docsTitle: `${APP_NAME} API v1`,
        specGenerateOptions: {
          info: {
            title: `${APP_NAME} API`,
            version: "1.0.0",
            description:
              "Every call names its caller: an account, by the session cookie it gets when it " +
              "signs in, or a program, by an API key. A key reads the data everyone shares. " +
              "What belongs to an account takes that account's session, and each such route " +
              "says so. The instance's web app also reads the data everyone shares for a " +
              "visitor who has no account, while the instance is open to them: " +
              "`GET /visitors` says whether it is.",
          },
          components: {
            securitySchemes: {
              key: {
                type: "http",
                scheme: "bearer",
                description: "An API key, which an operator of the instance makes.",
              },
              session: {
                type: "apiKey",
                in: "cookie",
                name: "__Secure-better-auth.session_token",
                description:
                  "The cookie that signing in at `/api/auth/sign-in/email` sets. A write sent " +
                  "with it also names the site it comes from, in `Origin`.",
              },
            },
          },
          // A route that takes a session only says so itself.
          security: [{ key: [] }, { session: [] }],
          // The public address, not the one a request arrives at: behind a proxy that ends
          // HTTPS, that one starts with http, and the spec would send clients there.
          servers: [{ url: new URL("/v1", env.BETTER_AUTH_URL).href }],
        },
      }),
    ],
    interceptors: [onError(logFault)],
  });

  const rpcHandler = new RPCHandler(appRouter, { interceptors: [onError(logFault)] });

  app.use("/*", async (c, next) => {
    const isApi = ["/rpc", "/v1"].some((prefix) => c.req.path.startsWith(`${prefix}/`));
    if (!isApi) return next();

    const request = {
      method: c.req.method,
      origin: c.req.header("origin") ?? null,
      referer: c.req.header("referer") ?? null,
      hasCookie: c.req.header("cookie") !== undefined,
    };
    if (isCrossSiteWrite(request, trustedOrigins)) {
      const message = "A write sent with a cookie must come from a site this API trusts.";
      const refusal = { defined: false, code: "FORBIDDEN", status: 403, message };
      return c.json(refusal, 403, { "Cache-Control": NOT_CACHED });
    }

    const context = {
      db,
      analytics,
      analyticsRequest:
        request.origin === webOrigin ? analyticsRequest(c.req.raw.headers) : undefined,
      session: await auth.api.getSession({ headers: c.req.raw.headers }),
      authorization: c.req.header("authorization") ?? null,
      site: siteOf(request),
      adminSites,
      address: clientAddressOf(c.req.raw.headers, connectionAddressOf(c)),
      usage,
      forecasts,
      places,
      verification,
      ideas,
      privateCatalogue,
      reply: {} as Context["reply"],
      server: { startedAt, webOrigin, revision, pushKey },
    };

    const answered =
      (await rpcHandler.handle(c.req.raw, { prefix: "/rpc", context })).response ??
      (await v1Handler.handle(c.req.raw, { prefix: "/v1", context })).response;
    if (!answered) return next();

    answered.headers.set("Cache-Control", NOT_CACHED);
    // A call over its developer account's limit is taken again when the hour turns. A
    // procedure that tells its caller to wait says for how long itself.
    if (answered.status === 429) {
      const left =
        context.reply.retryAfterSeconds ??
        HOUR_SECONDS - (Math.floor(Date.now() / 1000) % HOUR_SECONDS);
      answered.headers.set("Retry-After", String(left));
    }
    // What a procedure asks of a service that is resting comes back once it has rested.
    if (answered.status === 503 && context.reply.retryAfterSeconds !== undefined) {
      answered.headers.set("Retry-After", String(context.reply.retryAfterSeconds));
    }
    return c.newResponse(answered.body, answered);
  });

  // What signs an agent in as an account: the sign-in library makes the tokens, and says so at
  // the address a client looks for it. The MCP server says at another what it takes, and whom
  // to ask for a token. Decision 047.
  const agents = agentAccounts(env, db, auth);
  app.on(["GET", "HEAD"], AGENT_SERVER_METADATA, (c) => auth.handler(c.req.raw));
  app.get(AGENT_RESOURCE_METADATA, (c) => c.json(agents.resourceMetadata));
  app.get(AGENT_RESOURCE_METADATA_ROOT, (c) => c.json(agents.resourceMetadata));

  // The MCP server: what an agent lists and calls in place of the routes of `/v1`. It takes an
  // API key, or an account that signed the agent in, and reads no cookie. Each tool is a
  // procedure of the router above: decisions 045 and 047.
  const mcp = createMcp(
    {
      db,
      usage,
      forecasts,
      places,
      verification,
      adminSites,
      server: { startedAt, webOrigin, revision, pushKey },
    },
    { onError: logFault, accounts: agents },
  );
  app.all("/mcp", async (c) => {
    const answered = await mcp.fetch(c.req.raw);
    answered.headers.set("Cache-Control", NOT_CACHED);
    return c.newResponse(answered.body, answered);
  });

  app.get("/", (c) => {
    return c.text("OK");
  });

  // What no route handled, such as a fault of the sign-in library, as Hono answers it by itself.
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    logFault(error);
    return c.text("Internal Server Error", 500);
  });

  return app;
}
