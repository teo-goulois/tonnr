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

// What a break is said to be. Each list is the whole vocabulary of its column: the import refuses
// any other word, and the API answers with these.
export const BREAK_TYPES = [
  "beach",
  "reef",
  "point",
  "jetty",
  "pier",
  "offshore",
  "slab",
  "canyon",
] as const;
export const WAVE_DIRECTIONS = ["left", "right"] as const;
export const BOTTOM_TYPES = ["sand", "rock", "coral", "lava"] as const;
export const ABILITY_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
export const BOARD_TYPES = [
  "shortboard",
  "fish",
  "funboard",
  "longboard",
  "gun",
  "bodyboard",
  "bodysurf",
  "skimboard",
  "sup",
  "foil",
  "kite",
  "tow",
] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const TIDE_STAGES = ["low", "mid_low", "mid", "mid_high", "high"] as const;
// The sixteen points of the compass, clockwise from north.
export const COMPASS_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * A place where the sea is surfed. The catalogue is what a user picks a spot from, and it holds
 * nothing a user wrote. A break is added once, by hand, and belongs to the instance from then
 * on: nothing brings it back in line with the list it came from.
 */
export const surfBreak = pgTable(
  "surf_break",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),

    // What the break is like. A column left null says that nobody has said.
    breakTypes: text("break_types").$type<(typeof BREAK_TYPES)[number]>().array(),
    waveDirections: text("wave_directions").$type<(typeof WAVE_DIRECTIONS)[number]>().array(),
    bottomTypes: text("bottom_types").$type<(typeof BOTTOM_TYPES)[number]>().array(),
    abilityLevels: text("ability_levels").$type<(typeof ABILITY_LEVELS)[number]>().array(),
    boardTypes: text("board_types").$type<(typeof BOARD_TYPES)[number]>().array(),
    bestSeasons: text("best_seasons").$type<(typeof SEASONS)[number]>().array(),
    bestTides: text("best_tides").$type<(typeof TIDE_STAGES)[number]>().array(),
    // Where the swell and the wind come from when the break works.
    bestSwellDirections: text("best_swell_directions").$type<CompassPoint>().array(),
    bestWindDirections: text("best_wind_directions").$type<CompassPoint>().array(),
    // Where the wind blows from when it blows off the shore, clockwise from north.
    offshoreDirectionDegrees: integer("offshore_direction_degrees"),
    // The places the break lies in, from the widest to the nearest.
    location: text("location").array(),
    // The IANA name of the time zone, such as "Europe/Paris".
    timezone: text("timezone"),

    // Where the break was read, when the list it came from says so. An import knows a break
    // again by the first two.
    provider: text("provider"),
    // The break's identifier in that list, for example "node/123".
    providerRef: text("provider_ref"),
    // The page that shows the break.
    sourceUrl: text("source_url"),
    licenseType: text("license_type"),
    licenseUrl: text("license_url"),
    attribution: text("attribution"),
    // When the break was read in its list. The weekly import of decision 015 wrote it.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("surf_break_provider_ref_idx").on(table.provider, table.providerRef),
    index("surf_break_position_idx").on(table.latitude, table.longitude),
  ],
);

/**
 * What the list a break came from says of it beyond what the catalogue holds, as the list gave
 * it. It is kept for the day the model of a break grows, and nothing reads it until then: no
 * procedure of the API, and no scheduled job.
 */
export const surfBreakRecord = pgTable("surf_break_record", {
  breakId: text("break_id")
    .primaryKey()
    .references(() => surfBreak.id, { onDelete: "cascade" }),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
