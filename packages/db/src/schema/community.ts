import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { ABILITY_LEVELS, surfBreak } from "./spots";

// What accounts write of a break of the catalogue, for its guide: decision 041.

// The lines of a guide that are said in the catalogue's words: each is a column of `surf_break`,
// and takes the words of that column.
export const GUIDE_WORD_LINES = [
  "breakTypes",
  "waveDirections",
  "bottomTypes",
  "boardTypes",
  "bestSeasons",
  "bestTides",
  "bestSwellDirections",
  "bestWindDirections",
] as const;
// The lines that are a short text: how to get there, where to enter the water, what to watch
// for, and what the place asks of whoever surfs it.
export const GUIDE_TEXT_LINES = ["access", "entry", "hazards", "rules"] as const;
// The break itself, its name and its point: written when an operator accepts a spot into the
// catalogue (decision 034), and never proposed.
export const GUIDE_PLACE_LINE = "place";
export const CONTRIBUTION_LINES = [
  ...GUIDE_WORD_LINES,
  ...GUIDE_TEXT_LINES,
  GUIDE_PLACE_LINE,
] as const;

/**
 * What became of a contribution. It waits for someone to read it (`pending`), or shows at once
 * as waiting to be confirmed (`shown`), then is `confirmed` or `refused`. Its author takes it
 * back, or writes another in its place, while it waits (`withdrawn`). A `shown` one that another
 * was confirmed over, on the same line, is `superseded`.
 */
export const CONTRIBUTION_STATES = [
  "pending",
  "shown",
  "confirmed",
  "refused",
  "withdrawn",
  "superseded",
] as const;

// The languages a text of a guide is written in: those of the web app.
export const GUIDE_LANGUAGES = ["en", "fr"] as const;

// The terms an account gives a contribution under. A list of words enters the database under
// the Open Database License, as a break made of a spot does. A text is a work of its own: the
// Database Contents License is the one that goes with the first for what a database holds.
export const CONTRIBUTION_LICENSES = ["ODbL-1.0", "DbCL-1.0"] as const;

/**
 * One thing an account wrote of a break: a line of its guide, with the value it gives it. A row
 * is never changed in what it says: an account that changes its mind writes another, and this
 * one is closed. The guide shows the latest confirmed row of each line, over what the catalogue
 * holds from the list the break came from.
 */
export const breakContribution = pgTable(
  "break_contribution",
  {
    id: text("id").primaryKey(),
    // Null once the break has left the catalogue: the row stays, and still counts for whoever
    // wrote it.
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "set null" }),
    // The break it was written of, by the id it had: kept once the break has left the
    // catalogue, so that a line of a break still counts once for whoever wrote it several times.
    // For `place`, the break that the spot became.
    breakRef: text("break_ref").notNull(),
    // Null once the account is deleted: what it wrote stays, and names nobody.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    line: text("line", { enum: CONTRIBUTION_LINES }).notNull(),
    // The words of a line of words, in the order of their vocabulary and each once. The text of
    // a line of text. The name of the break for `place`.
    value: jsonb("value").$type<string[] | string>().notNull(),
    // The language a text is written in. Null for a line that is not a text.
    language: text("language", { enum: GUIDE_LANGUAGES }),
    status: text("status", { enum: CONTRIBUTION_STATES }).default("pending").notNull(),
    // The terms the account agreed to when it sent this.
    license: text("license", { enum: CONTRIBUTION_LICENSES }).notNull(),
    // Why it was refused, as its author reads it.
    reason: text("reason"),
    // The operator who accepted or refused it. Null for one that the accounts that keep the
    // break confirmed, and once the operator's account is deleted.
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Since when it shows as waiting to be confirmed. Null for one that never did.
    shownAt: timestamp("shown_at", { withTimezone: true }),
    // Since when it is confirmed: the latest of a line is what the guide says.
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // What a guide says of a line: its latest confirmed row.
    index("break_contribution_guide_idx")
      .on(table.breakId, table.line, table.confirmedAt)
      .where(sql`${table.status} = 'confirmed'`),
    // What a guide shows as waiting to be confirmed.
    index("break_contribution_shown_idx")
      .on(table.breakId, table.shownAt)
      .where(sql`${table.status} = 'shown'`),
    index("break_contribution_userId_createdAt_idx").on(table.userId, table.createdAt),
    index("break_contribution_status_createdAt_idx").on(table.status, table.createdAt),
    // An account has one contribution waiting on a line of a break at a time.
    uniqueIndex("break_contribution_waiting_idx")
      .on(table.userId, table.breakId, table.line)
      .where(sql`${table.status} in ('pending', 'shown')`),
  ],
);

