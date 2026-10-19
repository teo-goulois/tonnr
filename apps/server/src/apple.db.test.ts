import { createHash, generateKeyPairSync } from "node:crypto";

import { createAuth } from "@repo/auth";
import { account, session, user } from "@repo/db/schema/auth";
import { accountLink, sponsorship } from "@repo/db/schema/community";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { checkIdTokensWith, testIdTokens } from "./id-tokens.testing";

const API = "https://api.example.test";
const WEB = "https://web.example.test";
const APPLE = "https://appleid.apple.com";
const APP_ORIGINS = ["app.example://"];
const env = {
  BETTER_AUTH_URL: API,
  BETTER_AUTH_SECRET: "made-up-for-apple-tests-and-long-enough",
  CORS_ORIGIN: WEB,
  APPLE_SERVICES_ID: "app.example.web",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  // A key of Apple's kind, made for the test: no test asks Apple for anything.
  APPLE_PRIVATE_KEY: generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
};

describe.skipIf(!TEST_DATABASE_URL)("Sign in with Apple over HTTP", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let tokens: ReturnType<typeof testIdTokens>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database?.drop();
  });
  beforeEach(async () => {
    await database.db.delete(user);
    auth = createAuth(env, database.db, APP_ORIGINS);
    tokens = testIdTokens();
    await checkIdTokensWith(auth, "apple", tokens.publicKey);
  });

  function request(
    path: string,
    body?: unknown,
    { cookie, origin = WEB }: { cookie?: string; origin?: string } = {},
  ) {
    return auth.handler(
      new Request(`${API}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin,
          ...(body instanceof URLSearchParams
            ? { "content-type": "application/x-www-form-urlencoded" }
            : body !== undefined && { "content-type": "application/json" }),
          ...(cookie && { cookie }),
        },
        ...(body !== undefined && {
          body: body instanceof URLSearchParams ? body : JSON.stringify(body),
        }),
      }),
    );
  }

  // What Apple's sheet gives the app for this account: a token made for its bundle.
  function idToken(claims: Record<string, unknown> = {}) {
    return tokens.sign({
      iss: APPLE,
      aud: "app.example",
      sub: "apple-one",
      email: "hidden@privaterelay.appleid.com",
      email_verified: "true",
      is_private_email: "true",
      ...claims,
    });
  }

  async function invitingAccount() {
    await database.db.insert(user).values({
      id: "inviter",
      name: "Inviter",
      email: "inviter@example.test",
      username: "inviter",
    });
    await database.db
      .insert(accountLink)
      .values({ userId: "inviter", token: "made-up-invitation" });
  }

  it("says that the instance offers Apple, and nothing of its settings", async () => {
    const answer = await request("/sign-in-providers");
    expect(await answer.json()).toEqual({ google: false, apple: true });
    auth = createAuth(
      { ...env, APPLE_SERVICES_ID: "", APPLE_KEY_ID: "", APPLE_PRIVATE_KEY: "" },
      database.db,
    );
    expect(await (await request("/sign-in-providers")).json()).toEqual({
      google: false,
      apple: false,
    });
    expect(
      (await request("/sign-in/social", { provider: "apple", idToken: { token: idToken() } }))
        .status,
    ).toBe(404);
  });

  it("makes an account from the app's ID token, with the link's owner as its sponsor", async () => {
    await invitingAccount();
    const nonce = "made-up-nonce";
    const answer = await request("/sign-in/social", {
      provider: "apple",
      idToken: {
        token: idToken({ nonce: createHash("sha256").update(nonce).digest("hex") }),
        nonce,
        user: { name: { firstName: "Surf", lastName: "Er" } },
      },
      additionalData: { invitation: "made-up-invitation" },
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.getSetCookie().join()).toContain("better-auth.session_token=");
    const made = (await database.db.select().from(user)).find((row) => row.id !== "inviter");
    expect(made).toMatchObject({
      email: "hidden@privaterelay.appleid.com",
      emailVerified: true,
      name: "Surf Er",
      username: null,
    });
    expect(await database.db.select().from(sponsorship)).toMatchObject([
      { sponsorId: "inviter", sponsoredId: made!.id },
    ]);
    expect(await database.db.select().from(account)).toMatchObject([
      { providerId: "apple", accountId: "apple-one", userId: made!.id },
    ]);
  });

  it("gives an account that exists no sponsor, whatever link it carries", async () => {
    await invitingAccount();
    const signIn = () =>
      request("/sign-in/social", {
        provider: "apple",
        idToken: { token: idToken() },
        additionalData: { invitation: "made-up-invitation" },
      });
    expect((await signIn()).status).toBe(200);
    await database.db.delete(sponsorship);
    expect((await signIn()).status).toBe(200);
    expect(await database.db.select().from(sponsorship)).toHaveLength(0);

    // Nor one that signed up with an address it checked, which Apple's token then links to.
    const local = await request("/sign-up/email", {
      email: "own@example.test",
      password: "made-up-password",
      name: "own_surfer",
      username: "own_surfer",
    });
    const { user: own } = (await local.json()) as { user: { id: string } };
    await database.db.$client.query('update "user" set email_verified = true where id = $1', [
      own.id,
    ]);
    const linked = await request("/sign-in/social", {
      provider: "apple",
      idToken: { token: idToken({ sub: "apple-two", email: "own@example.test" }) },
      additionalData: { invitation: "made-up-invitation" },
    });
    expect(linked.status).toBe(200);
    expect(await database.db.select().from(sponsorship)).toHaveLength(0);
    expect(
      (await database.db.select().from(account)).filter((row) => row.userId === own.id),
    ).toHaveLength(2);
  });

  it("refuses a token made for another app, signed by another key, or with another nonce", async () => {
    const refused = async (token: string, nonce?: string) =>
      (await request("/sign-in/social", { provider: "apple", idToken: { token, nonce } })).status;
    expect(await refused(idToken({ aud: "app.someone.else" }))).toBe(401);
    // Nor one made for the web's Services ID, which Apple's page gives the browser.
    expect(await refused(idToken({ aud: "app.example.web" }))).toBe(401);
    expect(await refused(testIdTokens().sign({ iss: APPLE, aud: "app.example", sub: "x" }))).toBe(
      401,
    );
    expect(await refused(idToken({ iss: "https://accounts.google.com" }))).toBe(401);
    expect(await refused(idToken({ nonce: "one" }), "another")).toBe(401);
    expect(await database.db.select().from(user)).toHaveLength(0);
    expect(await database.db.select().from(session)).toHaveLength(0);
  });

  it("takes no ID token on an instance with no app, and still signs the web in", async () => {
    auth = createAuth(env, database.db, []);
    await checkIdTokensWith(auth, "apple", tokens.publicKey);
    const signIn = (aud: string) =>
      request("/sign-in/social", { provider: "apple", idToken: { token: idToken({ aud }) } });
    expect((await signIn("app.example.web")).status).toBe(404);
    expect((await signIn("app.example")).status).toBe(404);
    expect(await database.db.select().from(session)).toHaveLength(0);
    const start = await request("/sign-in/social", {
      provider: "apple",
      callbackURL: `${WEB}/app`,
      disableRedirect: true,
    });
    expect(start.status).toBe(200);
  });

  it("signs the web in through Apple's page, which posts its answer from Apple's origin", async () => {
    await invitingAccount();
    const context = await auth.$context;
    const provider = context.socialProviders.find((provider) => provider.id === "apple")!;
    // The secret the library sends Apple with a code is signed with the instance's key.
    expect(provider.options?.clientSecret?.split(".")).toHaveLength(3);
    // Only Apple's exchange of the code is replaced: the state, the post and the redirect are real.
    provider.validateAuthorizationCode = vi.fn(async () => ({
      accessToken: "made-up-access-token",
      refreshToken: "made-up-refresh-token",
      idToken: idToken({ aud: "app.example.web", sub: "apple-web" }),
    }));

    const start = await request("/sign-in/social", {
      provider: "apple",
      callbackURL: `${WEB}/fr/app?break=one`,
      errorCallbackURL: `${WEB}/fr/login`,
      additionalData: { invitation: "made-up-invitation" },
      disableRedirect: true,
    });
    expect(start.status).toBe(200);
    const authorization = new URL(((await start.json()) as { url: string }).url);
    expect(authorization.origin).toBe(APPLE);
    expect(authorization.searchParams.get("client_id")).toBe("app.example.web");
    expect(authorization.searchParams.get("response_mode")).toBe("form_post");
    expect(authorization.searchParams.get("redirect_uri")).toBe(`${API}/api/auth/callback/apple`);
    const cookie = start.headers
      .getSetCookie()
      .map((set) => set.split(";")[0])
      .join("; ");
    const form = new URLSearchParams({
      state: authorization.searchParams.get("state")!,
      code: "made-up-code",
      user: JSON.stringify({ name: { firstName: "Web", lastName: "Surfer" } }),
    });

    // Apple's origin is trusted with the cookies of the state it posts back, and no other site's.
    // The library checks the origin of every post that carries a cookie, except in a test, which
    // reads what it would check against.
    expect(context.isTrustedOrigin(APPLE)).toBe(true);
    expect(context.isTrustedOrigin("https://elsewhere.test")).toBe(false);
    const without = createAuth(
      { ...env, APPLE_SERVICES_ID: "", APPLE_KEY_ID: "", APPLE_PRIVATE_KEY: "" },
      database.db,
      APP_ORIGINS,
    );
    expect((await without.$context).isTrustedOrigin(APPLE)).toBe(false);

    const posted = await request("/callback/apple", form, { cookie, origin: APPLE });
    expect(posted.status).toBe(302);
    const back = new URL(posted.headers.get("location")!);
    const answer = await request(`/callback/apple${back.search}`, undefined, { cookie });
    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe(`${WEB}/fr/app?break=one`);
    const made = (await database.db.select().from(user)).find((row) => row.id !== "inviter");
    expect(made).toMatchObject({ name: "Web Surfer", emailVerified: true });
    expect(await database.db.select().from(sponsorship)).toMatchObject([
      { sponsorId: "inviter", sponsoredId: made!.id },
    ]);
    // The tokens Apple gave are kept, so that the account's link to Apple can be revoked.
    expect(await database.db.select().from(account)).toMatchObject([
      { providerId: "apple", refreshToken: "made-up-refresh-token" },
    ]);
  });
});
