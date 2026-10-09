import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolConfig } from "pg";
import { parse as parseAddress } from "pg-connection-string";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

/**
 * What a pool is opened with, when a program has settings of its own for its connections. The
 * driver lets what an address carries take the place of what a program asks for. Here the
 * program has the last word: the address is read as the driver reads it, in every form the
 * driver accepts, and the program's settings are laid over it. The `options` of the two are
 * the exception, since each is a list: the address's come first, and the program's after them,
 * where the database lets them win.
 */
export function connectionOf(address: string, pool: PoolConfig): PoolConfig {
  const read = parseAddress(address);
  // A backslash that ends the address's options would take the space that follows for its own.
  const theirs = read.options?.replace(/(?<!\\)((?:\\\\)*)\\$/, "$1");
  const options = [theirs, pool.options].filter(Boolean).join(" ");
  return { ...(read as PoolConfig), ...pool, ...(options && { options }) };
}

/**
 * A client of the database. `pool` sets what its connections may do, such as how long a
 * statement may run: the worker gives its jobs a limit that way.
 */
export function createDb(env: DatabaseConfig, pool?: PoolConfig): Database {
  if (!pool) return drizzle(env.DATABASE_URL, { relations });
  return drizzle({ connection: connectionOf(env.DATABASE_URL, pool), relations });
}
