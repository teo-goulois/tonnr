import { createAuth } from "@repo/auth";
import { session, user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const API = "https://api.example.test";
const WEB = "https://web.example.test";
const DAY = 24 * 60 * 60 * 1000;
// A minute of leeway between the clock of the test and the one the library read.
const MINUTE = 60 * 1000;

describe.skipIf(!TEST_DATABASE_URL)("how long a session lasts", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let auth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database?.drop();
  });
  beforeEach(async () => {
    await database.db.delete(user);
    auth = createAuth(
      {
        BETTER_AUTH_URL: API,
        BETTER_AUTH_SECRET: "made-up-for-session-tests-and-long-enough",
        CORS_ORIGIN: WEB,
      },
      database.db,
    );
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

  async function signUp() {
    const answer = await request("/sign-up/email", {
      email: "surfer@example.test",
      password: "made-up-password",
      name: "surfer",
      username: "surfer",
    });
    expect(answer.status).toBe(200);
    const sessionCookie = answer.headers
      .getSetCookie()
      .find((set) => set.startsWith("__Secure-better-auth.session_token="))!;
    return { cookie: sessionCookie.split(";")[0]!, set: sessionCookie };
  }

  const expiry = async () => (await database.db.select().from(session))[0]!.expiresAt.getTime();

  it("lasts ninety days from the sign-in, and its cookie as long", async () => {
    const { set } = await signUp();
    expect(Math.abs((await expiry()) - (Date.now() + 90 * DAY))).toBeLessThan(MINUTE);
    expect(set).toContain(`Max-Age=${90 * 24 * 60 * 60}`);
  });

  it("is renewed for ninety days once it is used a day after it was last renewed", async () => {
    const { cookie } = await signUp();
    const renewedAgo = async (ms: number) => {
      await database.db.update(session).set({ expiresAt: new Date(Date.now() + 90 * DAY - ms) });
    };

    // Used within the day: left as it is, and no cookie is sent back.
    await renewedAgo(DAY - 10 * MINUTE);
    const soon = await expiry();
    const early = await request("/get-session", undefined, cookie);
    expect(early.status).toBe(200);
    expect(await expiry()).toBe(soon);
    expect(early.headers.getSetCookie().join()).not.toContain("session_token");

    // Used a day later: ninety days again, in the database and in the cookie.
    await renewedAgo(DAY + 10 * MINUTE);
    const late = await request("/get-session", undefined, cookie);
    expect(late.status).toBe(200);
    expect(Math.abs((await expiry()) - (Date.now() + 90 * DAY))).toBeLessThan(MINUTE);
    expect(late.headers.getSetCookie().join()).toContain(`Max-Age=${90 * 24 * 60 * 60}`);
  });
});
