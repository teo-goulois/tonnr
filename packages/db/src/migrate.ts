import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Applies the migrations the database has not seen yet, then closes its connection. It keeps the
 * same record of applied migrations as `drizzle-kit migrate`. Each migration runs in a
 * transaction, so one that fails leaves nothing behind, and its error is thrown.
 */
export async function migrateDatabase(databaseUrl: string, migrationsFolder: string) {
  const db = drizzle(databaseUrl);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}
