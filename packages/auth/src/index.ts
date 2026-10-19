import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { expo } from "@better-auth/expo";
import { APP_NAME } from "@repo/config/app";
import type { Database } from "@repo/db";
import * as schema from "@repo/db/schema/auth";
import { betterAuth } from "better-auth";

import { agentSignIn } from "./agents";
import { googleProvider, type GoogleConfig, signInProviders } from "./google";
import { invitations, oauthInvitation } from "./invitation";
import { suspensionHooks } from "./suspension";
import { keepsUsername, usernameHooks, usernames } from "./username";
import { RESET_SECONDS, type Verification, VERIFICATION_SECONDS } from "./verification";

export type AuthConfig = GoogleConfig & {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  // The admin app's address, when the instance has one. It signs in as the web app does.
  ADMIN_ORIGIN?: string | undefined;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  // The origins the instance's apps for phones name themselves by, as `appOriginsOf` read them.
  // Decision 069.
  appOrigins: readonly string[] = [],
  // What sends the mail that checks an address. Without it, or on an instance that sends no
  // mail, no address is checked.
  verification?: Verification,
) {
  const socialProviders = googleProvider(env);
  const userHooks = usernameHooks(database);
  return betterAuth({
    appName: APP_NAME,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [
      env.CORS_ORIGIN,
      ...(env.ADMIN_ORIGIN ? [env.ADMIN_ORIGIN] : []),
      ...appOrigins,
    ],
    emailAndPassword: {
      enabled: true,
      // An account that forgot its password asks for a link by mail, which works once, for an
      // hour, and its sessions everywhere are closed when it chooses another. The answer is the
      // same whether the address has an account or not. Decision 026.
      ...(verification?.isOn && {
        sendResetPassword: verification.onResetAsked,
        resetPasswordTokenExpiresIn: RESET_SECONDS,
        revokeSessionsOnPasswordReset: true,
      }),
    },
    socialProviders,
    account: {
      accountLinking: { enabled: true, requireLocalEmailVerified: true, trustedProviders: [] },
    },
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
    // The library also signs an account in by its username. Here an account signs in by its
    // address alone: a username is what others read, and names no door.
    disabledPaths: ["/send-verification-email", "/sign-in/username"],
    // A suspended account opens no session: decision 025.
    databaseHooks: {
      session: { create: suspensionHooks(database) },
      // A username that an operator took away stays away: decision 041.
      user: {
        ...userHooks,
        create: {
          after: async (made, context) => {
            await userHooks.create.after(made);
            if (context?.path === "/callback/:id") await oauthInvitation(database, made, context);
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    // What others read of an account, and what keeps it there, then what a link another gave
    // it makes of a new account: decision 041.
    hooks: { before: keepsUsername, after: invitations(database) },
    plugins: [
      // An app for phones keeps its session's cookie itself and names itself in `expo-origin`,
      // which the library then reads as the request's origin. Decisions 069 and 070.
      expo(),
      usernames(database),
      signInProviders("google" in socialProviders),
      // What signs an agent in as an account: decision 047.
      ...agentSignIn(env, database),
    ],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
