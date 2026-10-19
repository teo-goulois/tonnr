import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";

export type GoogleConfig = {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  // The client of Google's own sheet in the app for iPhone, which a token it gives the app is made
  // for. Android's sheet makes its tokens for the web's client, given as the server's: its own
  // client at Google is named in no token. Decision 070.
  GOOGLE_IOS_CLIENT_ID?: string | undefined;
};

export function googleProvider(env: GoogleConfig) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
  }
  const ios = env.GOOGLE_IOS_CLIENT_ID?.trim();
  if (ios && !clientId) {
    throw new Error("GOOGLE_IOS_CLIENT_ID needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }
  // The web's client signs in through a browser, with the secret. An ID token that an app sends
  // to `/sign-in/social` is taken when it was made for either: the library reads the first as the
  // one a browser uses, and the other as an audience alone.
  return clientId && clientSecret
    ? {
        google: {
          clientId: ios ? [clientId, ios] : clientId,
          clientSecret,
          prompt: "select_account" as const,
        },
      }
    : {};
}

/**
 * The web app and the apps learn which providers this instance offers without receiving their
 * credentials, and show a button for each: decisions 046 and 070.
 */
export function signInProviders(offered: { google: boolean; apple: boolean }) {
  return {
    id: "sign-in-providers",
    endpoints: {
      signInProviders: createAuthEndpoint("/sign-in-providers", { method: "GET" }, async (ctx) =>
        ctx.json({ google: offered.google, apple: offered.apple }),
      ),
    },
  } satisfies BetterAuthPlugin;
}
