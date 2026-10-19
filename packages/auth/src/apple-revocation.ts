import { type AppleConfig, appleClientOf } from "./apple";

// What tells Apple that an account which signed in with it is deleted. Apple asks an app that
// offers Sign in with Apple to revoke the account's tokens as the account goes: decision 071.
// The client's secret is a token signed with the instance's key of Apple's, which decision 070
// signs: `appleClientOf` gives this module the client and that secret.

export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
// Apple is asked once, and the account is deleted whatever it answers: a slow answer is not
// waited for long.
const TIMEOUT_MS = 5_000;

/** What the sign-in library keeps of one link of an account to Apple. */
export type AppleTokens = { refreshToken: string | null; accessToken: string | null };

/** What an instance that offers Sign in with Apple revokes an account's tokens with. */
export type AppleRevocation = {
  /**
   * Asks Apple once to revoke one link's tokens, the refresh token when it is kept. Never
   * throws: `none` for a link that kept no token, which a sign-in by an ID token keeps none of.
   */
  revoke: (tokens: AppleTokens) => Promise<"revoked" | "failed" | "none">;
};

export type AppleClient = {
  // The client the tokens were given to. Apple revokes a token for that client alone. The tokens
  // the library keeps come from the web's sign-in, which exchanges its code for the Services ID:
  // a sign-in by the app's ID token keeps none. An exchange of the app's code, for its bundle,
  // which decision 070 leaves unbuilt, would keep which client each link's tokens are for.
  clientId: string;
  // The client's secret, as it stands when Apple is asked.
  clientSecret: () => string | Promise<string>;
};

/** Revokes at Apple's, with `send` in place of `fetch` in a test, which asks Apple nothing. */
export function appleRevocation(client: AppleClient, send: typeof fetch = fetch): AppleRevocation {
  return {
    async revoke(tokens) {
      const token = tokens.refreshToken ?? tokens.accessToken;
      if (!token) return "none";
      try {
        const answer = await send(APPLE_REVOKE_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: client.clientId,
            client_secret: await client.clientSecret(),
            token,
            token_type_hint: tokens.refreshToken ? "refresh_token" : "access_token",
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        // Apple says nothing in the body worth reading.
        await answer.body?.cancel().catch(() => {});
        return answer.ok ? "revoked" : "failed";
      } catch {
        return "failed";
      }
    },
  };
}

/**
 * What revokes an account's tokens at Apple's on an instance that offers Sign in with Apple, with
 * the Services ID. Undefined on one that does not: Apple is asked nothing there.
 */
export function appleRevocationOf(env: AppleConfig, send: typeof fetch = fetch) {
  const client = appleClientOf(env);
  return client ? appleRevocation(client, send) : undefined;
}
