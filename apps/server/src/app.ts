import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { isCrossSiteWrite } from "@repo/api/cross-site";
import { appRouter, v1Router } from "@repo/api/routers/index";
import type { createAuth } from "@repo/auth";
import { APP_NAME } from "@repo/config/app";
import type { Database } from "@repo/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

type Services = {
  env: { BETTER_AUTH_URL: string; CORS_ORIGIN: string };
  db: Database;
  auth: ReturnType<typeof createAuth>;
};

// An answer was given to one caller, so no cache between the API and its callers may keep it.
const NOT_CACHED = "private, no-store";

/** The API as a Hono app: every route, and nothing that listens. */
export function createApp({ env, db, auth }: Services) {
  const app = new Hono();

  app.use(logger());
  app.use(
    "/*",
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.on(["POST", "GET"], "/api/auth/*", async (c) => auth.handler(c.req.raw));

  const v1Handler = new OpenAPIHandler(v1Router, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        docsPath: "/docs",
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
    interceptors: [
      onError((error) => {
        console.error(error);
      }),
    ],
  });

  const rpcHandler = new RPCHandler(appRouter, {
    interceptors: [
      onError((error) => {
        console.error(error);
      }),
    ],
  });

  // The sites whose pages may write with a visitor's session: the web app, and the API's own
  // reference.
  const trustedOrigins = [new URL(env.CORS_ORIGIN).origin, new URL(env.BETTER_AUTH_URL).origin];

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
    };

    const rpcResult = await rpcHandler.handle(c.req.raw, { prefix: "/rpc", context });
    if (rpcResult.matched) {
      rpcResult.response.headers.set("Cache-Control", NOT_CACHED);
      return c.newResponse(rpcResult.response.body, rpcResult.response);
    }

    const v1Result = await v1Handler.handle(c.req.raw, { prefix: "/v1", context });
    if (v1Result.matched) {
      v1Result.response.headers.set("Cache-Control", NOT_CACHED);
      return c.newResponse(v1Result.response.body, v1Result.response);
    }

    await next();
  });

  app.get("/", (c) => {
    return c.text("OK");
  });

  return app;
}
