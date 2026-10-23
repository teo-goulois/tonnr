import { type AppleConfig, appleClientOf } from "./apple";

// What tells Apple that an account which signed in with it is deleted. Apple asks an app that
// offers Sign in with Apple to revoke the account's tokens as the account goes: decision 071.
// The client's secret is a token signed with the instance's key of Apple's, which decision 070
// signs: `appleClientOf` gives this module the client and that secret.

export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
// Where a code that Apple's sheet gave an app is exchanged for the tokens it stands for.
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
// Apple is asked once, and the account is deleted whatever it answers: a slow answer is not
// waited for long.
const TIMEOUT_MS = 5_000;

/** What the sign-in library keeps of one link of an account to Apple. */
export type AppleTokens = { refreshToken: string | null; accessToken: string | null };

/**
 * What became of a code an app gave as its account was deleted: its tokens revoked; nothing
 * revoked, since Apple's answer named another Apple account than those the account was linked
 * to; or a failure, at the exchange or at the revocation, with what Apple said, its status and
 * the code of its error, which name no one.
 */
export type CodeRevocation =
  | { outcome: "revoked" }
  | { outcome: "another" }
  | { outcome: "failed"; at: "exchange" | "revoke"; said: string };

/** What an instance that offers Sign in with Apple revokes an account's tokens with. */
export type AppleRevocation = {
  /**
   * Asks Apple once to revoke one link's tokens, the refresh token when it is kept. Never
   * throws: `none` for a link that kept no token, which a sign-in by an ID token keeps none of.
   */
  revoke: (tokens: AppleTokens) => Promise<"revoked" | "failed" | "none">;
  /**
   * Exchanges a code that Apple's sheet gave an app, for the app's bundle, and revokes at once the
   * refresh token Apple answers: what a sign-in by the app's ID token kept nothing of. It
   * revokes only when Apple's answer names one of `appleUsers`, the Apple accounts the deleted
   * account was linked to, and keeps nothing of it. Never throws. Decisions 070 and 071.
   */
  revokeCode: (
    code: string,
    app: { bundle: string; appleUsers: readonly string[] },
  ) => Promise<CodeRevocation>;
};

export type AppleClient = {
  // The client the tokens of the web's sign-in were given to, the Services ID. Apple revokes a
  // token for that client alone.
  clientId: string;
  // The client's secret, as it stands when Apple is asked.
  clientSecret: () => string | Promise<string>;
  // The secret of another client of the same team: the bundle of an app of the instance, whose
  // code is exchanged and whose tokens are revoked for it.
  secretFor: (clientId: string) => string | Promise<string>;
};

type Send = typeof fetch;

const post = (send: Send, url: string, body: Record<string, string>) =>
  send(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

// What a refusal of Apple's says that a log may keep: its status, and the code of its error,
// such as `invalid_grant`. Nothing else of the body is read.
async function refusalOf(answer: Response) {
  let code = "";
  try {
    const body = (await answer.json()) as { error?: unknown };
    if (typeof body.error === "string" && /^[a-z_]{1,40}$/.test(body.error)) code = body.error;
  } catch {
    // A body that is not JSON says nothing more than its status.
  }
  return code === "" ? `${answer.status}` : `${answer.status} ${code}`;
}

// The Apple account an ID token names. The token is read from the answer Apple gave the
// exchange itself, over TLS, so its signature is not checked again.
function subjectOf(idToken: unknown) {
  if (typeof idToken !== "string") return null;
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString());
    return typeof claims?.sub === "string" ? (claims.sub as string) : null;
  } catch {
    return null;
  }
}

/** Asks Apple to revoke a token given to `clientId`. Null when it did, else what it said. */
async function revokeFor(
  send: Send,
  client: { clientId: string; secret: string },
  tokens: { refreshToken: string } | { accessToken: string },
) {
  const refresh = "refreshToken" in tokens;
  try {
    const answer = await post(send, APPLE_REVOKE_URL, {
      client_id: client.clientId,
      client_secret: client.secret,
      token: refresh ? tokens.refreshToken : tokens.accessToken,
      token_type_hint: refresh ? "refresh_token" : "access_token",
    });
    if (answer.ok) {
      // Apple says nothing in the body worth reading.
      await answer.body?.cancel().catch(() => {});
      return null;
    }
    return await refusalOf(answer);
  } catch {
    return "no answer";
  }
}

/** Revokes at Apple's, with `send` in place of `fetch` in a test, which asks Apple nothing. */
export function appleRevocation(client: AppleClient, send: Send = fetch): AppleRevocation {
  return {
    async revoke(tokens) {
      const token = tokens.refreshToken
        ? { refreshToken: tokens.refreshToken }
        : tokens.accessToken
          ? { accessToken: tokens.accessToken }
          : null;
      if (!token) return "none";
      try {
        const secret = await client.clientSecret();
        return (await revokeFor(send, { clientId: client.clientId, secret }, token)) === null
          ? "revoked"
          : "failed";
      } catch {
        return "failed";
      }
    },

    async revokeCode(code, app) {
      let secret: string;
      let answered: { refresh_token?: unknown; access_token?: unknown; id_token?: unknown };
      try {
        secret = await client.secretFor(app.bundle);
        const answer = await post(send, APPLE_TOKEN_URL, {
          client_id: app.bundle,
          client_secret: secret,
          code,
          grant_type: "authorization_code",
        });
        if (!answer.ok) return { outcome: "failed", at: "exchange", said: await refusalOf(answer) };
        answered = (await answer.json()) as typeof answered;
      } catch {
        return { outcome: "failed", at: "exchange", said: "no answer" };
      }
      const subject = subjectOf(answered.id_token);
      if (subject === null) return { outcome: "failed", at: "exchange", said: "no ID token" };
      if (!app.appleUsers.includes(subject)) return { outcome: "another" };
      const token =
        typeof answered.refresh_token === "string"
          ? { refreshToken: answered.refresh_token }
          : typeof answered.access_token === "string"
            ? { accessToken: answered.access_token }
            : null;
      if (!token) return { outcome: "failed", at: "exchange", said: "no token" };
      const refused = await revokeFor(send, { clientId: app.bundle, secret }, token);
      return refused === null
        ? { outcome: "revoked" }
        : { outcome: "failed", at: "revoke", said: refused };
    },
  };
}

/**
 * What revokes an account's tokens at Apple's on an instance that offers Sign in with Apple, with
 * the Services ID, and with the bundle of an app for the code it gives. Undefined on one that
 * does not: Apple is asked nothing there.
 */
export function appleRevocationOf(env: AppleConfig, send: Send = fetch) {
  const client = appleClientOf(env);
  return client ? appleRevocation(client, send) : undefined;
}
