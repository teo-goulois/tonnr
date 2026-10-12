import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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

// The units a measurement may be read in. The API speaks in SI units whatever is chosen here:
// metres a second, metres, degrees Celsius, kilometres and millimetres.
export const WIND_SPEED_UNITS = ["kn", "kmh", "ms", "mph"] as const;
export const HEIGHT_UNITS = ["m", "ft"] as const;
export const TEMPERATURE_UNITS = ["c", "f"] as const;
export const DISTANCE_UNITS = ["km", "mi"] as const;
export const PRECIPITATION_UNITS = ["mm", "in"] as const;
export type WindSpeedUnit = (typeof WIND_SPEED_UNITS)[number];
export type HeightUnit = (typeof HEIGHT_UNITS)[number];
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export type PrecipitationUnit = (typeof PRECIPITATION_UNITS)[number];

/**
 * The units a user chose to read measurements in, on every device. A user without a row reads
 * them in the units the apps start with, which are also what a column holds until it is chosen:
 * knots, and the metric units. Decision 033.
 */
export const unitPreferences = pgTable("unit_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  windSpeed: text("wind_speed").$type<WindSpeedUnit>().notNull(),
  // The heights of the waves and of the tide.
  height: text("height").$type<HeightUnit>().notNull().default("m"),
  // The water's and the air's.
  temperature: text("temperature").$type<TemperatureUnit>().notNull().default("c"),
  distance: text("distance").$type<DistanceUnit>().notNull().default("km"),
  precipitation: text("precipitation").$type<PrecipitationUnit>().notNull().default("mm"),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
});

// What an account can have looked at: a station, a surf break of the catalogue, or a spot of
// its own.
export const RECENT_KINDS = ["station", "break", "spot"] as const;
export type RecentKind = (typeof RECENT_KINDS)[number];

/**
 * What an account looked at last, so that it finds it again on every device: a few rows, the
 * oldest of which leaves when another comes. The account alone reads them, and it can clear
 * them. A row names what was looked at and keeps nothing of it: one whose station, break or spot
 * is gone is answered to nobody, and leaves in its turn. Decision 042.
 */
export const recentView = pgTable(
  "recent_view",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<RecentKind>().notNull(),
    // The id of the station, of the break or of the spot.
    targetId: text("target_id").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.kind, table.targetId] }),
    index("recent_view_userId_viewedAt_idx").on(table.userId, table.viewedAt),
  ],
);
