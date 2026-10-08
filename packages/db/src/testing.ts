import { randomUUID } from "node:crypto";
import path from "node:path";

import { createDb } from "./index";
import { migrateDatabase } from "./migrate";

// The tests that need Postgres run when TEST_DATABASE_URL names a server on which they may create
// databases. Each one works in a database of its own and drops it, so the database the address
// names is never written to. Without the variable those tests are skipped.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const migrationsFolder = path.resolve(import.meta.dirname, "migrations");

async function onServer(statement: string) {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");

  const server = createDb({ DATABASE_URL: TEST_DATABASE_URL });
  try {
    await server.$client.query(statement);
  } finally {
    await server.$client.end();
  }
}

/** Creates a database with no table in it. `drop` deletes it. */
export async function createEmptyTestDatabase() {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");

  const name = `test_${randomUUID().replaceAll("-", "")}`;
  await onServer(`create database ${name}`);

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  return { url: url.href, drop: () => onServer(`drop database ${name} with (force)`) };
}

/** Creates a database with the current schema. `drop` closes its connections and deletes it. */
export async function createTestDatabase() {
  const { url, drop } = await createEmptyTestDatabase();
  await migrateDatabase(url, migrationsFolder);

  const db = createDb({ DATABASE_URL: url });
  return {
    db,
    drop: async () => {
      await db.$client.end();
      await drop();
    },
  };
}
