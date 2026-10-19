import { LOCALES } from "@repo/config/locales";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { session, user } from "./auth";
import { type SpotCriteria, spot, surfBreak } from "./spots";

// Decision 031: an alert is an object of its own, set on one spot or on neighbours. Decision 064:
// a place of an alert is a spot of the account's own or a surf break of the catalogue.

/** A stretch of time as JSON keeps it: two moments, in ISO 8601. */
export type Stretch = { start: string; end: string };

/**
 * Open hours that were told at a spot, the looks in a row that found none of them since, and
 * the hours they were at the last look that found them, when a move too small to tell took
 * them from the told ones. `since` is kept of what push told: where the hours began when push
 * first told them, when they have moved since. It names the window from one push to the next.
 */
export type ToldStretch = Stretch & { missed: number; last?: Stretch; since?: string };

/** What the forecast and the tide give at a spot for one hour, as a notification keeps it. */
export type SeaFigures = {
  waveHeightMeters: number | null;
  wavePeakPeriodSeconds: number | null;
  waveDirectionDegrees: number | null;
  // The first swell apart from the wind sea, kept for an alert that asks about it and for no
  // other: what is told of such an alert says it. Decision 038.
  primarySwellHeightMeters?: number | null;
  primarySwellDirectionDegrees?: number | null;
  windSpeedMetersPerSecond: number | null;
  windDirectionDegrees: number | null;
  tideHeightMeters: number | null;
  tideTrend: "rising" | "falling" | null;
};

/** An hour of a sea window, as the look that saw it read it: when it begins, in ISO 8601. */
export type SeaHour = SeaFigures & { time: string };

/**
 * What a delivery that is leaving tells, kept with it until it has left: by spot, the hours
 * its way out has told once it has, the hours it has said to begin, and the deliveries it says
 * in the place of. It is written to the spots when the message is handed over. A worker that
 * stopped before leaves it here, and it is taken as told: the message may have left.
 */
export type DeliveryClaim = {
  // When it was written, in ISO 8601: a claim that is old was left behind.
  at: string;
  // The hours told, under the name of the way out that tells them: a mail's or a push's.
  mailed?: Record<string, ToldStretch[]>;
  pushed?: Record<string, ToldStretch[]>;
  begun?: Record<string, Stretch[]>;
  merged?: string[];
};

/** Hours of a day, in minutes since midnight: from the first to the one they end at. */
export type DayHours = { from: number; to: number }[];

export const ALERT_MOMENTS = ["found", "moved", "gone", "evening", "begins"] as const;
/**
 * What a device that is pushed to is: a browser, by the address its push service gave it, or the
 * app on an iPhone or an Android phone, by the token Apple or Google gave it. Decision 072.
 */
export const PUSH_KINDS = ["web", "ios", "android"] as const;
/** Which of Apple's two hosts takes the pushes of an iPhone's app: its build says. */
export const APNS_ENVIRONMENTS = ["development", "production"] as const;
export const DELIVERY_CHANNELS = ["mail", "push"] as const;
export const DELIVERY_STATES = [
  // Waiting for its hour, or for the worker.
  "pending",
  // Given to the way out, and not known to have left or not: the worker stopped meanwhile.
  // It is not tried again, since it may have left.
  "sending",
  "sent",
  // The way out refused it, or could not be reached.
  "failed",
  // Its hour passed while it waited: the window it spoke of is over, or gone.
  "expired",
  // Held back by the account's or the instance's limit of mails for the day, or by the
  // account's limit of pushes.
  "held",
] as const;

/**
 * The conditions that make one or several spots work, with a name. The worker looks at it every
 * three hours and tells its owner what it finds.
 */
