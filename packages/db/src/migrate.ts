import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// The number every program that migrates this database locks on. Any number does, as long as
// nothing else on the database takes it.
const MIGRATION_LOCK = 7_266_001;

/**
 * Applies the migrations the database has not seen yet, then closes its connection. It keeps the
 * same record of applied migrations as `drizzle-kit migrate`. The pending migrations run in one
 * transaction, so when one fails none of them is applied, and its error is thrown.
 *
 * Several programs may call it at once, as the containers of a deployment do when they start
 * together: one applies the migrations while the others wait, then find nothing left to apply.
 */
export async function migrateDatabase(databaseUrl: string, migrationsFolder: string) {
  const pool = drizzle(databaseUrl).$client;
  try {
    const client = await pool.connect();
    try {
      await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
      await migrate(drizzle({ client }), { migrationsFolder });
    } finally {
      // The lock belongs to the connection. Closing it, rather than handing it back to the pool,
      // gives the lock up whatever happened.
      client.release(true);
    }
  } finally {
    await pool.end();
  }
}
