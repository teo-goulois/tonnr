import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { station } from "./buoys";
import { surfBreak } from "./spots";

/**
 * A user's list of stations and of surf breaks. Each user has one default list, their favorites.
 * The table is named for what a list held first.
 */
export const stationList = pgTable(
  "station_list",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // True for the favorites, which are created the first time the user saves something.
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("station_list_userId_idx").on(table.userId),
    // At most one default list per user.
    uniqueIndex("station_list_default_idx")
      .on(table.userId)
      .where(sql`${table.isDefault}`),
  ],
);

export const stationListItem = pgTable(
  "station_list_item",
  {
    listId: text("list_id")
      .notNull()
      .references(() => stationList.id, { onDelete: "cascade" }),
    stationId: text("station_id")
      .notNull()
      .references(() => station.id, { onDelete: "cascade" }),
    // A list shows its stations in the order they were added.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.stationId] }),
    index("station_list_item_stationId_idx").on(table.stationId),
  ],
);

/** A surf break of the catalogue in a list, beside the list's stations. */
export const stationListBreak = pgTable(
  "station_list_break",
  {
    listId: text("list_id")
      .notNull()
      .references(() => stationList.id, { onDelete: "cascade" }),
    // A break that leaves the catalogue leaves the lists it was in.
    breakId: text("break_id")
      .notNull()
      .references(() => surfBreak.id, { onDelete: "cascade" }),
    // A list shows its breaks in the order they were added.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.breakId] }),
    index("station_list_break_breakId_idx").on(table.breakId),
  ],
);
