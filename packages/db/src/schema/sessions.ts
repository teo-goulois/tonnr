import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { spot, surfBreak } from "./spots";

// An account's log of its sessions: decision 043.

/**
 * How big the waves looked, said against a surfer standing beside them, the smallest first.
 * `packages/conditions/src/sessions/sizes.ts` says what height of face each one stands for.
 */
export const SURF_SIZES = [
  "ankle",
  "knee",
  "waist",
  "chest",
  "shoulder",
  "head",
  "overhead",
  "double_overhead",
  "triple_overhead",
] as const;
export type SurfSize = (typeof SURF_SIZES)[number];

/** One hour of the models over a session. Null is a value they did not give. */
export type SessionHour = {
  time: string;
  waveHeightMeters: number | null;
  wavePeriodSeconds: number | null;
  wavePeakPeriodSeconds: number | null;
  waveDirectionDegrees: number | null;
  primarySwellHeightMeters: number | null;
  primarySwellDirectionDegrees: number | null;
  windSpeedMetersPerSecond: number | null;
  windGustMetersPerSecond: number | null;
  windDirectionDegrees: number | null;
  cloudCoverPercent: number | null;
  precipitationMillimeters: number | null;
  airTemperatureCelsius: number | null;
};

/** What a station measured at a moment of a session. Null is what it did not measure. */
export type SessionReading = {
  observedAt: string;
  significantHeightMeters: number | null;
  maxHeightMeters: number | null;
  peakPeriodSeconds: number | null;
  meanPeriodSeconds: number | null;
  peakDirectionDegrees: number | null;
  waterTemperatureCelsius: number | null;
  windSpeedMetersPerSecond: number | null;
  windGustMetersPerSecond: number | null;
  windDirectionDegrees: number | null;
};

/** A station near a session's place, and what it measured while the session lasted. */
export type SessionStation = {
  stationId: string;
  name: string;
  distanceKm: number;
  attribution: string;
  readings: SessionReading[];
};

/**
 * What the sea did while a session lasted, kept as it was read: every part of it is a copy, and
 * none follows what it was read from. A part is null when nothing could give it.
 */
export type SessionConditions = {
  // What the models last computed of the session's hours, from the hour its start falls in to
  // the one its end falls in, with the models that answered.
  model: {
    point: { latitude: number; longitude: number };
    waveModels: string[];
    swellModels: string[];
    hours: SessionHour[];
  } | null;
  // Why the models gave nothing: the point has no sea nearby, the session is further back than
  // they are asked, or they could not be asked then, which another try may mend.
  modelMissing: "no_sea" | "too_old" | "unavailable" | null;
  // The tide where it is predicted nearest: its height over the session, and the high and the
  // low around it.
  tide: {
    station: { id: string; name: string; distanceKm: number };
    datum: string;
    heights: { time: string; heightMeters: number }[];
    extremes: { time: string; type: "high" | "low"; heightMeters: number }[];
  } | null;
  // The nearest buoy the sea reaches freely, and the nearest station that measured the wind.
  buoy: SessionStation | null;
  wind: SessionStation | null;
  // Where the wind comes from when it blows off the shore at the place, as it was said then.
  offshoreDirectionDegrees: number | null;
};

/**
 * A session an account surfed. It is at a break of the catalogue or at a spot of the account's
 * own, and keeps the name and the point as its own: it lives on when the place goes.
 */
export const surfSession = pgTable(
  "surf_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // One of the two names the place while it is there.
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "set null" }),
    spotId: text("spot_id").references(() => spot.id, { onDelete: "set null" }),
    placeName: text("place_name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    // From half a star to five, by halves. Null for a session that is not rated.
    rating: real("rating"),
    note: text("note"),
    // How big most of the waves looked, and the biggest of the sets, as the surfer said. Each is
    // null until it is said, and the sets are never smaller than the waves.
    waveSize: text("wave_size").$type<SurfSize>(),
    setSize: text("set_size").$type<SurfSize>(),
    // Null until it is taken.
    conditions: jsonb("conditions").$type<SessionConditions>(),
    conditionsTakenAt: timestamp("conditions_taken_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("surf_session_userId_startedAt_idx").on(table.userId, table.startedAt),
    index("surf_session_breakId_idx").on(table.breakId),
    index("surf_session_spotId_idx").on(table.spotId),
  ],
);
