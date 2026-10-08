import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

export function createDb(env: DatabaseConfig): Database {
  return drizzle(env.DATABASE_URL, { relations });
}
