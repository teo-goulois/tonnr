import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { surfSession } from "./sessions";

// The photos and the videos an account sends, and the files of them the bucket keeps:
// decision 066.

/** The channel of Postgres the API wakes the worker on, once a file is in the bucket. */
export const MEDIA_CHANNEL = "media_uploaded";

/** Where a medium stands: sent for, in the bucket, made into what is shown, or refused. */
export const MEDIA_STATES = ["awaiting_upload", "uploaded", "ready", "failed"] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

/**
 * Why the worker made nothing of a file: it was not what it said, it was bigger or longer than a
 * medium may be, or it could not be read after three tries.
 */
export const MEDIA_FAILURES = [
  "unreadable",
  "too_large",
  "too_long",
  "changed",
  "gave_up",
] as const;
export type MediaFailure = (typeof MEDIA_FAILURES)[number];

/** One file the worker made of a medium, under its own key of the bucket. */
export type MediaFile = {
  key: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
};

/** The files of a medium, by what each is for. A photo has `display` and `thumb`. */
export type MediaFiles = Partial<Record<"thumb" | "display" | "poster" | "video", MediaFile>>;

/**
 * A photo or a video an account sends. It is sent for a purpose, then belongs to the session it
 * was given to, and goes with it. While it belongs to nothing it waits a day for the form it was
 * sent from, then goes. A row that goes leaves its keys in `media_trash`, which the database
 * writes itself, so that the worker deletes the files whichever way it went.
 */
export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"session" | "report">().notNull(),
    kind: text("kind").$type<"photo" | "video">().notNull(),
    state: text("state").$type<MediaState>().notNull().default("awaiting_upload"),
    sessionId: text("session_id").references(() => surfSession.id, { onDelete: "cascade" }),
    // Its place among the media of what it belongs to, from 0.
    position: smallint("position").notNull().default(0),
    // Where the browser sends the file, which nothing ever reads from but the worker, with what
    // the browser said of it and what the bucket said once it was there.
    uploadKey: text("upload_key").notNull(),
    uploadType: text("upload_type").notNull(),
    uploadBytes: bigint("upload_bytes", { mode: "number" }).notNull(),
    uploadEtag: text("upload_etag"),
    // What the worker made, and how much of the bucket it takes. Empty until it is ready.
    files: jsonb("files").$type<MediaFiles>().notNull().default({}),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    failure: text("failure").$type<MediaFailure>(),
    // The worker that took it, until when, and how many times one did.
    claim: text("claim"),
    claimedUntil: timestamp("claimed_until", { withTimezone: true }),
    attempts: smallint("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (table) => [
    index("media_userId_idx").on(table.userId),
    index("media_sessionId_idx").on(table.sessionId),
    // What waits for the worker, the oldest first.
    index("media_waiting_idx")
      .on(table.uploadedAt)
      .where(sql`${table.state} = 'uploaded'`),
    check("media_session_purpose", sql`${table.sessionId} is null or ${table.purpose} = 'session'`),
  ],
);

/**
 * Keys of the bucket that nothing keeps any more: written when a row of `media` is deleted, by
 * the database itself, and emptied by the worker once the bucket has deleted them.
 */
export const mediaTrash = pgTable("media_trash", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  keys: text("keys").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  attempts: smallint("attempts").notNull().default(0),
});

/**
 * Uploads stopped for every account: while the row is there, the API signs no upload, and what
 * is kept is still shown and deleted. An operator writes it and deletes it, and
 * `operator_action` says who. Decision 066.
 */
export const mediaPause = pgTable(
  "media_pause",
  {
    id: text("id").primaryKey().default("instance"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("media_pause_one_row", sql`${table.id} = 'instance'`)],
);

/**
 * How many files each account asked to send, by the hour: what its limit counts. A medium
 * deleted since still counts, so that deleting gives back nothing. The worker deletes what is two
 * days old. Decision 066.
 */
export const mediaSentHour = pgTable(
  "media_sent_hour",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    files: integer("files").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.hour] })],
);

/**
 * How much every account together asked to send, by day in UTC: the instance's budget, which a
 * request takes its share of in one statement, so that two at once never pass it together. The
 * worker deletes what is a week old. Decision 066.
 */
export const mediaSentDay = pgTable("media_sent_day", {
  day: date("day").primaryKey(),
  bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
});
