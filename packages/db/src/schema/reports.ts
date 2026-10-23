import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
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
    // When it was first shown, by its checks or by an operator: it never changes after. Null
    // for one never shown, and for one shown before decision 068, which nothing tells.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // When the worker told it to the accounts that keep its break, or decided not to: once,
    // whatever becomes of it later. Null until it is shown. Decision 068.
    announcedAt: timestamp("announced_at", { withTimezone: true }),
    // How many accounts it was told to, as it was told. Its author reads it.
    told: integer("told").default(0).notNull(),
    // How many browsers saw it, and opened one of its photos or videos, each counted once by
    // the browser itself: a number, and nothing of who. Its author reads them. Decision 068.
    views: integer("views").default(0).notNull(),
    opens: integer("opens").default(0).notNull(),
  },
  (table) => [
    index("surf_report_breakId_createdAt_idx").on(table.breakId, table.createdAt),
    index("surf_report_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("surf_report_state_createdAt_idx").on(table.state, table.createdAt),
  ],
);

/**
 * An account that said a report should not be shown, once, with why. Every account's flag is
 * kept and comes to an operator; only some hide a report. Decision 067.
 */
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
    // Whether it counts among the flags that hide a report: it was given by an account that had
    // a username and was a day old, as it gave it. Every flag before this column did.
    counts: boolean("counts").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // When the mail that tells the instance's address what was flagged named it: the worker's
    // `tell-moderation`. Null until then. A flag given before that mail existed is taken as told.
    toldAt: timestamp("told_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.userId] }),
    index("surf_report_flag_userId_idx").on(table.userId),
    // The flags that no mail named yet.
    index("surf_report_flag_untold_idx")
      .on(table.createdAt)
      .where(sql`${table.toldAt} is null`),
  ],
);

/**
 * When an account sent a report, and at which break: what its limits of an hour and of a day
 * count. A report deleted since still counts, so that deleting gives back nothing. The worker
 * deletes what is two days old.
 */
export const reportSent = pgTable(
  "report_sent",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The break's id as it was: the count outlives a break that goes.
    breakId: text("break_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (table) => [index("report_sent_userId_at_idx").on(table.userId, table.at)],
);

/**
 * Where the push of a notice stands: waiting for its hour; handed over, and not known to have
 * left, by a worker that stopped meanwhile, which is taken as told; taken by a browser; refused
 * by every one; held by the account's count for the day; given up once its reports were too
 * old, gone, or the account had no browser left; none at all for an account with no browser
 * when the notice began. Decision 068.
 */
export const NOTICE_PUSH_STATES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "held",
  "expired",
] as const;
export type NoticePushState = (typeof NOTICE_PUSH_STATES)[number];

/**
 * What an account was told of the reports at a break it keeps: one notice in three hours at a
 * break, which the reports shown meanwhile join. The web app lists it beside what the alerts
 * told, and the worker pushes it once. Decision 068.
 */
export const reportNotice = pgTable(
  "report_notice",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    breakId: text("break_id")
      .notNull()
      .references(() => surfBreak.id, { onDelete: "cascade" }),
    // When the notice began: a report shown within three hours of it joins it.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    // When the last report joined it.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    // Null until the account read it, and again when a report joins it.
    readAt: timestamp("read_at", { withTimezone: true }),
    // How many reports it told, those deleted since too.
    told: integer("told").default(1).notNull(),
    // Its push, null for an account that had no browser to push to when it began.
    pushState: text("push_state").$type<NoticePushState>(),
    // Not before, which quiet hours decide, and not after: its reports are too old by then.
    dueAt: timestamp("due_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // When its push was counted against the account's day: once, whatever becomes of it, so that
    // a push written anew is not counted again, and one that left is counted for good.
    countedAt: timestamp("counted_at", { withTimezone: true }),
    // When its push was handed over, and when it was settled.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("report_notice_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("report_notice_userId_breakId_createdAt_idx").on(
      table.userId,
      table.breakId,
      table.createdAt,
    ),
    index("report_notice_pushState_dueAt_idx").on(table.pushState, table.dueAt),
  ],
);

/** A report a notice told. It goes with the report, and the notice then says it was removed. */
export const reportNoticeReport = pgTable(
  "report_notice_report",
  {
    noticeId: text("notice_id")
      .notNull()
      .references(() => reportNotice.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => surfReport.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.noticeId, table.reportId] }),
    index("report_notice_report_reportId_idx").on(table.reportId),
  ],
);
