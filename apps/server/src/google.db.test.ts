import { createAuth } from "@repo/auth";
import { accountSuspension } from "@repo/db/schema/access";
import { account, session, user } from "@repo/db/schema/auth";
import { accountLink, sponsorship } from "@repo/db/schema/community";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { checkIdTokensWith, testIdTokens } from "./id-tokens.testing";

const API = "https://api.example.test";
const WEB = "https://web.example.test";
const env = {
  BETTER_AUTH_URL: API,
  BETTER_AUTH_SECRET: "made-up-for-google-tests-and-long-enough",
  CORS_ORIGIN: WEB,
  GOOGLE_CLIENT_ID: "made-up-client-id",
  GOOGLE_CLIENT_SECRET: "made-up-client-secret",
};

describe.skipIf(!TEST_DATABASE_URL)("Google OAuth over HTTP", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let profile = {
    sub: "google-one",
    email: "surfer@example.test",
    emailVerified: true,
    name: "Surfer",
  };

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database?.drop();
  });
  beforeEach(async () => {
    await database.db.delete(user);
    auth = createAuth(env, database.db);
    profile = {
      sub: "google-one",
      email: "surfer@example.test",
      emailVerified: true,
      name: "Surfer",
    };
    // The HTTP flow and state are real; only Google's exchange and profile are replaced.
    const context = await auth.$context;
    const provider = context.socialProviders.find((provider) => provider.id === "google")!;
    provider.validateAuthorizationCode = vi.fn(async () => ({ accessToken: "made-up-token" }));
    provider.getUserInfo = vi.fn(async () => {
      const { sub: _subject, ...info } = profile;
      return { user: info, data: profile };
    });
  });

  function request(path: string, body?: unknown, cookie?: string) {
    return auth.handler(
      new Request(`${API}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin: WEB,
          ...(body !== undefined && { "content-type": "application/json" }),
          ...(cookie && { cookie }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      }),
    );
  }

  async function start(additionalData?: Record<string, unknown>) {
    const answer = await request("/sign-in/social", {
      provider: "google",
      callbackURL: `${WEB}/fr/app?break=one&shared=list`,
      errorCallbackURL: `${WEB}/fr/login`,
      additionalData,
      disableRedirect: true,
    });
    expect(answer.status).toBe(200);
    const { url } = (await answer.json()) as { url: string };
    const authorization = new URL(url);
    expect(authorization.searchParams.get("redirect_uri")).toBe(`${API}/api/auth/callback/google`);
    const cookie = answer.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return { state: authorization.searchParams.get("state")!, cookie };
  }

  async function finish(additionalData?: Record<string, unknown>) {
    const { state, cookie } = await start(additionalData);
    return request(`/callback/google?state=${state}&code=made-up-code`, undefined, cookie);
  }

  async function localAccount(verified: boolean) {
    const answer = await request("/sign-up/email", {
      email: profile.email,
      password: "made-up-password",
      name: "local_surfer",
      username: "local_surfer",
    });
    expect(answer.status).toBe(200);
    const { user: made } = (await answer.json()) as { user: { id: string } };
    if (verified)
      await database.db.$client.query('update "user" set email_verified = true where id = $1', [
        made.id,
      ]);
    return made.id;
  }

  it("exposes availability without any credential, and leaves unconfigured instances on email", async () => {
    expect(await (await request("/sign-in-providers")).json()).toEqual({
      google: true,
      apple: false,
    });
    auth = createAuth({ ...env, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }, database.db);
    expect(await (await request("/sign-in-providers")).json()).toEqual({
      google: false,
      apple: false,
    });
    expect(
      (await request("/sign-in/social", { provider: "google", callbackURL: WEB })).status,
    ).toBe(404);
  });

  it("creates a Google account, checks its address, and returns to the selected place", async () => {
    const answer = await finish();
    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe(`${WEB}/fr/app?break=one&shared=list`);
    const [made] = await database.db.select().from(user);
    expect(made).toMatchObject({ email: profile.email, emailVerified: true, username: null });
    expect(await database.db.select().from(account)).toHaveLength(1);
    expect(await database.db.select().from(session)).toHaveLength(1);
  });

  it("links a verified local account, keeping its id and username", async () => {
    const id = await localAccount(true);
    expect((await finish()).headers.get("location")).toBe(`${WEB}/fr/app?break=one&shared=list`);
    expect(await database.db.select().from(user)).toMatchObject([{ id, username: "local_surfer" }]);
    expect(await database.db.select().from(account)).toHaveLength(2);
  });

  it("refuses an unchecked local account and an unchecked provider address", async () => {
    await localAccount(false);
    expect((await finish()).headers.get("location")).toContain("error=account_not_linked");
    expect(await database.db.select().from(account)).toHaveLength(1);
    await database.db.update(user).set({ emailVerified: true });
    profile.emailVerified = false;
    expect((await finish()).headers.get("location")).toContain("error=account_not_linked");
    expect(await database.db.select().from(account)).toHaveLength(1);
  });

  it("never opens a session for a suspended account", async () => {
    const id = await localAccount(true);
    await database.db.insert(accountSuspension).values({ userId: id });
    await database.db.delete(session);
    expect((await finish()).headers.get("location")).toContain("error=ACCOUNT_SUSPENDED");
    expect(await database.db.select().from(session)).toHaveLength(0);
  });

  it("keeps an invitation for a new Google account only", async () => {
    await database.db.insert(user).values({
      id: "inviter",
      name: "Inviter",
      email: "inviter@example.test",
      username: "inviter",
    });
    await database.db
      .insert(accountLink)
      .values({ userId: "inviter", token: "made-up-invitation" });
    await finish({ invitation: "made-up-invitation" });
    const made = (await database.db.select().from(user)).find((row) => row.email === profile.email);
    expect(await database.db.select().from(sponsorship)).toMatchObject([
      { sponsorId: "inviter", sponsoredId: made!.id },
    ]);
    await database.db.delete(sponsorship);
    await finish({ invitation: "made-up-invitation" });
    expect(await database.db.select().from(sponsorship)).toHaveLength(0);
  });

  it("keeps an invitation for a new account made by an app's ID token only", async () => {
    // The library reads the profile from the token itself: only the key that signs it is made up.
    auth = createAuth(env, database.db);
    const tokens = testIdTokens();
    await checkIdTokensWith(auth, "google", tokens.publicKey);
    await database.db.insert(user).values({
      id: "inviter",
      name: "Inviter",
      email: "inviter@example.test",
      username: "inviter",
    });
    await database.db
      .insert(accountLink)
      .values({ userId: "inviter", token: "made-up-invitation" });
    const signIn = () =>
      request("/sign-in/social", {
        provider: "google",
        idToken: {
          token: tokens.sign({
            iss: "https://accounts.google.com",
            aud: env.GOOGLE_CLIENT_ID,
            sub: "google-two",
            email: "phone@example.test",
            email_verified: true,
            name: "Phone",
          }),
        },
        additionalData: { invitation: "made-up-invitation" },
      });

    const first = await signIn();
    expect(first.status).toBe(200);
    const made = (await database.db.select().from(user)).find(
      (row) => row.email === "phone@example.test",
    );
    expect(await database.db.select().from(sponsorship)).toMatchObject([
      { sponsorId: "inviter", sponsoredId: made!.id },
    ]);
    await database.db.delete(sponsorship);
    expect((await signIn()).status).toBe(200);
    expect(await database.db.select().from(sponsorship)).toHaveLength(0);
  });

  it("takes an app's ID token made for the web's client or an app's, and no other", async () => {
    auth = createAuth({ ...env, GOOGLE_IOS_CLIENT_ID: "made-up-ios-client" }, database.db);
    const tokens = testIdTokens();
    await checkIdTokensWith(auth, "google", tokens.publicKey);
    const signIn = (aud: string, sub: string) =>
      request("/sign-in/social", {
        provider: "google",
        idToken: {
          token: tokens.sign({
            iss: "https://accounts.google.com",
            aud,
            sub,
            email: `${sub}@example.test`,
            email_verified: true,
          }),
        },
      });
    expect((await signIn("made-up-ios-client", "on-iphone")).status).toBe(200);
    expect((await signIn(env.GOOGLE_CLIENT_ID, "on-web")).status).toBe(200);
    expect((await signIn("another-client", "elsewhere")).status).toBe(401);
    expect((await database.db.select().from(user)).map((row) => row.email).sort()).toEqual([
      "on-iphone@example.test",
      "on-web@example.test",
    ]);
  });

  it("rejects a callback without the browser's state cookie", async () => {
    const { state } = await start();
    const answer = await request(`/callback/google?state=${state}&code=made-up-code`);
    expect(answer.headers.get("location")).toContain("error=state_mismatch");
    expect(await database.db.select().from(user)).toHaveLength(0);
  });

  it("returns a cancelled sign-in to the translated login without creating an account", async () => {
    const { state, cookie } = await start();
    const answer = await request(
      `/callback/google?state=${state}&error=access_denied`,
      undefined,
      cookie,
    );
    expect(answer.headers.get("location")).toBe(`${WEB}/fr/login?error=access_denied`);
    expect(await database.db.select().from(user)).toHaveLength(0);
  });
});
