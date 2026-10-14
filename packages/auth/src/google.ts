import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";

export type GoogleConfig = {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
};

export function googleProvider(env: GoogleConfig) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
  }
  return clientId && clientSecret
    ? { google: { clientId, clientSecret, prompt: "select_account" as const } }
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
