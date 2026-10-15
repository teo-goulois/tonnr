import { call, ORPCError } from "@orpc/server";
import type { Session } from "@repo/auth";
import { FRIENDS_MOST, pairOf } from "@repo/db/friends";
import { operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { breakContribution, friendship, rankAward, sponsorship } from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { v1Router } from "./routers/index";
import { testForecasts, testPlaces, testVerification } from "./testing";
import { createUsage, type Usage } from "./usage";

// The link an account gives, and the friends and the sponsor it makes: decision 041.
describe.skipIf(!TEST_DATABASE_URL)("an account's link", () => {
  const WEB = "https://app.example.org";
  const ADMIN = "https://admin.example.org";
  const REEF = "0b6f7a52-4d1c-4f0e-9a3e-1c2d3e4f5a71";

  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let usage: Usage;
  const { forecasts } = testForecasts();

  beforeAll(async () => {
    database = await createTestDatabase();
    usage = createUsage(database.db, { every: null });
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(breakContribution);
    await db.delete(user);
    await db.delete(surfBreak);
    await db.insert(user).values([
      ...["ana", "ben", "cleo"].map((id) => ({
        id,
        name: id,
        username: id,
        email: `${id}@example.org`,
      })),
      // An account made before usernames, which has chosen none.
      { id: "old", name: "Old Account", email: "old@example.org" },
      { id: "owner", name: "Owner", email: "owner@example.org" },
    ]);
    await db.insert(operator).values({ userId: "owner" });
    await db
      .insert(surfBreak)
      .values({ id: REEF, slug: REEF, name: "The reef", latitude: 48, longitude: -4.5 });
  });

  const context = (id: string | null, site: string): Context => ({
    db: database.db,
    session: id
      ? ({
          user: { id, name: id, email: `${id}@example.org`, emailVerified: false },
          session: {
            id: `s-${id}`,
            userId: id,
            token: `t-${id}`,
            expiresAt: new Date("2030-01-01"),
          },
        } as Session)
      : null,
    authorization: null,
    site,
    adminSites: [ADMIN],
    usage,
    forecasts,
    places: testPlaces().places,
    verification: testVerification(database.db, { on: false }).verification,
    reply: {},
    server: { startedAt: new Date("2026-10-11T08:00:00Z"), webOrigin: WEB },
  });
  const by = (id: string) => ({ context: context(id, WEB) });
  const asOperator = () => ({ context: context("owner", ADMIN) });
  // Whoever was given a link and has no account yet.
  const anyone = () => ({ context: context(null, WEB) });

  const code = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
      return "answered";
    } catch (error) {
      return error instanceof ORPCError ? error.code : "threw";
    }
  };
  const linkOf = async (id: string) => (await call(v1Router.friends.link, undefined, by(id))).token;
  const accept = (id: string, token: string) => call(v1Router.friends.accept, { token }, by(id));
  const friendsOf = async (id: string) =>
    (await call(v1Router.friends.list, undefined, by(id))).friends;
  /** A contribution of an account to the reef, which the operator confirms. */
  async function confirmed(id: string, line: "access" | "hazards" | "rules" = "access") {
    const written = await call(
      v1Router.contributions.propose,
      { breakId: REEF, line, value: `Written by ${id}, of ${line}.`, language: "en", agreed: true },
      by(id),
    );
    await call(v1Router.reviews.accept, { id: written.id }, asOperator());
    return written.id;
  }

  it("is one account's, made the first time it is asked for, and changed when the account asks", async () => {
    const first = await linkOf("ana");
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await linkOf("ana")).toBe(first);
    expect(await linkOf("ben")).not.toBe(first);

    const { token } = await call(v1Router.friends.renewLink, undefined, by("ana"));
    expect(token).not.toBe(first);
    expect(await linkOf("ana")).toBe(token);
    // The link before opens nothing.
    expect(await code(call(v1Router.friends.open, { token: first }, anyone()))).toBe("NOT_FOUND");
    expect(await code(accept("ben", first))).toBe("NOT_FOUND");
    // The link of an account that is read by no name opens nothing until it has one.
    const nameless = await linkOf("old");
    expect(await code(call(v1Router.friends.open, { token: nameless }, anyone()))).toBe(
      "NOT_FOUND",
    );
    expect(await code(accept("ben", nameless))).toBe("NOT_FOUND");
  });

  it("says whose it is to whoever was given it, and nothing else", async () => {
    const token = await linkOf("ana");

    expect(await call(v1Router.friends.open, { token }, anyone())).toEqual({
      username: "ana",
      rank: null,
    });
    expect(await code(call(v1Router.friends.open, { token: "no-such-link" }, anyone()))).toBe(
      "NOT_FOUND",
    );
    // A link whose owner an operator left without a username opens nothing.
    await call(v1Router.accounts.removeUsername, { id: "ana" }, asOperator());
    expect(await code(call(v1Router.friends.open, { token }, anyone()))).toBe("NOT_FOUND");
    expect(await code(accept("ben", token))).toBe("NOT_FOUND");
  });

  it("makes friends of two accounts when one opens the other's, and no sponsor", async () => {
    const token = await linkOf("ana");

    expect(await accept("ben", token)).toMatchObject({
      id: "ana",
      username: "ana",
      rank: null,
      sponsored: null,
    });
    expect(await friendsOf("ana")).toMatchObject([{ id: "ben", username: "ben", sponsored: null }]);
    expect(await friendsOf("ben")).toMatchObject([{ id: "ana" }]);
    // Opening it again makes nothing more.
    expect(await accept("ben", token)).toMatchObject({ id: "ana" });
    expect(await database.db.select().from(friendship)).toHaveLength(1);
    // Only an account made through a link has a sponsor.
    expect(await database.db.select().from(sponsorship)).toEqual([]);

    expect(await code(accept("ana", token))).toBe("CONFLICT");
    expect(await code(accept("old", token))).toBe("FORBIDDEN");
    expect(await friendsOf("cleo")).toEqual([]);
  });

  it("makes friends of two accounts whatever their ids, which the database sorts its own way", async () => {
    // The sign-in library names an account with letters of both cases, and digits.
    const ids = ["Zed9", "abe", "ABE", "_x", "é-1"];
    await database.db.insert(user).values(
      ids.map((id, index) => ({
        id,
        name: id,
        username: `u${index}`,
        email: `${index}@example.org`,
      })),
    );

    for (const id of ids) {
      for (const other of ids) {
        if (id !== other)
          expect(await accept(id, await linkOf(other))).toMatchObject({ id: other });
      }
    }
    expect(await friendsOf("abe")).toHaveLength(ids.length - 1);
  });

  it("lets a friend read what the other wrote and that was confirmed, and nothing else", async () => {
    const said = await confirmed("ana");
    // What waits is its author's to read, and so is a spot they asked to make public.
    await call(
      v1Router.contributions.propose,
      { breakId: REEF, line: "bestTides", value: ["high"], agreed: true },
      by("ana"),
    );
    await database.db.insert(breakContribution).values({
      id: "a-place",
      breakId: REEF,
      breakRef: REEF,
      userId: "ana",
      line: "place",
      value: "The reef",
      license: "ODbL-1.0",
      status: "confirmed",
      confirmedAt: new Date(),
    });
    await accept("ben", await linkOf("ana"));

    const read = await call(v1Router.friends.get, { id: "ana" }, by("ben"));

    expect(read).toMatchObject({
      id: "ana",
      username: "ana",
      // A break and a text: 30 points.
      rank: "qs",
      contributions: [
        {
          id: said,
          break: { id: REEF, name: "The reef" },
          line: "access",
          value: "Written by ana, of access.",
        },
      ],
    });
    // A score would say, with what was written, how many accounts the friend brought.
    expect(Object.keys(read)).not.toContain("score");
    // An account that is no friend reads nothing as one.
    expect(await code(call(v1Router.friends.get, { id: "ana" }, by("cleo")))).toBe("NOT_FOUND");
    expect(await code(call(v1Router.friends.get, { id: "nobody" }, by("ben")))).toBe("NOT_FOUND");
  });

  it("ends for both at the word of either: the other does not make it again by the link it holds", async () => {
    const ofAna = await linkOf("ana");
    const ofBen = await linkOf("ben");
    await accept("ben", ofAna);

    expect(await call(v1Router.friends.remove, { id: "ana" }, by("ben"))).toEqual({ ended: true });

    expect(await friendsOf("ana")).toEqual([]);
    expect(await friendsOf("ben")).toEqual([]);
    expect(await code(call(v1Router.friends.get, { id: "ben" }, by("ana")))).toBe("NOT_FOUND");
    expect(await code(call(v1Router.friends.remove, { id: "ana" }, by("ben")))).toBe("NOT_FOUND");
    // Ben ended it: his link no longer makes it, and Ana holds no other.
    expect(await code(accept("ana", ofBen))).toBe("FORBIDDEN");
    expect(await friendsOf("ben")).toEqual([]);
    // He makes it again himself, by hers.
    expect(await accept("ben", ofAna)).toMatchObject({ id: "ana" });
    expect(await friendsOf("ana")).toMatchObject([{ id: "ben" }]);
  });

  it("counts for a sponsor each account it brought, once that account had a contribution confirmed", async () => {
    // Ben and Cleo were made through Ana's link: the sign-in library writes these two rows.
    await database.db.insert(sponsorship).values([
      { sponsorId: "ana", sponsoredId: "ben" },
      { sponsorId: "ana", sponsoredId: "cleo" },
    ]);
    await database.db.insert(friendship).values(pairOf("ana", "ben"));
    const mine = () => call(v1Router.contributions.mine, undefined, by("ana"));

    expect(await mine()).toMatchObject({ score: 0, sponsorships: 0, rank: null });
    expect(await friendsOf("ana")).toMatchObject([{ id: "ben", sponsored: "waiting" }]);

    await confirmed("ben");
    expect(await mine()).toMatchObject({ score: 15, sponsorships: 1, rank: null });
    expect(await friendsOf("ana")).toMatchObject([{ id: "ben", sponsored: "counted" }]);
    // Whatever more the account writes, it was brought once.
    await confirmed("ben", "hazards");
    expect(await mine()).toMatchObject({ score: 15, sponsorships: 1 });

    // The rank a sponsor reaches by it is written the day it is reached.
    await confirmed("cleo", "rules");
    expect(await mine()).toMatchObject({ score: 30, sponsorships: 2, rank: "qs" });
    expect(await database.db.select().from(rankAward)).toContainEqual(
      expect.objectContaining({ userId: "ana", rank: "qs" }),
    );
    // Ben reads Ana as a friend, and not that he counts for her.
    expect(await friendsOf("ben")).toMatchObject([{ id: "ana", sponsored: null }]);
  });

  it("counts the friends two accounts make at the same moment: the last place goes to one", async () => {
    const many = Array.from({ length: FRIENDS_MOST - 1 }, (_, index) => `friend-${index}`);
    await database.db
      .insert(user)
      .values(many.map((id) => ({ id, name: id, username: id, email: `${id}@example.org` })));
    await database.db.insert(friendship).values(many.map((id) => pairOf("ana", id)));
    const token = await linkOf("ana");

    const answers = await Promise.all([code(accept("ben", token)), code(accept("cleo", token))]);

    expect(answers.toSorted()).toEqual(["FORBIDDEN", "answered"]);
    expect(await friendsOf("ana")).toHaveLength(FRIENDS_MOST);
  });

  it("makes no more friends for an account that has all it may have", async () => {
    const many = Array.from({ length: FRIENDS_MOST }, (_, index) => `friend-${index}`);
    await database.db
      .insert(user)
      .values(many.map((id) => ({ id, name: id, username: id, email: `${id}@example.org` })));
    await database.db.insert(friendship).values(many.map((id) => pairOf("ana", id)));

    expect(await code(accept("ben", await linkOf("ana")))).toBe("FORBIDDEN");
    expect(await friendsOf("ben")).toEqual([]);
  });
});
