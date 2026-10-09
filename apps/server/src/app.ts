import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Context } from "@repo/api/context";
import { adminSitesOf, isCrossSiteWrite, siteOf } from "@repo/api/cross-site";
import { appRouter, v1Router } from "@repo/api/routers/index";
import type { Usage } from "@repo/api/usage";
import type { createAuth } from "@repo/auth";
import { APP_NAME } from "@repo/config/app";
import type { Database } from "@repo/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

type Services = {
  env: { BETTER_AUTH_URL: string; CORS_ORIGIN: string; ADMIN_ORIGIN?: string | undefined };
  db: Database;
  auth: ReturnType<typeof createAuth>;
  // Where the calls are counted.
  usage: Usage;
  // Where the forecasts are kept, and their requests counted.
  forecasts: Context["forecasts"];
  // What sends an account the mail that checks its address.
  verification: Context["verification"];
  // When the process started. Without it, when this app was made.
  startedAt?: Date;
};

// An answer was given to one caller, so no cache between the API and its callers may keep it.
const NOT_CACHED = "private, no-store";

const HOUR_SECONDS = 60 * 60;

// The reference's page runs this script at the API's own address, where a signed-in session
// reaches. The version is named, so that the CDN serves what was read and not whatever is newest.
const REFERENCE_SCRIPT = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.1";

// A procedure that refuses a request has answered it: the request's line in the log says so with
// its status. The refusal itself is not printed: it holds what the caller sent.
function logFault(error: unknown) {
  if (error instanceof ORPCError && error.status < 500) return;
  console.error(error);
}

/** The API as a Hono app: every route, and nothing that listens. */
export function createApp({
  env,
  db,
  auth,
  usage,
  forecasts,
  verification,
  startedAt = new Date(),
}: Services) {
  const app = new Hono();

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

  // What follows `?` is left out of the log: it holds what a caller searched for.
  app.use(logger((line, ...rest) => console.log(line.replace(/\?\S*/, ""), ...rest)));
  app.use(
    "/*",
    cors({
      // The API's own pages need no leave to call it.
      origin: [...new Set([webOrigin, ...(env.ADMIN_ORIGIN ? adminSites : [])])],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["Retry-After"],
      credentials: true,
    }),
  );

  app.on(["POST", "GET"], "/api/auth/*", async (c) => auth.handler(c.req.raw));

  const v1Handler = new OpenAPIHandler(v1Router, {
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
              "says so.",
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
      session: await auth.api.getSession({ headers: c.req.raw.headers }),
      authorization: c.req.header("authorization") ?? null,
      site: siteOf(request),
      adminSites,
      usage,
      forecasts,
      verification,
      reply: {} as Context["reply"],
      server: { startedAt, webOrigin },
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
    return c.newResponse(answered.body, answered);
  });

  app.get("/", (c) => {
    return c.text("OK");
  });

  return app;
}
