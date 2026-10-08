import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * The keyboard shortcuts a user chose to keep in their account. Each device has its own
 * shortcuts: this copy changes only when the user saves it, and reaches a device only when the
 * user asks for it there.
 */
export const savedShortcuts = pgTable("saved_shortcuts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // The changes from the defaults, by action. An empty hotkey means the shortcut is turned off.
  overrides: jsonb("overrides").$type<Record<string, string>>().notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
});
