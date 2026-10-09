import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
 * An account that an operator suspended: it has no session, and cannot sign in until the row is
 * deleted. What it owns stays. An operator is never suspended. Decision 025 gives the rules.
 */
export const accountSuspension = pgTable("account_suspension", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  // The operator who suspended it. Null once their account is deleted.
  operatorId: text("operator_id").references(() => user.id, { onDelete: "set null" }),
});

/**
 * Whoever consumes the API with keys: a person, a team or a program, as the operator names it.
 * The operator creates it and makes its keys. It is not an account that signs in: it has no
 * password and no session. Decision 020 gives the rules.
 */
export const developer = pgTable("developer", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // How the operator reaches whoever holds the keys. Theirs to give or to leave out.
  contact: text("contact"),
  note: text("note"),
  // How many calls the account's keys may make between them in an hour. Null: as many as it likes.
  callsPerHour: integer("calls_per_hour"),
  // While it is set, none of the account's keys works. Cleared when the account is resumed.
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A key a program calls the API with, in place of a session. It reads the data everyone shares
 * and nothing of an account. It works while it is not revoked, its developer account is not
 * suspended, and its maker is an operator.
 */
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    // The developer account the key belongs to, for good. Null only on a key made by a version
    // that knew no developer account: decision 020 says what becomes of those.
    developerId: text("developer_id").references(() => developer.id, { onDelete: "cascade" }),
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
    // The minute of the last call the key made while it worked, written with the counts.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // Set once and never cleared: a revoked key does not come back.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_key_keyHash_idx").on(table.keyHash),
    index("api_key_userId_idx").on(table.userId),
    index("api_key_developerId_idx").on(table.developerId),
  ],
);

/**
 * How many calls a developer account's keys were let through in an hour. The limit is kept
 * here: each call adds one in the statement that finds its key, and the addition is refused
 * once the row holds the account's limit.
 */
export const developerCalls = pgTable(
  "developer_calls",
  {
    // The start of the hour, UTC's.
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    developerId: text("developer_id")
      .notNull()
      .references(() => developer.id, { onDelete: "cascade" }),
    calls: integer("calls").notNull(),
  },
  (table) => [primaryKey({ columns: [table.hour, table.developerId] })],
);

// Who a count belongs to: a key, the accounts that called with a session, all together, or no one
// the instance knows.
export const USAGE_VIA = ["key", "session", "none"] as const;
// What came of a call. Decision 020 says which answer gets which word.
export const USAGE_OUTCOMES = ["answered", "invalid", "refused", "limited", "failed"] as const;

/**
 * How many times a procedure was run in an hour, by caller and by what came of it. These are
 * for reading: the API writes them every thirty seconds, and loses some when it is killed.
 * Nothing else is kept of a call.
 */
export const apiUsage = pgTable(
  "api_usage",
  {
    // The start of the hour, UTC's.
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    via: text("via", { enum: USAGE_VIA }).notNull(),
    // The key that was named, working or not. Null unless a key the instance knows was named.
    keyId: text("key_id").references(() => apiKey.id, { onDelete: "cascade" }),
    // The procedure's place in the router, such as `v1.stations.list`.
    procedure: text("procedure").notNull(),
    outcome: text("outcome", { enum: USAGE_OUTCOMES }).notNull(),
    calls: integer("calls").notNull(),
  },
  (table) => [
    // One row for each of these, the calls without a key too: a write adds to the row it finds.
    unique("api_usage_bucket")
      .on(table.hour, table.via, table.keyId, table.procedure, table.outcome)
      .nullsNotDistinct(),
    index("api_usage_keyId_hour_idx").on(table.keyId, table.hour),
    check("api_usage_via_key", sql`(${table.via} = 'key') = (${table.keyId} is not null)`),
  ],
);

// What an operator can do to what runs the instance, as the record of it names it.
export const OPERATOR_ACTIONS = [
  "developer.create",
  "developer.update",
  "developer.suspend",
  "developer.resume",
  "developer.delete",
  "key.create",
  "key.revoke",
  "account.sign_out",
  "account.suspend",
  "account.resume",
] as const;

/**
 * What an action changed. A name and a limit are given as they were and as they are. A contact
 * and a note are only said to have changed: what they held is not copied into a record that
 * outlives the account.
 */
export type OperatorChanges = {
  name?: { from: string; to: string };
  callsPerHour?: { from: number | null; to: number | null };
  contact?: true;
  note?: true;
  // How many open sessions of an account were closed.
  sessions?: number;
};

/**
 * What an operator did to a developer account, to a key or to an account, and when. It is written in the
 * transaction that does it, so that nothing is done without its record, and no record says what
 * was not done. A key is named and never held here. The record of an account outlives the
 * account: it is deleted thirteen months after its day, with the counts.
 */
export const operatorAction = pgTable(
  "operator_action",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    // The operator who did it. Null once their account is deleted.
    operatorId: text("operator_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action", { enum: OPERATOR_ACTIONS }).notNull(),
    // The developer account it was done to, or whose key it was, with the name it had then.
    // Neither points to the account: the record of a deletion names what was deleted. Null for
    // a key that had no developer account.
    developerId: text("developer_id"),
    developerName: text("developer_name"),
    // The key that was made or revoked, by its name. Null for what was done to an account.
    keyId: text("key_id"),
    keyName: text("key_name"),
    // The account whose sessions were closed, or that was suspended or let in again. Its
    // identifier alone: an account is a person, and the record outlives it. It does not point
    // to the account, so that the record of one that was deleted stays.
    accountId: text("account_id"),
    changes: jsonb("changes").$type<OperatorChanges>(),
  },
  (table) => [
    index("operator_action_at_idx").on(table.at),
    index("operator_action_developerId_at_idx").on(table.developerId, table.at),
    index("operator_action_accountId_at_idx").on(table.accountId, table.at, table.id),
  ],
);
