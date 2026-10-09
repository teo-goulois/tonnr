import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { APP_NAME } from "@repo/config/app";
import type { Database } from "@repo/db";
import * as schema from "@repo/db/schema/auth";
import { betterAuth } from "better-auth";

import { suspensionHooks } from "./suspension";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  // The admin app's address, when the instance has one. It signs in as the web app does.
  ADMIN_ORIGIN?: string | undefined;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  return betterAuth({
    appName: APP_NAME,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [
      env.CORS_ORIGIN,
      ...(env.ADMIN_ORIGIN ? [env.ADMIN_ORIGIN] : []),
      ...desktopOrigins,
    ],
    emailAndPassword: { enabled: true },
    // A suspended account opens no session: decision 025.
    databaseHooks: { session: { create: suspensionHooks(database) } },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