export const alert = pgTable(
  "alert",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    criteria: jsonb("criteria").$type<SpotCriteria>().notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    // The shortest window worth telling, in minutes.
    shortestMinutes: integer("shortest_minutes").default(120).notNull(),
    // Counts the changes to what a look reads: the criteria, the spots, where a spot is, the
    // shortest window. A look made from an older count writes nothing.
    revision: integer("revision").default(0).notNull(),
    // When the last look was applied. The next comes some hours later, whoever runs it: two
    // looks that find a window are two forecasts, fetched apart. Null for an alert that was
    // never looked at, or that starts over.
    lookedAt: timestamp("looked_at", { withTimezone: true }),
    // The alert is paused until then, the end of the day its owner said "Not today" on: no hour
    // of it before then is open, as none of any alert is before the account's own `awayUntil`.
    // Null when it was never paused or the pause was lifted. A pause that is over keeps its
    // moment, which pauses nothing, and the API answers it as null. Decision 072.
    awayUntil: timestamp("away_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("alert_userId_idx").on(table.userId)],
);

/**
 * A place an alert is set on: a spot of the account's own, or a surf break of the catalogue
 * (decision 064). A place may be in several alerts, each with its own conditions: the place and
 * the alert are the key, and whatever reads or writes a row names both. `placeId` is the id of
 * whichever of the two it is, which the database writes: a spot's and a break's ids are UUIDs.
 */
export const alertSpot = pgTable(
  "alert_spot",
  {
    spotId: text("spot_id").references(() => spot.id, { onDelete: "cascade" }),
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .generatedAlwaysAs(sql`coalesce(spot_id, break_id)`)
      .notNull(),
    alertId: text("alert_id")
      .notNull()
      .references(() => alert.id, { onDelete: "cascade" }),
    // Its place among the alert's spots: they are listed in the order they were added.
    position: integer("position").notNull(),
    // When a fresh forecast was last read at the spot for its alert. Between two looks, a
    // window is believed only as long as this is recent.
    lookedAt: timestamp("looked_at", { withTimezone: true }),
    // The open hours that were told at the spot and are not over, piece by piece. What a look
    // finds is held against them: no procedure of the API reads them.
    told: jsonb("told").$type<ToldStretch[]>().default([]).notNull(),
    // What cut the open hours at the last look: the account's hours, daylight, absence and zone,
    // and the alert's shortest window. A look that finds it changed brings what was told in
    // line with the hours as they are now, and says nothing of the difference.
    cutBy: text("cut_by"),
    // The open hours that were said to begin, and are not over.
    begun: jsonb("begun").$type<Stretch[]>().default([]).notNull(),
    // The open hours that a mail told at the spot and are not over. A mail may leave long
    // after a look, or not at all, so what mail said is kept apart from what the list said:
    // a mail says how `told` differs from it.
    mailed: jsonb("mailed").$type<ToldStretch[]>().default([]).notNull(),
    // The open hours that a mail said to begin, and are not over.
    mailBegun: jsonb("mail_begun").$type<Stretch[]>().default([]).notNull(),
    // The same two for push: each way out keeps what it told, since each leaves at its own time.
    pushed: jsonb("pushed").$type<ToldStretch[]>().default([]).notNull(),
    pushBegun: jsonb("push_begun").$type<Stretch[]>().default([]).notNull(),
    // When the forecast that the last look read at the spot was fetched.
    forecastFetchedAt: timestamp("forecast_fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.alertId] }),
    index("alert_spot_alertId_idx").on(table.alertId),
    index("alert_spot_breakId_idx").on(table.breakId),
    check("alert_spot_one_place", sql`(${table.spotId} is null) <> (${table.breakId} is null)`),
  ],
);

/**
 * How an account wants to be told, for all its alerts. An account without a row has the
 * defaults, which the columns give.
 */
export const alertSettings = pgTable("alert_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // How many days ahead a window may be told.
  horizonDays: integer("horizon_days").default(3).notNull(),
  // The IANA name of the account's time zone. Null until it is known: UTC then.
  zone: text("zone"),
  // The language of what is sent. Null until it is known: English then.
  locale: text("locale", { enum: LOCALES }),
  // The moments, each of which can be switched off.
  onFound: boolean("on_found").default(true).notNull(),
  onEvening: boolean("on_evening").default(true).notNull(),
  // The hour of the evening message, in minutes since midnight.
  eveningMinutes: integer("evening_minutes")
    .default(19 * 60)
    .notNull(),
  onChange: boolean("on_change").default(true).notNull(),
  onBegin: boolean("on_begin").default(true).notNull(),
  // Whether the reports at the breaks the account keeps are told to it: decision 068.
  onReports: boolean("on_reports").default(true).notNull(),
  // How long before a window begins "it is on" is told, in minutes.
  noticeMinutes: integer("notice_minutes").default(0).notNull(),
  daylightOnly: boolean("daylight_only").default(true).notNull(),
  // The account's hours for each day of the week, Monday first. Null for any hour.
  week: jsonb("week").$type<DayHours[]>(),
  // The account is away until then: no hour before it is open, and so none is told.
  awayUntil: timestamp("away_until", { withTimezone: true }),
  // The hours in which nothing is sent, in minutes since midnight. Both null for none.
  quietFrom: integer("quiet_from").default(22 * 60),
  quietTo: integer("quiet_to").default(7 * 60),
  // Whether alerts are mailed. Null until the account was asked, with its first alert.
  byMail: boolean("by_mail"),
  // Whether a mail's subject names the alert and its spots.
  namesInSubject: boolean("names_in_subject").default(true).notNull(),
  byPush: boolean("by_push").default(false).notNull(),
  // The end of the day the last evening message listed, so that a day gets one, whatever
  // becomes of the account's time zone meanwhile.
  eveningUntil: timestamp("evening_until", { withTimezone: true }),
  // Read by nothing: `mailKey` took its place before any mail was sent. A later release drops
  // it, as decision 009 asks of a column that a running version may still name.
  mailTokenHash: text("mail_token_hash"),
  // What a mail's link switches alert mails off with: a key made when mail is switched on, and
  // made anew each time it is switched on again, so that an old mail's link stops working. It
  // is kept as it is: the worker writes it into each mail, and it opens nothing but that.
  mailKey: text("mail_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/**
 * What the worker remembers of a sea window from one look to the next: a run of hours in which
 * an alert's conditions are met at one of its places. A look replaces those of the places it
 * read a fresh forecast for. No procedure of the API writes it. Its place is named as
 * `alert_spot` names one.
 */
export const alertWindow = pgTable(
  "alert_window",
  {
    alertId: text("alert_id")
      .notNull()
      .references(() => alert.id, { onDelete: "cascade" }),
    spotId: text("spot_id").references(() => spot.id, { onDelete: "cascade" }),
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .generatedAlwaysAs(sql`coalesce(spot_id, break_id)`)
      .notNull(),
    // The sea window as the last look saw it.
    seaStart: timestamp("sea_start", { withTimezone: true }).notNull(),
    seaEnd: timestamp("sea_end", { withTimezone: true }).notNull(),
    // The looks in a row that found it.
    seen: integer("seen").default(1).notNull(),
    // Its hours that are not over, as the last look read them: what a message says of the sea
    // when open hours begin, or the evening before, without reading a forecast again.
    hours: jsonb("hours").$type<SeaHour[]>().default([]).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.alertId, table.seaStart] }),
    index("alert_window_alertId_idx").on(table.alertId),
    check("alert_window_one_place", sql`(${table.spotId} is null) <> (${table.breakId} is null)`),
  ],
);

/** What a notification said, as it said it. It is never changed afterwards. */
export type NotificationPayload = {
  // The alert's name then. Null for the evening before, which lists every alert.
  alertName: string | null;
  // The time zone its hours were worked out in.
  zone: string;
  // For the evening before: the day it lists.
  day?: string;
  lines: {
    // The id of the line's place, and its name: a spot of the account's, or the break of the
    // catalogue `breakId` names, whose id it then is. Decision 064.
    spotId: string;
    spotName: string;
    breakId?: string;
    // When the forecast the spot was read on was fetched.
    forecastFetchedAt?: string;
    // For the evening before: the alert the spot is in, and its name then.
    alertId?: string;
    alertName?: string;
    // The window's open hours. None for a window that is gone.
    open: Stretch[];
    // For a window that moved or went: its open hours as they had been told.
    before?: Stretch[];
    // What the forecast gave for the first of the open hours.
    sea?: SeaFigures;
    // For a window that begins: what the nearest buoy last read. Null far from any.
    buoy?: {
      stationId: string;
      name: string;
      distanceKm: number;
      observedAt: string;
      significantHeightMeters: number | null;
      peakPeriodSeconds: number | null;
      peakDirectionDegrees: number | null;
      // Who the station's readings are credited to.
      attribution?: string;
    } | null;
  }[];
};

/**
 * What an account was told: one moment of one alert, or its evening before. A moment is told
 * once: its key is what makes it that moment and no other.
 */
export const notification = pgTable(
  "alert_notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The alert it is of. Null for the evening before, and once the alert is deleted.
    alertId: text("alert_id").references(() => alert.id, { onDelete: "set null" }),
    moment: text("moment", { enum: ALERT_MOMENTS }).notNull(),
    key: text("key").notNull().unique(),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("alert_notification_userId_createdAt_idx").on(table.userId, table.createdAt)],
);

