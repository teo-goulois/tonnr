import { randomUUID } from "node:crypto";
import path from "node:path";

import { createDb } from "./index";
import { migrateDatabase } from "./migrate";

// The tests that need Postgres run when TEST_DATABASE_URL names a server on which they may create
// databases. Each one works in a database of its own and drops it, so the database the address
// names is never written to. Without the variable those tests are skipped.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const migrationsFolder = path.resolve(import.meta.dirname, "migrations");

/** The server's address, refused before anything is created when it is not a plain one. */
function serverUrl() {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");

  const url = new URL(TEST_DATABASE_URL);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL must be a postgresql:// address");
  }
  // The driver lets a parameter name another database than the path does.
  if (url.search !== "") throw new Error("TEST_DATABASE_URL must not carry parameters");
  return url;
}

async function query(databaseUrl: string, statement: string) {
  const db = createDb({ DATABASE_URL: databaseUrl });
  try {
    return await db.$client.query(statement);
  } finally {
    await db.$client.end();
  }
}

/** Creates a database with no table in it. `drop` deletes it. */
export async function createEmptyTestDatabase() {
  const url = serverUrl();
  const server = url.href;
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  url.pathname = `/${name}`;

  await query(server, `create database ${name}`);
  const drop = async () => {
    const db = createDb({ DATABASE_URL: server });
    try {
      // A pool says it has ended before the server has let its connections go, and dropping
      // the database under one of them ends it with an error. A test that opened a pool of its
      // own has closed it by now: its connections are given a second to go, and what is left
      // after it is ended by force.
      for (let tries = 0; tries < 40; tries += 1) {
        const { rows } = await db.$client.query(
          "select count(*)::int as open from pg_stat_activity where datname = $1",
          [name],
        );
        if (rows[0]?.open === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await db.$client.query(`drop database if exists ${name} with (force)`);
    } finally {
      await db.$client.end();
    }
  };

  try {
    // Whatever the driver made of the address, the tests must be where they think they are.
    const { rows } = await query(url.href, "select current_database() as name");
    if (rows[0]?.name !== name) throw new Error("The address does not lead to the test database");
  } catch (error) {
    await drop();
    throw error;
  }
  return { url: url.href, drop };
}

/** Creates a database with the current schema. `drop` closes its connections and deletes it. */
export async function createTestDatabase() {
  const { url, drop } = await createEmptyTestDatabase();
  try {
    await migrateDatabase(url, migrationsFolder);
  } catch (error) {
    await drop();
    throw error;
  }

  const db = createDb({ DATABASE_URL: url });
  // Each connection the pool opens, until the connection itself says it is closed. The pool
  // says it has ended before that.
  const closing = new Set<Promise<void>>();
  db.$client.on("connect", (client) => {
    const closed = new Promise<void>((resolve) => client.once("end", () => resolve()));
    closing.add(closed);
    void closed.then(() => closing.delete(closed));
  });

  return {
    db,
    drop: async () => {
      // A connection that the server ends while it closes tells its pool. Nothing is wrong
      // then, and an error that nobody listens to would fail the run.
      db.$client.on("error", () => {});
      await db.$client.end();
      // Closed for good, or five seconds: the drop below ends by force what is left.
      const patience = new Promise<void>((resolve) => setTimeout(resolve, 5000).unref());
      await Promise.race([Promise.all(closing), patience]);
      await drop();
    },
  };
}
