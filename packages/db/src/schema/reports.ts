import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import type { SessionHour, SurfSize } from "./sessions";
import { surfBreak } from "./spots";

// What accounts show of the waves at a break as they are now: photos and videos, checked to have
// been taken there lately and to show the sea. Decision 067.

/**
 * Where a report stands: being checked; shown; left to an operator, who shows it or not; refused
 * by its checks; hidden by the flags of accounts until an operator decides; removed by one.
 */
export const REPORT_STATES = [
  "checking",
  "published",
  "review",
  "refused",
  "hidden",
  "removed",
] as const;
export type ReportState = (typeof REPORT_STATES)[number];

/** Why a photo or a video of a report is not shown. */
export const REPORT_REASONS = [
  // Neither the file nor the phone said where it was.
  "no_position",
  // It was taken further from the break than a report may be.
  "too_far",
  // The phone said where it was, too roughly to tell.
  "imprecise",
  // The file says where but not when.
  "no_time",
  // It was taken longer ago than a report may be.
  "too_old",
  // Its camera's clock says it was taken after it was sent.
  "ahead",
  // What it shows is not the sea, a wave or a beach.
  "not_sea",
  // It shows nudity.
  "nudity",
  // The analysis could not tell: an operator decides.
  "unsure",
  // The file could not be made: no photo or video, too big, too long.
  "unreadable",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type Point = { latitude: number; longitude: number };

/** Where a medium was taken, as far as it was told, and what that comes to. */
export type PositionCheck = {
  source: "file" | "device" | null;
  // How far from the break, to a hundred metres within the radius and to the kilometre beyond.
  distanceKm: number | null;
  // How precise the phone said its position was, in metres, when it is the phone's.
  accuracyM: number | null;
  // The point itself, kept only within the radius: a refused report does not keep where
  // someone was.
  point: Point | null;
  reason: "no_position" | "too_far" | "imprecise" | null;
};

/** When a medium was taken, as far as it was told, and what that comes to. */
export type TimeCheck = {
  // The GPS's time, the camera's with its offset, the camera's alone read at the browser's
  // offset, a video's own, or the time it was sent, for a file the phone's browser stripped.
  source: "gps" | "offset" | "local" | "video" | "sent" | null;
  takenAt: string | null;
  // How long before it was sent. Negative for a clock that runs ahead.
  ageMinutes: number | null;
  reason: "no_time" | "too_old" | "ahead" | null;
};

/** What the analysis of a medium's images said: the worst of its frames. */
export type Analysis = {
  // How sure it is that the image shows the sea, a wave or a beach, from 0 to 1.
  sea: number;
  // How sure it is that the image shows nudity, from 0 to 1.
  nudity: number;
  // How many images were looked at: one for a photo, three for a video.
  frames: number;
  // What it saw most, with how sure, for an operator to read.
  top: { label: string; score: number }[];
};

/** Everything that was checked of a medium of a report, as the admin reads it. */
export type MediaChecks = {
  position: PositionCheck;
  time: TimeCheck;
  analysis: Analysis | null;
  verdict: "passed" | "refused" | "review";
  reasons: ReportReason[];
};

/**
 * A report at a break of the catalogue: the waves there now, as an account saw them, in one to
 * four photos and videos, with how big they looked and a few words. It goes with its account
 * and with its break.
 */
export const surfReport = pgTable(
  "surf_report",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    breakId: text("break_id")
      .notNull()
      .references(() => surfBreak.id, { onDelete: "cascade" }),
    state: text("state").$type<ReportState>().notNull().default("checking"),
    waveSize: text("wave_size").$type<SurfSize>(),
    setSize: text("set_size").$type<SurfSize>(),
    note: text("note"),
    // Where the phone said it stood as the report was sent, with how precise it said that was:
    // what places a photo the phone's browser stripped. Cleared once checked, unless it was
    // within the radius.
    deviceLatitude: doublePrecision("device_latitude"),
    deviceLongitude: doublePrecision("device_longitude"),
    deviceAccuracyM: real("device_accuracy_m"),
    // The browser's offset from UTC, in minutes, which reads a camera's time that says no offset.
    offsetMinutes: smallint("offset_minutes"),
    // What the models said of the sea at the break in the hour it was sent, kept to set a report
    // beside the forecast later. Null when none was kept.
    forecast: jsonb("forecast").$type<SessionHour>(),
    // The version of the terms its author accepted as it was sent.
    terms: text("terms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    // What an operator last decided of it, and when. Flags before `restoredAt` no longer count.
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
  },
  (table) => [
    index("surf_report_breakId_createdAt_idx").on(table.breakId, table.createdAt),
    index("surf_report_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("surf_report_state_createdAt_idx").on(table.state, table.createdAt),
  ],
);

/** An account that said a report should not be shown, once, with why. */
export const surfReportFlag = pgTable(
  "surf_report_flag",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => surfReport.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").$type<"not_here" | "not_now" | "not_sea" | "offensive" | "other">(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.userId] }),
    index("surf_report_flag_userId_idx").on(table.userId),
  ],
);
