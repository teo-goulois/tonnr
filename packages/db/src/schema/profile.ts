import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import type { SurfSize } from "./sessions";
import { ABILITY_LEVELS, BOARD_TYPES } from "./spots";

// How well a surfer reads a forecast, in their own words: they look whether it is good, they
// read the swell, its period and the wind, or they read all of it, the models and the buoys.
export const FORECAST_READINGS = ["glance", "basics", "everything"] as const;
export type ForecastReading = (typeof FORECAST_READINGS)[number];
export type SurferLevel = (typeof ABILITY_LEVELS)[number];
export type BoardType = (typeof BOARD_TYPES)[number];

/**
 * What an account said of itself as a surfer, so that what the apps and its assistants advise
 * fits it: its level, in the catalogue's words, the waves it surfs, from the smallest to the
 * biggest, on the scale its sessions say sizes on, how well it reads a forecast, and its boards.
 * The account alone reads it, and an assistant it signed in. An answer is null while it is not
 * given. A row is written when the account answers, or puts the questions off, and an account
 * with no row is asked them. Decision 063.
 */
export const surferProfile = pgTable("surfer_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  level: text("level").$type<SurferLevel>(),
  smallestWave: text("smallest_wave").$type<SurfSize>(),
  biggestWave: text("biggest_wave").$type<SurfSize>(),
  reading: text("reading").$type<ForecastReading>(),
  boards: text("boards").$type<BoardType>().array(),
  // When the account last answered, and when it put the questions off without answering.
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  putOffAt: timestamp("put_off_at", { withTimezone: true }),
});
