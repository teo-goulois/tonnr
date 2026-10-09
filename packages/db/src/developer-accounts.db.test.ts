import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "./index";
import { migrateDatabase } from "./migrate";
import { createEmptyTestDatabase, migrationsFolder, TEST_DATABASE_URL } from "./testing";

// The migration that brought the developer accounts, and what it does to the keys it finds.
const MIGRATION = "20261009101738_developer-accounts";

describe.skipIf(!TEST_DATABASE_URL)("the migration to developer accounts", () => {
  let database: Awaited<ReturnType<typeof createEmptyTestDatabase>>;
  let before: string;

  beforeAll(async () => {
    database = await createEmptyTestDatabase();
    // The migrations as they were before this one, in a folder of their own.
    before = await mkdtemp(path.join(tmpdir(), "migrations-"));
    for (const name of await readdir(migrationsFolder)) {
      if (name < MIGRATION) {
        await cp(path.join(migrationsFolder, name), path.join(before, name), { recursive: true });
      }
    }
  });
  afterAll(async () => {
    await database?.drop();
    if (before) await rm(before, { recursive: true });
  });

  it("gives the keys it finds a developer account named after their maker, one for each maker", async () => {
    await migrateDatabase(database.url, before);
    const db = createDb({ DATABASE_URL: database.url });
    try {
      const at = "2026-10-09T08:00:00Z";
      const account = (id: string, name: string) =>
        db.$client.query(
          `insert into "user" (id, name, email, email_verified, created_at, updated_at)
           values ($1, $2, $3, false, $4, $4)`,
          [id, name, `${id}@example.org`, at],
        );
      const key = (id: string, maker: string, revokedAt: string | null = null) =>
        db.$client.query(
          `insert into api_key (id, user_id, name, prefix, key_hash, revoked_at)
           values ($1, $2, $1, 'key_abcd', $3, $4)`,
          [id, maker, id.padEnd(64, "0"), revokedAt],
        );
      await account("owner", "  Owner ");
      await account("second", `${"n".repeat(100)}`);
      await account("nameless", " \u0007 ");
      await account("keyless", "Keyless");
      await db.$client.query("insert into operator (user_id) values ('owner')");
      await key("first", "owner");
      await key("other", "owner");
      // A maker who is no longer an operator, and whose key was revoked.
      await key("revoked", "second", at);
      await key("unnamed", "nameless");

      await migrateDatabase(database.url, migrationsFolder);

      const { rows: keys } = await db.$client.query(
        `select api_key.id, developer.name, developer.id as developer
         from api_key left join developer on developer.id = api_key.developer_id
         order by api_key.id`,
      );
      expect(keys.map((row) => [row.id, row.name])).toEqual([
        ["first", "Owner"],
        ["other", "Owner"],
        ["revoked", "n".repeat(80)],
        ["unnamed", "Operator"],
      ]);
      expect(keys[0].developer).toBe(keys[1].developer);
      expect(new Set(keys.map((row) => row.developer)).size).toBe(3);

      const { rows: developers } = await db.$client.query(
        "select id, calls_per_hour, suspended_at, contact, note from developer",
      );
      expect(developers).toHaveLength(3);
      for (const made of developers) {
        expect(made.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(made).toMatchObject({
          calls_per_hour: null,
          suspended_at: null,
          contact: null,
          note: null,
        });
      }
    } finally {
      await db.$client.end();
    }
  });

  it("still takes a key that names no developer account, as the version before makes them", async () => {
    const db = createDb({ DATABASE_URL: database.url });
    try {
      await db.$client.query(
        `insert into api_key (id, user_id, name, prefix, key_hash)
         values ('late', 'owner', 'late', 'key_abcd', $1)`,
        ["late".padEnd(64, "0")],
      );

      const { rows } = await db.$client.query("select developer_id from api_key where id = 'late'");
      expect(rows).toEqual([{ developer_id: null }]);
    } finally {
      await db.$client.end();
    }
  });
});
