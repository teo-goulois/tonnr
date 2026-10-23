import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { APPLE_REVOKE_URL, appleRevocation } from "@repo/auth/apple-revocation";
import { passwordHash } from "@repo/auth/password";
import { isUsernameKept } from "@repo/auth/username";
import { operator, operatorAction, removedUsername } from "@repo/db/schema/access";
import { account, session, user } from "@repo/db/schema/auth";
import {
  accountLink,
  breakContribution,
  contributionVerdict,
  friendship,
  rankAward,
  sponsorship,
} from "@repo/db/schema/community";
import { providerCalls } from "@repo/db/schema/forecasts";
import { stationList } from "@repo/db/schema/lists";
import { media, mediaTrash } from "@repo/db/schema/media";
import { surfReport } from "@repo/db/schema/reports";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testApple, testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

const DAY_MS = 24 * 60 * 60 * 1000;

// Deleting an account, from the app or the web, at once: decision 071.
describe.skipIf(!TEST_DATABASE_URL)("deleting an account", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  const PASSWORD = "a long password of ana's";
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  let hash: string;
  const { forecasts } = testForecasts();

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
    hash = await passwordHash(PASSWORD);
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(user);
    await db.delete(surfBreak);
    await db.delete(mediaTrash);
    await db.delete(operatorAction);
    await db.delete(removedUsername);
    await db.delete(providerCalls);
    const old = new Date("2026-09-01T00:00:00Z");
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org", username: "ana", createdAt: old },
      { id: "ben", name: "Ben", email: "ben@example.org", username: "ben", createdAt: old },
      { id: "cy", name: "Cy", email: "cy@example.org", username: "cy", createdAt: old },
      // Signs in with Google alone: it has no password.
      { id: "gil", name: "Gil", email: "gil@example.org", username: "gil", createdAt: old },
      { id: "op", name: "Op", email: "op@example.org", username: "op", createdAt: old },
    ]);
    const now = new Date();
    await db.insert(account).values([
      ...["ana", "op"].map((id) => ({
        id: `credential-${id}`,
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hash,
        createdAt: old,
        updatedAt: old,
      })),
      {
        id: "google-gil",
        accountId: "g-123",
        providerId: "google",
        userId: "gil",
        accessToken: "google-access",
        createdAt: old,
        updatedAt: old,
      },
    ]);
    // A session of each, opened a day ago, and one of Gil's opened a minute ago.
    const dayAgo = new Date(now.getTime() - DAY_MS);
    await db.insert(session).values([
      ...["ana", "ben", "cy", "gil", "op"].map((id) => ({
        id: `s-${id}`,
        token: `t-${id}`,
        userId: id,
        expiresAt: new Date(now.getTime() + 30 * DAY_MS),
        createdAt: dayAgo,
        updatedAt: dayAgo,
      })),
      {
        id: "s-gil-fresh",
        token: "t-gil-fresh",
        userId: "gil",
        expiresAt: new Date(now.getTime() + 30 * DAY_MS),
        createdAt: new Date(now.getTime() - 60_000),
        updatedAt: now,
      },
    ]);
    await db.insert(operator).values({ userId: "op" });
    await db.insert(surfBreak).values({
      id: "point",
      slug: "point",
      name: "The point",
      latitude: 43.48,
      longitude: -1.56,
    });
  });

  const by = (id: string, sessionId = `s-${id}`, extra: Partial<Context> = {}) => {
    const context: Context = {
      db: database.db,
      session: {
        user: { id, name: id, email: `${id}@example.org`, emailVerified: true },
        session: { id: sessionId, userId: id, token: `t-${id}`, expiresAt: new Date("2030-01-01") },
      } as Session,
      authorization: null,
      site: WEB,
      adminSites: [ADMIN],
      usage,
      forecasts,
      places: testPlaces().places,
      verification: testVerification(database.db, { on: false }).verification,
      reply: {},
      server: { startedAt: new Date(), webOrigin: WEB },
      ...extra,
    };
    return { context };
  };
  const remove = (
    input: { password?: string; appleAuthorizationCode?: string },
    calling: ReturnType<typeof by>,
  ) =>
    call(v1Router.account.delete, input, calling).then(
      (answer) => answer,
      (error: unknown) => {
        if (!(error instanceof ORPCError)) throw error;
        return { refused: error.code as string, data: error.data as unknown };
      },
    );

  /** What an account has made and been given, of each kind the deletion decides of. */
  async function furnish() {
    const { db } = database;
    await db.insert(spot).values({
      id: "ana-spot",
      userId: "ana",
      name: "Secret reef",
      latitude: 43.5,
      longitude: -1.6,
    });
    await db.insert(stationList).values({ id: "ana-list", userId: "ana", name: "Mine" });
    const contribution = (id: string, status: string, extra = {}) => ({
      id,
      breakId: "point",
      breakRef: "point",
      userId: "ana",
      line: "breakTypes" as const,
      value: ["reef"],
      license: "ODbL-1.0" as const,
      status: status as "confirmed",
      ...extra,
    });
    await db.insert(breakContribution).values([
      contribution("confirmed", "confirmed", { confirmedAt: new Date() }),
      contribution("waiting", "shown", { shownAt: new Date(), line: "bottomTypes" }),
      contribution("refused", "refused", { line: "boardTypes" }),
      contribution("withdrawn", "withdrawn", { line: "bestTides" }),
      contribution("superseded", "superseded", { line: "bestSeasons" }),
      // A spot of hers that became a break counts for her, and stays.
      contribution("place", "confirmed", {
        line: "place",
        value: "The point",
        confirmedAt: new Date(),
      }),
    ]);
    // What Ben said of her waiting line, and what she said of one of Cy's.
    await db.insert(breakContribution).values({
      ...contribution("cy-line", "shown", { userId: "cy", line: "access" }),
      value: "A path from the car park.",
      license: "DbCL-1.0",
      language: "en",
    });
    await db.insert(contributionVerdict).values([
      { contributionId: "waiting", userId: "ben", verdict: "confirm" },
      { contributionId: "cy-line", userId: "ana", verdict: "confirm" },
    ]);
    await db.insert(rankAward).values({ userId: "ana", rank: "qs" });
    await db.insert(accountLink).values({ userId: "ana", token: "ana-link" });
    // Ben brought her, and she brought Cy, with whom she is friends.
    await db.insert(sponsorship).values([
      { sponsoredId: "ana", sponsorId: "ben" },
      { sponsoredId: "cy", sponsorId: "ana" },
    ]);
    await db.insert(friendship).values({ userId: "ana", friendId: "cy" });
    await db.insert(surfReport).values({
      id: "ana-report",
      userId: "ana",
      breakId: "point",
      state: "published",
      terms: "2026-10-18",
    });
    await db.insert(media).values({
      id: "ana-photo",
      userId: "ana",
      purpose: "report",
      kind: "photo",
      state: "ready",
      reportId: "ana-report",
      uploadKey: "up/ana-photo",
      uploadType: "image/jpeg",
      uploadBytes: 1000,
      files: {
        thumb: {
          key: "m/ana-photo/thumb.webp",
          contentType: "image/webp",
          bytes: 9,
          width: 1,
          height: 1,
        },
      },
    });
  }

  it("goes at once with what it keeps, and leaves what it gave others naming nobody", async () => {
    const { db } = database;
    await furnish();

    expect(await remove({ password: PASSWORD }, by("ana"))).toEqual({ deleted: true });

    expect(await db.select().from(user).where(eq(user.id, "ana"))).toEqual([]);
    // Signed out everywhere, with nothing of hers left.
    expect(await db.select().from(session).where(eq(session.userId, "ana"))).toEqual([]);
    expect(await db.select().from(account).where(eq(account.userId, "ana"))).toEqual([]);
    expect(await db.select().from(spot).where(eq(spot.userId, "ana"))).toEqual([]);
    expect(await db.select().from(stationList).where(eq(stationList.userId, "ana"))).toEqual([]);
    expect(await db.select().from(surfReport)).toEqual([]);
    expect(await db.select().from(rankAward)).toEqual([]);
    expect(await db.select().from(accountLink)).toEqual([]);
    expect(await db.select().from(friendship)).toEqual([]);
    // Her photo's files go from the bucket: the database wrote their keys for the worker.
    expect(await db.select().from(media)).toEqual([]);
    const [trash] = await db.select().from(mediaTrash);
    expect(trash?.keys).toEqual(expect.arrayContaining(["up/ana-photo", "m/ana-photo/thumb.webp"]));

    // What was confirmed stays in the guide, and names nobody. What never was goes.
    const left = await db
      .select({ id: breakContribution.id, userId: breakContribution.userId })
      .from(breakContribution)
      .orderBy(breakContribution.id);
    expect(left).toEqual([
      { id: "confirmed", userId: null },
      { id: "cy-line", userId: "cy" },
      { id: "place", userId: null },
    ]);
    // What she said of Cy's line goes with her, and so does Ben's word on her waiting one.
    expect(await db.select().from(contributionVerdict)).toEqual([]);
    // Cy, whom she brought, is not sponsored a second time; her own sponsorship goes.
    expect(await db.select().from(sponsorship)).toEqual([
      expect.objectContaining({ sponsoredId: "cy", sponsorId: null }),
    ]);

    // The operators' record says that it was deleted, by its id alone.
    const recorded = await db.select().from(operatorAction);
    expect(recorded).toEqual([
      expect.objectContaining({
        action: "account.delete",
        accountId: "ana",
        operatorId: null,
        developerId: null,
        changes: null,
      }),
    ]);
    // The others are as they were.
    expect(await db.select({ id: user.id }).from(user).orderBy(user.id)).toEqual([
      { id: "ben" },
      { id: "cy" },
      { id: "gil" },
      { id: "op" },
    ]);
  });

  it("keeps its username from everyone for thirty days, and one taken away for good", async () => {
    const { db } = database;
    await remove({ password: PASSWORD }, by("ana"));

    const [kept] = await db.select().from(removedUsername);
    expect(kept?.username).toBe("ana");
    const days = ((kept?.freeAt?.getTime() ?? 0) - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(await isUsernameKept(db, "ana")).toBe(true);

    // Thirty days on, it is anyone's.
    await db.update(removedUsername).set({ freeAt: sql`now() - interval '1 minute'` });
    expect(await isUsernameKept(db, "ana")).toBe(false);

    // One an operator took away stays so, whatever an account that took it before did.
    await db.insert(removedUsername).values({ username: "gil" });
    await call(v1Router.account.delete, {}, by("gil", "s-gil-fresh"));
    const [forGood] = await db
      .select()
      .from(removedUsername)
      .where(eq(removedUsername.username, "gil"));
    expect(forGood?.freeAt).toBeNull();
  });

  it("keeps for good a username it left once an operator takes it away from its next holder", async () => {
    const { db } = database;
    await remove({ password: PASSWORD }, by("ana"));
    // Thirty days on, Ben takes it, and an operator takes it away from him.
    await db.update(removedUsername).set({ freeAt: sql`now() - interval '1 minute'` });
    await db.update(user).set({ username: "ana" }).where(eq(user.id, "ben"));
    await call(v1Router.accounts.removeUsername, { id: "ben" }, by("op", "s-op", { site: ADMIN }));

    const [kept] = await db
      .select()
      .from(removedUsername)
      .where(eq(removedUsername.username, "ana"));
    expect(kept?.freeAt).toBeNull();
    expect(await isUsernameKept(db, "ana")).toBe(true);
  });

  it("asks an account with a password for it, and counts the wrong ones", async () => {
    expect(await remove({}, by("ana"))).toMatchObject({
      refused: "FORBIDDEN",
      data: { refused: "password" },
    });
    for (let tried = 0; tried < 5; tried += 1) {
      expect(await remove({ password: "not it" }, by("ana"))).toMatchObject({
        refused: "FORBIDDEN",
        data: { refused: "password" },
      });
    }
    // The sixth in the hour waits for its end, the right one too.
    const calling = by("ana");
    expect(await remove({ password: PASSWORD }, calling)).toMatchObject({
      refused: "TOO_MANY_REQUESTS",
    });
    expect(calling.context.reply.retryAfterSeconds).toBeGreaterThan(0);
    expect(calling.context.reply.retryAfterSeconds).toBeLessThanOrEqual(60 * 60);
    expect(await database.db.select().from(user).where(eq(user.id, "ana"))).toHaveLength(1);
  });

  it("asks an account without a password for a session opened in the last ten minutes", async () => {
    expect(await remove({}, by("gil"))).toMatchObject({
      refused: "FORBIDDEN",
      data: { refused: "session" },
    });
    // A password given for an account that has none is no way round it.
    expect(await remove({ password: "anything" }, by("gil"))).toMatchObject({
      data: { refused: "session" },
    });
    expect(await remove({}, by("gil", "s-gil-fresh"))).toEqual({ deleted: true });
    expect(await database.db.select().from(user).where(eq(user.id, "gil"))).toEqual([]);
  });

  it("is followed by every table that names an account, which goes with it or forgets it", async () => {
    // A table that a later change points at `user` says which it does: decision 071.
    const found = await database.db.execute<{ named: string; rule: string }>(sql`
      select c.conrelid::regclass::text || '.' || a.attname as named, c.confdeltype as rule
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and c.confrelid = '"user"'::regclass
    `);
    const rows = "rows" in found ? found.rows : found;
    expect(rows.filter((one) => one.rule !== "c" && one.rule !== "n")).toEqual([]);
    // What stays naming nobody, and nothing else.
    expect(
      rows
        .filter((one) => one.rule === "n")
        .map((one) => one.named)
        .toSorted(),
    ).toEqual([
      "account_suspension.operator_id",
      "break_candidate.decided_by",
      "break_contribution.decided_by",
      "break_contribution.user_id",
      "developer_member.operator_id",
      "operator_action.operator_id",
      "sponsorship.sponsor_id",
      "spot_publication.decided_by",
    ]);
    // The blocks go with either account.
    expect(
      rows.filter((one) => one.named.startsWith("account_block.")).map((one) => one.rule),
    ).toEqual(["c", "c"]);
  });

  it("refuses an operator, whose rights are taken away first", async () => {
    expect(await remove({ password: PASSWORD }, by("op"))).toMatchObject({ refused: "CONFLICT" });
    expect(await database.db.select().from(user).where(eq(user.id, "op"))).toHaveLength(1);
    expect(await database.db.select().from(operatorAction)).toEqual([]);
  });

  it("says whether the account has a password, and what else it signs in with, for the step that deletes it", async () => {
    expect(await call(v1Router.account.get, undefined, by("ana"))).toMatchObject({
      hasPassword: true,
      signsInWith: [],
    });
    expect(await call(v1Router.account.get, undefined, by("gil"))).toMatchObject({
      hasPassword: false,
      signsInWith: ["google"],
    });
    await database.db.insert(account).values({
      id: "apple-gil",
      accountId: "apple-sub",
      providerId: "apple",
      userId: "gil",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await call(v1Router.account.get, undefined, by("gil"))).toMatchObject({
      signsInWith: ["apple", "google"],
    });
  });

  it("asks Apple to revoke the tokens of an account that signed in with it, and deletes it whatever Apple says", async () => {
    const { db } = database;
    await db.insert(account).values({
      id: "apple-gil",
      accountId: "apple-sub",
      providerId: "apple",
      userId: "gil",
      refreshToken: "apple-refresh",
      accessToken: "apple-access",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const apple = testApple("failed");

    expect(await remove({}, by("gil", "s-gil-fresh", { apple: apple.apple }))).toEqual({
      deleted: true,
    });
    expect(apple.asked).toEqual([{ refreshToken: "apple-refresh", accessToken: "apple-access" }]);
    expect(await db.select().from(user).where(eq(user.id, "gil"))).toEqual([]);

    // An account that never signed in with Apple has nothing asked of Apple.
    const quiet = testApple();
    await remove({ password: PASSWORD }, by("ana", "s-ana", { apple: quiet.apple }));
    expect(quiet.asked).toEqual([]);
  });

  it("revokes what the app's sign-in kept nothing of through the code the app gives, and deletes the account whatever Apple says", async () => {
    const { db } = database;
    // Signed in from the app by an ID token, which keeps no token.
    await db.insert(account).values({
      id: "apple-gil",
      accountId: "apple-sub",
      providerId: "apple",
      userId: "gil",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const APP = "app.example://";
    const fromApp = (apple: ReturnType<typeof testApple>) =>
      by("gil", "s-gil-fresh", {
        apple: apple.apple,
        site: APP,
        server: { startedAt: new Date(), webOrigin: WEB, appOrigins: [APP] },
      });
    const apple = testApple("revoked", { outcome: "failed", at: "exchange", said: "400" });

    expect(await remove({ appleAuthorizationCode: "the-code" }, fromApp(apple))).toEqual({
      deleted: true,
    });
    expect(apple.codes).toEqual([
      { code: "the-code", bundle: "app.example", appleUsers: ["apple-sub"] },
    ]);
    expect(await db.select().from(user).where(eq(user.id, "gil"))).toEqual([]);

    // A code that comes from the web, or for an account that never signed in with Apple, is
    // not exchanged.
    await db.insert(account).values({
      id: "apple-ana",
      accountId: "apple-ana-sub",
      providerId: "apple",
      userId: "ana",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const fromWeb = testApple();
    await remove(
      { password: PASSWORD, appleAuthorizationCode: "a-code" },
      by("ana", "s-ana", { apple: fromWeb.apple }),
    );
    expect(fromWeb.codes).toEqual([]);
    const notLinked = testApple();
    await db.insert(session).values({
      id: "s-cy-app",
      token: "t-cy-app",
      userId: "cy",
      expiresAt: new Date(Date.now() + DAY_MS),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await remove(
      { appleAuthorizationCode: "a-code" },
      by("cy", "s-cy-app", {
        apple: notLinked.apple,
        site: APP,
        server: { startedAt: new Date(), webOrigin: WEB, appOrigins: [APP] },
      }),
    );
    expect(notLinked.codes).toEqual([]);
    expect(await db.select().from(user).where(eq(user.id, "cy"))).toEqual([]);
  });

  it("revokes at Apple's with the refresh token, and answers how it went without throwing", async () => {
    const sent: { url: string; body: string }[] = [];
    const answering = (status: number | "down") =>
      (async (url: string | URL | Request, init?: RequestInit) => {
        sent.push({ url: String(url), body: String(init?.body) });
        if (status === "down") throw new TypeError("fetch failed");
        return new Response(null, { status });
      }) as typeof fetch;
    const client = {
      clientId: "app.example",
      clientSecret: () => "a-signed-secret",
      secretFor: (id: string) => `a-secret-for-${id}`,
    };

    expect(
      await appleRevocation(client, answering(200)).revoke({
        refreshToken: "the-refresh",
        accessToken: "the-access",
      }),
    ).toBe("revoked");
    expect(sent[0]?.url).toBe(APPLE_REVOKE_URL);
    expect(Object.fromEntries(new URLSearchParams(sent[0]?.body))).toEqual({
      client_id: "app.example",
      client_secret: "a-signed-secret",
      token: "the-refresh",
      token_type_hint: "refresh_token",
    });
    expect(
      await appleRevocation(client, answering(400)).revoke({
        refreshToken: null,
        accessToken: "the-access",
      }),
    ).toBe("failed");
    expect(new URLSearchParams(sent[1]?.body).get("token_type_hint")).toBe("access_token");
    expect(
      await appleRevocation(client, answering("down")).revoke({
        refreshToken: "r",
        accessToken: null,
      }),
    ).toBe("failed");
    expect(
      await appleRevocation(client, answering(200)).revoke({
        refreshToken: null,
        accessToken: null,
      }),
    ).toBe("none");
    expect(sent).toHaveLength(3);
  });
});
