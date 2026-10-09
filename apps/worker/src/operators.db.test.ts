import { apiKey, operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { grantOperator, removeOperator } from "./operators";

const WHO = "Owner <owner@example.org>, an account since 2026-10-09";

const hasControlCharacter = (text: string) =>
  Array.from(text).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });

describe.skipIf(!TEST_DATABASE_URL)("the operators of an instance", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(() => database?.drop());
  beforeEach(async () => {
    await database.db.delete(user);
    await database.db.insert(user).values([
      {
        id: "owner",
        name: "Owner",
        email: "owner@example.org",
        createdAt: new Date("2026-10-09T08:00:00Z"),
      },
      { id: "other", name: "Other", email: "other@example.org" },
    ]);
  });

  const operators = async () =>
    (await database.db.select().from(operator)).map((row) => row.userId).sort();
  const keysOf = (userId: string) =>
    database.db.select().from(apiKey).where(eq(apiKey.userId, userId)).orderBy(asc(apiKey.name));
  const key = (userId: string, name: string, revokedAt: Date | null = null) =>
    database.db.insert(apiKey).values({
      id: crypto.randomUUID(),
      userId,
      name,
      prefix: "key_abcd",
      keyHash: `${userId}-${name}`,
      revokedAt,
    });

  it("names the account, and makes it an operator only when told to write", async () => {
    expect(await grantOperator(database.db, ["owner"])).toEqual({
      ok: true,
      lines: [
        `operator: ${WHO} would become an operator.`,
        "Nothing was changed. Run it again with --write to make it one.",
      ],
    });
    expect(await operators()).toEqual([]);

    expect(await grantOperator(database.db, ["owner", "--write"])).toEqual({
      ok: true,
      lines: [`operator: ${WHO} is now an operator.`],
    });
    expect(await operators()).toEqual(["owner"]);
  });

  it("says so when the account is an operator already", async () => {
    await grantOperator(database.db, ["owner", "--write"]);

    expect(await grantOperator(database.db, ["--write", "owner"])).toEqual({
      ok: true,
      lines: [`operator: ${WHO} is already an operator.`],
    });
    expect(await operators()).toEqual(["owner"]);
  });

  it("takes an id, and no address", async () => {
    for (const given of ["owner@example.org", "nobody"]) {
      expect(await grantOperator(database.db, [given, "--write"])).toEqual({
        ok: false,
        lines: [`No account "${given}". An account reads its id, signed in, at GET /v1/account.`],
      });
    }
    expect(await operators()).toEqual([]);
  });

  it("takes an operator's rights away and revokes its keys, when told to write", async () => {
    const earlier = new Date("2026-10-01T00:00:00Z");
    await grantOperator(database.db, ["owner", "--write"]);
    await grantOperator(database.db, ["other", "--write"]);
    await key("owner", "a");
    await key("owner", "b");
    await key("owner", "c, revoked before", earlier);
    await key("other", "theirs");

    expect(await removeOperator(database.db, ["owner"])).toEqual({
      ok: true,
      lines: [
        `operator: ${WHO} would stop being an operator, with 2 keys revoked.`,
        "Nothing was changed. Run it again with --write to do it.",
      ],
    });
    expect(await operators()).toEqual(["other", "owner"]);
    expect((await keysOf("owner")).map((row) => row.revokedAt)).toEqual([null, null, earlier]);

    expect(await removeOperator(database.db, ["owner", "--write"])).toEqual({
      ok: true,
      lines: [`operator: ${WHO} is no longer an operator, with 2 keys revoked.`],
    });
    expect(await operators()).toEqual(["other"]);
    expect((await keysOf("owner")).map((row) => row.revokedAt)).toEqual([
      expect.any(Date),
      expect.any(Date),
      earlier,
    ]);
    expect(await keysOf("other")).toMatchObject([{ revokedAt: null }]);
  });

  it("leaves the keys revoked when the account is made an operator again", async () => {
    await grantOperator(database.db, ["owner", "--write"]);
    await key("owner", "a");
    await removeOperator(database.db, ["owner", "--write"]);

    await grantOperator(database.db, ["owner", "--write"]);

    expect(await keysOf("owner")).toMatchObject([{ revokedAt: expect.any(Date) }]);
  });

  it("says so when the account is no operator", async () => {
    await key("owner", "left alone");

    for (const args of [["owner"], ["owner", "--write"]]) {
      expect(await removeOperator(database.db, args)).toEqual({
        ok: false,
        lines: [`operator: ${WHO} is not an operator.`],
      });
    }
    expect(await keysOf("owner")).toMatchObject([{ revokedAt: null }]);
  });

  it("speaks of one key as one", async () => {
    await grantOperator(database.db, ["owner", "--write"]);
    await key("owner", "a");

    expect((await removeOperator(database.db, ["owner"])).lines[0]).toContain("with 1 key revoked");
  });

  it("revokes a key that was being made while the rights were taken away", async () => {
    await grantOperator(database.db, ["owner", "--write"]);
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    // A key in the making holds the operator's row until it is stored, as the API does.
    const making = database.db.transaction(async (tx) => {
      await tx.select().from(operator).where(eq(operator.userId, "owner")).for("share");
      await tx.insert(apiKey).values({
        id: crypto.randomUUID(),
        userId: "owner",
        name: "made meanwhile",
        prefix: "key_abcd",
        keyHash: "made-meanwhile",
      });
      held.resolve();
      await release.promise;
    });
    await held.promise;

    const removing = removeOperator(database.db, ["owner", "--write"]);
    const waiting = new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 300));
    expect(await Promise.race([removing, waiting])).toBe("waiting");
    release.resolve();
    await making;

    expect(await removing).toMatchObject({
      ok: true,
      lines: [expect.stringContaining("with 1 key revoked")],
    });
    expect(await keysOf("owner")).toMatchObject([{ revokedAt: expect.any(Date) }]);
    expect(await operators()).toEqual([]);
  });

  it("finds no account when the account is deleted while the command runs", async () => {
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const deleting = database.db.transaction(async (tx) => {
      await tx.delete(user).where(eq(user.id, "owner"));
      held.resolve();
      await release.promise;
    });
    await held.promise;

    const granting = grantOperator(database.db, ["owner", "--write"]);
    const waiting = new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 300));
    expect(await Promise.race([granting, waiting])).toBe("waiting");
    release.resolve();
    await deleting;

    expect(await granting).toEqual({
      ok: false,
      lines: ['No account "owner". An account reads its id, signed in, at GET /v1/account.'],
    });
    expect(await operators()).toEqual([]);
  });

  it("shows no control character of a name on the terminal", async () => {
    await database.db
      .update(user)
      .set({ name: "Owner\u001b[2J\u0007", email: "owner\u001b[1A@example.org" })
      .where(eq(user.id, "owner"));

    const shown = await grantOperator(database.db, ["owner"]);
    const unknown = await grantOperator(database.db, ["no\u001b[2Jbody"]);

    expect(hasControlCharacter(shown.lines.join(""))).toBe(false);
    expect(shown.lines[0]).toContain("Owner [2J <owner [1A@example.org>");
    expect(hasControlCharacter(unknown.lines.join(""))).toBe(false);
  });

  it.each([
    ["no account", []],
    ["two accounts", ["owner", "other"]],
    ["an option it does not know", ["owner", "--force"]],
  ])("asks for its arguments again when given %s", async (_, args) => {
    expect(await grantOperator(database.db, args)).toEqual({
      ok: false,
      lines: ["Usage: job operator <account id> [--write]"],
    });
    expect(await removeOperator(database.db, args)).toEqual({
      ok: false,
      lines: ["Usage: job operator-remove <account id> [--write]"],
    });
  });
});
