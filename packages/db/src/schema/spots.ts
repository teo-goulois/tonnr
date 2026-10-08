import { doublePrecision, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

export const spot = pgTable(
  "spot",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    visibility: text("visibility", { enum: ["private", "public"] })
      .default("private")
      .notNull(),
    criteria: jsonb("criteria").$type<SpotCriteria>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("spot_userId_idx").on(table.userId)],
);
