import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

type Range = { min?: number; max?: number };
// A sector of the compass, clockwise from `from` to `to`. It may pass through north.
type Arc = { from: number; to: number };

/** The conditions that make a spot work. A criterion left out is not checked. */
export type SpotCriteria = {
  swellHeightMeters?: Range;
  swellPeriodSeconds?: Range;
  swellDirectionDegrees?: Arc;
  windSpeedMetersPerSecond?: Range;
  windDirectionDegrees?: Arc;
  tideHeightMeters?: Range;
  tideTrend?: "rising" | "falling";
};

/**
 * A place where the sea is surfed, as an open source lists it. The catalogue is what a user
 * picks a spot from, and it holds nothing a user wrote.
 */
export const surfBreak = pgTable(
  "surf_break",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    // The break's identifier at the provider, for example "node/123".
    providerRef: text("provider_ref").notNull(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    // The provider's page that shows the break.
    sourceUrl: text("source_url").notNull(),
    licenseType: text("license_type").notNull(),
    licenseUrl: text("license_url").notNull(),
    attribution: text("attribution").notNull(),
    // When an import last found the break in the provider's list.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("surf_break_provider_ref_idx").on(table.provider, table.providerRef),
    index("surf_break_position_idx").on(table.latitude, table.longitude),
  ],
);

export const spot = pgTable(
  "spot",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The catalogue break the spot was created from. The spot keeps its own name and point, so
    // it lives on when the break leaves the catalogue.
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    visibility: text("visibility", { enum: ["private", "public"] })
      .default("private")
      .notNull(),
    criteria: jsonb("criteria").$type<SpotCriteria>().notNull(),
    // Whether the owner is told when the spot is forecast to work.
    alertsEnabled: boolean("alerts_enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("spot_userId_idx").on(table.userId),
    index("spot_breakId_idx").on(table.breakId),
  ],
);

/**
 * What a user is told about a spot: that a window was found for a day, or that an announced
 * window is gone. There is at most one of each kind per spot and day.
 */
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spotId: text("spot_id")
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["window_found", "window_cancelled"] }).notNull(),
    // The UTC day on which the window starts.
    day: date("day", { mode: "string" }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    // For a found window: how many evaluations in a row no longer saw one that day.
    missedRuns: integer("missed_runs").default(0).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_spot_day_kind_idx").on(table.spotId, table.day, table.kind),
    index("notification_userId_createdAt_idx").on(table.userId, table.createdAt),
  ],
);
