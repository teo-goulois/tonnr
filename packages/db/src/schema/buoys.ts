import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const station = pgTable(
  "station",
  {
    // "<provider>-<id at the provider>", for example "ndbc-44025".
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerStationId: text("provider_station_id").notNull(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    licenseType: text("license_type").notNull(),
    licenseUrl: text("license_url").notNull(),
    attribution: text("attribution").notNull(),
    // Null when the owner's terms have not been checked.
    commercialUse: boolean("commercial_use"),
    // Set once the station has sent that kind of measurement, and kept afterwards.
    reportsWaves: boolean("reports_waves").default(false).notNull(),
    reportsWind: boolean("reports_wind").default(false).notNull(),
    latestObservedAt: timestamp("latest_observed_at", { withTimezone: true }),
    // Whether the open sea reaches the station, worked out from its waves and its neighbours'.
    // Null until rough days have told.
    exposure: text("exposure").$type<"open" | "sheltered">(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("station_provider_stationId_idx").on(table.provider, table.providerStationId),
    index("station_position_idx").on(table.latitude, table.longitude),
  ],
);

// Providers publish different wave periods, so each one has its own column.
export const reading = pgTable(
  "reading",
  {
    stationId: text("station_id")
      .notNull()
      .references(() => station.id, { onDelete: "cascade" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    significantHeightM: real("significant_height_m"),
    maxHeightM: real("max_height_m"),
    peakPeriodS: real("peak_period_s"),
    meanPeriodS: real("mean_period_s"),
    significantPeriodS: real("significant_period_s"),
    peakDirectionDeg: real("peak_direction_deg"),
    directionalSpreadDeg: real("directional_spread_deg"),
    waterTemperatureC: real("water_temperature_c"),
    windSpeedMs: real("wind_speed_ms"),
    windGustMs: real("wind_gust_ms"),
    windDirectionDeg: real("wind_direction_deg"),
    // False for a real-time value the provider has not quality-checked yet.
    validated: boolean("validated").default(false).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.stationId, table.observedAt] }),
    index("reading_observedAt_idx").on(table.observedAt),
  ],
);