/** A notification on its way out by one channel: when it may leave, and what became of it. */
export const notificationDelivery = pgTable(
  "alert_delivery",
  {
    notificationId: text("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: DELIVERY_CHANNELS }).notNull(),
    state: text("state", { enum: DELIVERY_STATES }).default("pending").notNull(),
    // Not before, which quiet hours decide, and not after: the window is over by then.
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // When it was sent, or given up.
    settledAt: timestamp("settled_at", { withTimezone: true }),
    // What it tells, while it is leaving.
    claim: jsonb("claim").$type<DeliveryClaim>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.notificationId, table.channel] }),
    index("alert_delivery_state_dueAt_idx").on(table.state, table.dueAt),
  ],
);

/**
 * A device that asked to be sent an account's alerts: a browser, with what its push service gave
 * it, or the app on a phone, with the token Apple or Google gave it (decision 072). The address
 * and the token are capabilities, since whoever holds one can send to that device: neither is
 * ever logged, and the API never gives them back. An account that has one is told by push.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // A browser, or the app on an iPhone or an Android phone. The check below holds the shape
    // of each.
    kind: text("kind", { enum: PUSH_KINDS }).default("web").notNull(),
    // Where a browser's push service takes a message for it. A browser has one, and it goes
    // with whoever is signed in there: an account that subscribes takes it from the one before.
    // Null for a phone.
    endpoint: text("endpoint").unique(),
    // The token APNs or FCM gave the app on a phone, which its pushes are sent to. It goes with
    // whoever is signed in there, as a browser's address does. Null for a browser.
    token: text("token").unique(),
    // For an iPhone, which of Apple's hosts its build is pushed through. Null otherwise.
    environment: text("environment", { enum: APNS_ENVIRONMENTS }),
    // The bundle or the package the phone's app was built with: what its pushes are sent under.
    // Null for a browser.
    appId: text("app_id"),
    // The device's public key and its secret, in base64url: what a message is encrypted with. An
    // app makes its own pair, as a browser does, and keeps the private key on the phone.
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // What the device calls itself, for the account to tell its devices apart: a browser's
    // name, a phone's model. Null when it did not say.
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // When the browser last said that it still holds this subscription.
    seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
    // The session of the browser, as it was when it subscribed or last said so again. A device
    // goes with it: when its account signs out there, or when the session is closed for it.
    // Signing out is then all it takes to forget a browser, whatever the browser itself does.
    sessionId: text("session_id").references(() => session.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("push_subscription_userId_idx").on(table.userId),
    index("push_subscription_sessionId_idx").on(table.sessionId),
    // A browser has its address and nothing of an app's. A phone has its token and its app,
    // and no address, and an iPhone the host its build is pushed through. Each part is true or
    // false, never null, which a check would take.
    check(
      "push_subscription_kind_shape",
      sql`(${table.kind} = 'web' and ${table.endpoint} is not null and ${table.token} is null and ${table.environment} is null and ${table.appId} is null)
        or (${table.kind} = 'ios' and ${table.endpoint} is null and ${table.token} is not null and ${table.environment} is not null and ${table.environment} in ('development', 'production') and ${table.appId} is not null)
        or (${table.kind} = 'android' and ${table.endpoint} is null and ${table.token} is not null and ${table.environment} is null and ${table.appId} is not null)`,
    ),
  ],
);