// What an account that keeps a break says of a contribution to it.
export const CONTRIBUTION_VERDICTS = ["confirm", "contest"] as const;

/**
 * An account that keeps a break says that a contribution to it is right, or contests it with a
 * reason, which comes to the operator. An account says one thing of a contribution. Who said
 * what is never answered to another account: it would tell which breaks an account keeps.
 */
export const contributionVerdict = pgTable(
  "contribution_verdict",
  {
    contributionId: text("contribution_id")
      .notNull()
      .references(() => breakContribution.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verdict: text("verdict", { enum: CONTRIBUTION_VERDICTS }).notNull(),
    // Why it is contested, as the operator reads it. Null for a confirmation.
    reason: text("reason"),
    // When an operator read a contest and left the contribution as it is. Null for a contest
    // that waits, and for a confirmation.
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.contributionId, table.userId] }),
    index("contribution_verdict_userId_createdAt_idx").on(table.userId, table.createdAt),
    // The contests an operator has still to read.
    index("contribution_verdict_waiting_idx")
      .on(table.createdAt)
      .where(sql`${table.verdict} = 'contest' and ${table.dismissedAt} is null`),
  ],
);

// What is asked of every account that knows a break, since it is not one account's to state:
// how many people surf it, how they take a visitor, and the level it asks.
export const GUIDE_QUESTIONS = ["crowd", "locals", "level"] as const;
export const CROWD_ANSWERS = ["quiet", "shared", "busy", "packed"] as const;
export const LOCALS_ANSWERS = ["friendly", "reserved", "heavy"] as const;
// The words each question is answered in. The level is said in the catalogue's.
export const GUIDE_ANSWERS = {
  crowd: CROWD_ANSWERS,
  locals: LOCALS_ANSWERS,
  level: ABILITY_LEVELS,
} as const;

/**
 * What one account answers to one of the questions about a break. It answers each once, and
 * changes its answer in place: the guide shows how the answers spread, and never whose they are.
 */
export const breakAnswer = pgTable(
  "break_answer",
  {
    breakId: text("break_id")
      .notNull()
      .references(() => surfBreak.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    question: text("question", { enum: GUIDE_QUESTIONS }).notNull(),
    answer: text("answer").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.breakId, table.userId, table.question] }),
    index("break_answer_userId_idx").on(table.userId),
  ],
);

// The ranks, from the first an account reaches. They carry the names of surfing's tours.
export const RANKS = ["qs", "cs", "ct"] as const;

/**
 * A rank an account reached, and when. The score is computed from the contributions and kept
 * nowhere, and may go down when one of them is refused later: a rank that was reached stays.
 */
export const rankAward = pgTable(
  "rank_award",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rank: text("rank", { enum: RANKS }).notNull(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.rank] })],
);

/**
 * The link an account gives to whoever it wants as a friend. An account made through it has
 * the link's owner as its sponsor, and the two are friends. An account that exists already and
 * opens it becomes a friend. A link is one account's, and the account gives itself a new one
 * when it likes: the one before then opens nothing.
 */
export const accountLink = pgTable("account_link", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // What the link ends with: sixteen random bytes, kept as they are so that the account copies
  // its link again.
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Two accounts that are friends: each reads the other's username, rank and contributions, and
 * nothing else of it. One row for the two, the account whose id sorts first in `userId`.
 */
export const friendship = pgTable(
  "friendship",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    friendId: text("friend_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Which of the two ended it, and when. The row stays: the other does not make it again by
    // a link it still holds. Whoever ended it makes it again by opening the other's link.
    endedBy: text("ended_by"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.friendId] }),
    index("friendship_friendId_idx").on(table.friendId),
    // Compared byte by byte, as `pairOf` sorts them: the order of the database's own collation
    // is another, and would refuse half of the pairs.
    check("friendship_order", sql`${table.userId} collate "C" < ${table.friendId} collate "C"`),
  ],
);

/**
 * An account that was made through another's link: the other is its sponsor. It counts for the
 * sponsor once the account has a contribution confirmed. An account has one sponsor, for good.
 */
export const sponsorship = pgTable(
  "sponsorship",
  {
    sponsoredId: text("sponsored_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    // Null once the sponsor's account is deleted: the row stays, so that the account is not
    // sponsored a second time.
    sponsorId: text("sponsor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sponsorship_sponsorId_idx").on(table.sponsorId)],
);
