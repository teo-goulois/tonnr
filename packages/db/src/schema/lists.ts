import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { station } from "./buoys";
import { spot, surfBreak } from "./spots";

/**
 * A user's list of stations, of surf breaks and of their own spots. Each user has one default
 * list, their favorites. The table is named for what a list held first.
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

/** A spot of the list's owner in a list, beside its stations and its breaks. */
export const stationListSpot = pgTable(
  "station_list_spot",
  {
    listId: text("list_id")
      .notNull()
      .references(() => stationList.id, { onDelete: "cascade" }),
    // A spot that is deleted leaves the lists it was in.
    spotId: text("spot_id")
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    // A list shows its spots in the order they were added.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.spotId] }),
    index("station_list_spot_spotId_idx").on(table.spotId),
  ],
);

/**
 * The link a list is shared by: whoever has it reads the list, its owner's spots in it too. A
 * list has one link at a time, and none until its owner shares it. Decision 035 gives the rules.
 */
export const stationListShare = pgTable("station_list_share", {
  listId: text("list_id")
    .primaryKey()
    .references(() => stationList.id, { onDelete: "cascade" }),
  // What the link ends with. It is kept as it is, so that the owner can copy the link again:
  // the database already holds the list it opens.
  token: text("token").notNull().unique(),
  // The password the owner asks of whoever opens the link, as its salt and its scrypt. Null
  // for a link that asks none.
  passwordHash: text("password_hash"),
  // The wrong passwords the link was given since `wrongSince`: it takes ten in a quarter of an
  // hour.
  wrongPasswords: integer("wrong_passwords").default(0).notNull(),
  wrongSince: timestamp("wrong_since", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** An account that opened a list's link and kept the list: it reads it without the link. */
export const stationListMember = pgTable(
  "station_list_member",
  {
    listId: text("list_id")
      .notNull()
      .references(() => stationList.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.userId] }),
    index("station_list_member_userId_idx").on(table.userId),
  ],
);
