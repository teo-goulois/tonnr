import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "./index";
import { migrateDatabase } from "./migrate";
import { createEmptyTestDatabase, migrationsFolder, TEST_DATABASE_URL } from "./testing";

describe.skipIf(!TEST_DATABASE_URL)("migrateDatabase", () => {
  let database: Awaited<ReturnType<typeof createEmptyTestDatabase>>;

  beforeAll(async () => {
    database = await createEmptyTestDatabase();
  });
  afterAll(() => database?.drop());

  it("lets the containers of a deployment start together on an empty database", async () => {
    await Promise.all([
      migrateDatabase(database.url, migrationsFolder),
      migrateDatabase(database.url, migrationsFolder),
      migrateDatabase(database.url, migrationsFolder),
    ]);

    const db = createDb({ DATABASE_URL: database.url });
    try {
      const { rows } = await db.$client.query(
        "select count(*)::int as tables from information_schema.tables where table_schema = 'public' and table_name in ('station', 'reading', 'spot')",
      );
      expect(rows).toEqual([{ tables: 3 }]);
    } finally {
      await db.$client.end();
    }
  });

  it("finds nothing left to apply the second time", async () => {
    await expect(migrateDatabase(database.url, migrationsFolder)).resolves.toBeUndefined();
  });
});
