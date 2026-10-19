import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";

export type GoogleConfig = {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  // The clients of Google's own sheet in the apps for phones, which a token it gives an app is
  // made for. Decision 070.
  GOOGLE_IOS_CLIENT_ID?: string | undefined;
  GOOGLE_ANDROID_CLIENT_ID?: string | undefined;
};

export function googleProvider(env: GoogleConfig) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
  }
  const apps = [env.GOOGLE_IOS_CLIENT_ID?.trim(), env.GOOGLE_ANDROID_CLIENT_ID?.trim()].filter(
    (id): id is string => Boolean(id),
  );
  if (apps.length > 0 && !clientId) {
    throw new Error(
      "GOOGLE_IOS_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID need GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
    );
  }
  // The web's client signs in through a browser, with the secret. An ID token that an app sends
  // to `/sign-in/social` is taken when it was made for any of the three: the library reads the
  // first as the one a browser uses, and the others as audiences alone.
  return clientId && clientSecret
    ? {
        google: {
          clientId: apps.length > 0 ? [clientId, ...apps] : clientId,
          clientSecret,
          prompt: "select_account" as const,
        },
      }
    : {};
}

/** The browser learns what this instance offers without receiving its credentials. */
export function signInProviders(google: boolean) {
  return {
    id: "sign-in-providers",
    endpoints: {
      signInProviders: createAuthEndpoint("/sign-in-providers", { method: "GET" }, async (ctx) =>
        ctx.json({ google }),
      ),
    },
  } satisfies BetterAuthPlugin;
}
