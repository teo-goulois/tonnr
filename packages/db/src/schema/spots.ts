import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { user } from "./auth";

type Range = { min?: number; max?: number };
// A sector of the compass, clockwise from `from` to `to`. It may pass through north.
type Arc = { from: number; to: number };

/**
 * The conditions that make a spot work, which an alert asks of the sea (decision 031). A
 * criterion left out is not checked.
 */
export type SpotCriteria = {
  waveHeightMeters?: Range;
  wavePeakPeriodSeconds?: Range;
  waveDirectionDegrees?: Arc;
  // The first swell apart from the wind sea, where a model gives one: decision 038. The three
  // above are the whole sea, with the period of its peak. Until 2026-10-12 they were saved as
  // `swellHeightMeters`, `swellPeriodSeconds` and `swellDirectionDegrees`: a migration renamed
  // them in every alert.
  primarySwellHeightMeters?: Range;
  primarySwellDirectionDegrees?: Arc;
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

// The languages a break's description is written in: those of the web app.
export const BREAK_DESCRIPTION_LANGUAGES = ["en", "fr"] as const;
// A description is a few sentences, as a text of a guide is.
export const BREAK_DESCRIPTION_MOST = 600;

/**
 * What the owner of a spot says it is like, in the words the catalogue uses for a break. A field
 * left out says that they have not said, and no list is empty.
 */
export type SpotCharacteristics = {
  breakTypes?: (typeof BREAK_TYPES)[number][];
  waveDirections?: (typeof WAVE_DIRECTIONS)[number][];
  bottomTypes?: (typeof BOTTOM_TYPES)[number][];
  abilityLevels?: (typeof ABILITY_LEVELS)[number][];
  boardTypes?: (typeof BOARD_TYPES)[number][];
  bestSeasons?: (typeof SEASONS)[number][];
  bestTides?: (typeof TIDE_STAGES)[number][];
  bestSwellDirections?: CompassPoint[];
  bestWindDirections?: CompassPoint[];
  offshoreDirectionDegrees?: number;
};

/**
 * A place where the sea is surfed. The catalogue is what a user picks a spot from. A break is
 * added once, by hand, and belongs to the instance from then on: nothing brings it back in line
 * with the list it came from, and only an operator changes it, from the admin (decision 049). Of
 * what a user wrote it holds one thing: a spot they asked to make public, once an operator
 * accepted it (decision 034).
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
    // A few sentences on the break, which an operator wrote in their own words, and the language
    // they wrote them in. Null while nobody has: a list's own text is kept aside, in
    // `surf_break_listing`, and never shown.
    description: text("description"),
    descriptionLanguage: text("description_language", { enum: BREAK_DESCRIPTION_LANGUAGES }),

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
    // When an operator last changed it: what changes a break says which version it read.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("surf_break_provider_ref_idx").on(table.provider, table.providerRef),
    index("surf_break_position_idx").on(table.latitude, table.longitude),
  ],
);

/**
 * What the list a break came from says of it beyond what the catalogue holds, one row a break.
 * Left from decision 024: `surf_break_listing` holds the same since decision 049, and nothing
 * reads this one. The version before still writes it while this one is deployed (decision 009),
 * so the table stays one release, and the next drops it.
 */
export const surfBreakRecord = pgTable("surf_break_record", {
  breakId: text("break_id")
    .primaryKey()
    .references(() => surfBreak.id, { onDelete: "cascade" }),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A break as one list gave it: the list's short name and the break's reference in it, the break
 * of the catalogue it is now, and what the list says of it beyond what the catalogue holds, as
 * the list gave it. A break has a row for its own list and one for each list whose break was
 * merged into it. A row stays when its break is deleted, with no break: a list added again then
 * does not bring back what an operator deleted, nor what they merged. Only an operator reads
 * it, from the admin: decision 049.
 */
export const surfBreakListing = pgTable(
  "surf_break_listing",
  {
    list: text("list").notNull(),
    ref: text("ref").notNull(),
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "set null" }),
    // Null when the list said nothing more of the break.
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.list, table.ref] }),
    index("surf_break_listing_breakId_idx").on(table.breakId),
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
    // Left from decision 006, and read by nothing: a spot is its owner's alone, and what is
    // public of it is the break an operator made of it (decision 034). The version before this
    // one still reads the column while this one is deployed (decision 009), so it stays one
    // release, and the next drops it.
    visibility: text("visibility", { enum: ["private", "public"] })
      .default("private")
      .notNull(),
    // What the owner says the spot is like, for its guide. Null while they have said nothing. It
    // is theirs alone: a spot made from a break takes none of what the catalogue says of it.
    characteristics: jsonb("characteristics").$type<SpotCharacteristics>(),
    // Left from decision 008, and read by nothing: a spot's conditions are its alert's since
    // decision 031. The version before this one still reads the two columns while this one is
    // deployed (decision 009), so they stay one release, and the next drops them.
    criteria: jsonb("criteria").$type<SpotCriteria>().default({}).notNull(),
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

// What became of a request to publish a spot.
export const PUBLICATION_STATES = ["pending", "accepted", "refused"] as const;

/**
 * A spot's owner asked that it be made public, and what an operator answered. Nothing of the spot
 * is copied here: the operator reads the spot as it is, and accepting makes a break of it in the
 * catalogue. Decision 034 gives the rules.
 */
export const spotPublication = pgTable(
  "spot_publication",
  {
    id: text("id").primaryKey(),
    // A spot that is deleted takes its requests with it. The break made of it stays.
    spotId: text("spot_id")
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    // The owner, who asked.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // What the owner tells the operator, to say that the spot is known. Theirs to leave out.
    note: text("note"),
    status: text("status", { enum: PUBLICATION_STATES }).default("pending").notNull(),
    // Why it was refused, as the owner reads it.
    reason: text("reason"),
    // The operator who answered. Null once their account is deleted.
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // The break of the catalogue that accepting made.
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("spot_publication_spotId_createdAt_idx").on(table.spotId, table.createdAt),
    index("spot_publication_status_createdAt_idx").on(table.status, table.createdAt),
    index("spot_publication_userId_idx").on(table.userId),
    // A spot waits for one answer at a time.
    uniqueIndex("spot_publication_pending_idx")
      .on(table.spotId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * What decision 008 told a user about a spot. Nothing reads or writes it since decision 031,
 * whose notifications are in `alert_notification`. The version before this one still does while
 * this one is deployed (decision 009), so the table stays one release, and the next drops it.
 */
export const firstNotification = pgTable(
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
    day: date("day", { mode: "string" }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    missedRuns: integer("missed_runs").default(0).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_spot_day_kind_idx").on(table.spotId, table.day, table.kind),
    index("notification_userId_createdAt_idx").on(table.userId, table.createdAt),
  ],
);
