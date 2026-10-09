import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { APP_NAME } from "@repo/config/app";
import type { Database } from "@repo/db";
import * as schema from "@repo/db/schema/auth";
import { betterAuth } from "better-auth";

import { suspensionHooks } from "./suspension";
import { type Verification, VERIFICATION_SECONDS } from "./verification";

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
  // What sends the mail that checks an address. Without it, or on an instance that sends no
  // mail, no address is checked.
  verification?: Verification,
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
    // An account is sent a mail to check its address when it signs up, and is signed in
    // whether it follows the link or not. The link signs no one in. Decision 026.
    ...(verification?.isOn && {
      emailVerification: {
        sendVerificationEmail: verification.onSignUp,
        sendOnSignUp: true,
        autoSignInAfterVerification: false,
        expiresIn: VERIFICATION_SECONDS,
      },
    }),
    // The library's own route sends that mail to an address given without a session: anyone
    // could have it mail the addresses that are not checked yet. The API has its own, for the
    // account that asks.
    disabledPaths: ["/send-verification-email"],
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
