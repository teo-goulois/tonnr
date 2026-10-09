import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The last forecast fetched for a cell of 0.05°, kept where the API and the worker both find
 * it. A step is a twentieth of a degree. Decision 023.
 */
export const forecastCell = pgTable(
  "forecast_cell",
  {
    latStep: integer("lat_step").notNull(),
    lonStep: integer("lon_step").notNull(),
    // When the fetch that got it started, by the database's clock. Of two fetches of a cell,
    // the one that started later is kept.
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    // What the provider answered, as `packages/conditions` shapes it. That package checks it
    // when it reads it back: a row written by other code is not trusted.
    data: jsonb("data").$type<unknown>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.latStep, table.lonStep] }),
    // For the nightly job, which deletes the rows fetched long ago.
    index("forecast_cell_fetchedAt_idx").on(table.fetchedAt),
  ],
);

/**
 * What the instance let out and counted before it did: the requests it sent to a provider that
 * limits them, and the mails it sent. A bucket is a span of time and, for the forecasts' day,
 * the share of the program that asked: `day:people`, `day:alerts`, `hour`, `minute`. `start` is
 * when the span began, in UTC.
 */
export const providerCalls = pgTable(
  "provider_calls",
  {
    provider: text("provider").notNull(),
    bucket: text("bucket").notNull(),
    start: timestamp("start", { withTimezone: true }).notNull(),
    calls: integer("calls").notNull(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.bucket, table.start] })],
);
