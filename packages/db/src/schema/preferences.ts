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

// The units a wind speed may be read in: knots, kilometres an hour, metres a second, miles an
// hour. The API speaks in metres a second whatever is chosen here.
export const WIND_SPEED_UNITS = ["kn", "kmh", "ms", "mph"] as const;
export type WindSpeedUnit = (typeof WIND_SPEED_UNITS)[number];

/**
 * The units a user chose to read measurements in, on every device. A user without a row reads
 * them in the units the apps start with. Decision 033.
 */
export const unitPreferences = pgTable("unit_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  windSpeed: text("wind_speed").$type<WindSpeedUnit>().notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
});
