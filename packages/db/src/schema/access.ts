import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * The accounts that run the instance. An operator makes the API keys and reads what the
 * instance keeps for its operator alone. No procedure writes this table: the worker's
 * `job operator` does, from the server.
 */
export const operator = pgTable("operator", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A key a program calls the API with, in place of a session. It reads the data everyone shares
 * and nothing of an account. It works while it is not revoked and its maker is an operator.
 */
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    // The operator who made the key.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The key's first characters, to tell keys apart in a list.
    prefix: text("prefix").notNull(),
    // The SHA-256 of the key. The key itself is shown once and stored nowhere.
    keyHash: text("key_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // To the minute: a key in steady use is not written at every call.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // Set once and never cleared: a revoked key does not come back.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_key_keyHash_idx").on(table.keyHash),
    index("api_key_userId_idx").on(table.userId),
  ],
);
