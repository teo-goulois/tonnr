import type { AppleRevocation, AppleTokens } from "@repo/auth/apple-revocation";
import {
  accountSuspension,
  operator,
  operatorAction,
  removedUsername,
} from "@repo/db/schema/access";
import { account, user } from "@repo/db/schema/auth";
import { breakContribution } from "@repo/db/schema/community";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { deleteAccountByCommand, forgetUsernames } from "./deletion";

const WHO = "Ana <ana@example.org>, an account since 2026-09-01";

// What an operator deletes for someone who asked by mail, as the account would delete itself:
// decision 071.
describe.skipIf(!TEST_DATABASE_URL)("deleting an account by a command", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    const { db } = database;
    await db.delete(breakContribution);
    await db.delete(user);
    await db.delete(surfBreak);
    await db.delete(operatorAction);
    await db.delete(removedUsername);
    const old = new Date("2026-09-01T08:00:00Z");
    await db.insert(user).values([
      { id: "ana", name: "Ana", email: "ana@example.org", username: "ana", createdAt: old },
      { id: "op", name: "Op", email: "op@example.org", username: "op", createdAt: old },
    ]);
    await db.insert(operator).values({ userId: "op" });
    // Suspended: it has no session to delete itself from, and asked by mail.
    await db.insert(accountSuspension).values({ userId: "ana", operatorId: "op" });
    await db.insert(surfBreak).values({
      id: "point",
      slug: "point",
      name: "The point",
      latitude: 43.48,
      longitude: -1.56,
    });
    const contribution = (id: string, status: "confirmed" | "shown", line: "access" | "entry") => ({
      id,
      breakId: "point",
      breakRef: "point",
      userId: "ana",
      line,
      value: "A path from the car park.",
      license: "DbCL-1.0" as const,
      language: "en" as const,
      status,
      ...(status === "confirmed" ? { confirmedAt: new Date() } : { shownAt: new Date() }),
    });
    await db
      .insert(breakContribution)
      .values([
        contribution("kept", "confirmed", "access"),
        contribution("waiting", "shown", "entry"),
      ]);
  });

  const testApple = () => {
    const asked: AppleTokens[] = [];
    const apple: AppleRevocation = {
      revoke: async (tokens) => {
        asked.push(tokens);
        return "revoked";
      },
      // A command has no app that gives a code.
      revokeCode: async () => {
        throw new Error("A command gives no code");
      },
    };
    return { apple, asked };
  };

  it("names the account, and deletes it only when told to write", async () => {
    const { db } = database;
    expect(await deleteAccountByCommand(db, ["ana"], undefined)).toEqual({
      ok: true,
      lines: [
        `account: ${WHO} would be deleted, with its sessions, its spots, its lists, its alerts, its log, its reports and what it wrote that was never confirmed.`,
        "What it wrote that was confirmed stays in the guides, under no name, and its username is nobody's for 30 days.",
        "Nothing was changed. Run it again with --write to delete it.",
      ],
    });
    expect(await db.select({ id: user.id }).from(user).where(eq(user.id, "ana"))).toHaveLength(1);

    expect(await deleteAccountByCommand(db, ["ana", "--write"], undefined)).toEqual({
      ok: true,
      lines: [`account: ${WHO} is deleted.`],
    });
    expect(await db.select().from(user).where(eq(user.id, "ana"))).toEqual([]);
    // As its own deletion does: what was confirmed stays under no name, what waited goes, and its
    // username is nobody's for thirty days.
    expect(
      await db
        .select({ id: breakContribution.id, userId: breakContribution.userId })
        .from(breakContribution),
    ).toEqual([{ id: "kept", userId: null }]);
    const [kept] = await db.select().from(removedUsername);
    expect(kept).toMatchObject({ username: "ana", freeAt: expect.any(Date) });
    // The record says that a command did it, which names no operator.
    expect(await db.select().from(operatorAction)).toEqual([
      expect.objectContaining({
        action: "account.delete_by_command",
        accountId: "ana",
        operatorId: null,
      }),
    ]);
  });

  it("refuses an operator, an account that is not there, and what is not one id", async () => {
    const { db } = database;
    expect(await deleteAccountByCommand(db, ["op", "--write"], undefined)).toMatchObject({
      ok: false,
      lines: [expect.stringContaining("is an operator")],
    });
    expect(await db.select().from(user).where(eq(user.id, "op"))).toHaveLength(1);
    expect(await deleteAccountByCommand(db, ["nobody", "--write"], undefined)).toMatchObject({
      ok: false,
    });
    expect(await deleteAccountByCommand(db, ["ana", "op", "--write"], undefined)).toMatchObject({
      ok: false,
      lines: ["Usage: job account-delete <account id> [--write]"],
    });
    expect(await db.select().from(operatorAction)).toEqual([]);
  });

  it("asks Apple to revoke its tokens once it is gone, and says so when the worker cannot", async () => {
    const { db } = database;
    const link = { refreshToken: "apple-refresh", accessToken: null };
    const linked = () =>
      db.insert(account).values({
        id: "apple-ana",
        accountId: "apple-sub",
        providerId: "apple",
        userId: "ana",
        ...link,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    await linked();
    const apple = testApple();
    expect(await deleteAccountByCommand(db, ["ana", "--write"], apple.apple)).toEqual({
      ok: true,
      lines: [
        `account: ${WHO} is deleted.`,
        "Apple was asked to revoke its tokens: 1 revoked, 0 failed.",
      ],
    });
    expect(apple.asked).toEqual([link]);

    // A worker that reads none of Apple's settings deletes it all the same, and says what it did
    // not do.
    await db.insert(user).values({
      id: "ana",
      name: "Ana",
      email: "ana@example.org",
      createdAt: new Date("2026-09-01T08:00:00Z"),
    });
    await linked();
    const answer = await deleteAccountByCommand(db, ["ana", "--write"], undefined);
    expect(answer.ok).toBe(true);
    expect(answer.lines.at(-1)).toMatch(/Apple was not asked/);
  });

  it("forgets a deleted account's username once its thirty days are over, and keeps one taken away", async () => {
    const { db } = database;
    const day = 24 * 60 * 60 * 1000;
    await db.insert(removedUsername).values([
      { username: "free_again", freeAt: new Date(Date.now() - 60_000) },
      { username: "kept_still", freeAt: new Date(Date.now() + day) },
      // Taken away by an operator: for good.
      { username: "taken_away", freeAt: null },
    ]);
    expect(await Effect.runPromise(forgetUsernames(db))).toBe(1);
    expect(
      (await db.select({ username: removedUsername.username }).from(removedUsername))
        .map((row) => row.username)
        .toSorted(),
    ).toEqual(["kept_still", "taken_away"]);
  });
});
