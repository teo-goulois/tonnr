import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Applies the migrations the database has not seen yet, then closes its connection. It keeps the
 * same record of applied migrations as `drizzle-kit migrate`. The pending migrations run in one
 * transaction, so when one fails none of them is applied, and its error is thrown.
 */
export async function migrateDatabase(databaseUrl: string, migrationsFolder: string) {
  const db = drizzle(databaseUrl);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}
