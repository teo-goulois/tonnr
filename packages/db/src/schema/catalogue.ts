import {
  bytea,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { type SpotCharacteristics, surfBreak } from "./spots";

// The breaks a list proposes to the catalogue, which an operator reads one at a time from the
// admin and adds, merges into a break, or leaves out: decision 049.

/**
 * What became of a candidate. It waits (`waiting`), or was put off to be read after the others
 * (`later`), until an operator adds it to the catalogue (`added`), merges it into a break that is
 * there already (`merged`), or leaves it out (`ignored`).
 */
export const CANDIDATE_STATES = ["waiting", "later", "added", "merged", "ignored"] as const;
// What whoever prepared the list proposes for a candidate.
export const CANDIDATE_ACTIONS = ["add", "merge", "hold"] as const;

/** What whoever prepared the list proposes, and why. */
export type CandidateProposal = {
  action: (typeof CANDIDATE_ACTIONS)[number];
  // The break of the catalogue to merge it into, for `merge`, or the one it may be, for `hold`.
  breakId?: string;
  // Other breaks of the catalogue it may be, which whoever prepared the list looked at.
  others?: string[];
  // The name to give the break, when it is not the list's.
  name?: string;
  // Why, in a few sentences.
  note?: string;
  // What is not sure.
  doubts?: string[];
};

/** A page that says something of the candidate, as whoever prepared the list read it. */
export type CandidateEvidence = { url: string; title?: string; note?: string };

/** A text of the list, for the operator to read: a description, the way in, what to watch for. */
export type CandidateText = { label: string; language?: string; text: string };

/**
 * A picture of the list's own, such as a page of a guide's map. `crop` and `mark` are boxes in
 * fractions of the picture, `[left, top, right, bottom]`: the part to show, and the place of the
 * break's label in it.
 */
export type CandidateFigure = {
  image: string;
  crop?: [number, number, number, number];
  mark?: [number, number, number, number];
  caption?: string;
};

/**
 * A break a list proposes to the catalogue. Its list and its reference name it, as a break of the
 * catalogue is named by the list it came from: what an operator decides of it is written in
 * `surf_break_listing`, and the list is not proposed again what was decided.
 */
export const breakCandidate = pgTable(
  "break_candidate",
  {
    id: text("id").primaryKey(),
    list: text("list").notNull(),
    ref: text("ref").notNull(),
    name: text("name").notNull(),
    // The places it lies in, from the widest to the nearest.
    location: text("location").array(),
    // Where the list, or whoever prepared it, puts it. Null when nobody knows yet.
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    // How that point was found, and the page that gives it.
    pointNote: text("point_note"),
    pointUrl: text("point_url"),
    // What the list says it is like, in the catalogue's words.
    characteristics: jsonb("characteristics").$type<SpotCharacteristics>(),
    proposal: jsonb("proposal").$type<CandidateProposal>(),
    evidence: jsonb("evidence").$type<CandidateEvidence[]>().default([]).notNull(),
    texts: jsonb("texts").$type<CandidateText[]>().default([]).notNull(),
    figures: jsonb("figures").$type<CandidateFigure[]>().default([]).notNull(),
    // What else the list says of it, as it gave it: kept aside with the break it becomes.
    details: jsonb("details").$type<Record<string, unknown>>(),
    status: text("status", { enum: CANDIDATE_STATES }).default("waiting").notNull(),
    // What the operator wrote of it, such as why it was left out.
    note: text("note"),
    // The break it became or was merged into. Null while it waits, and once that break is gone.
    breakId: text("break_id").references(() => surfBreak.id, { onDelete: "set null" }),
    // The operator who decided. Null once their account is deleted.
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // When the list last changed what it says of it, or an operator what became of it: what
    // decides of a candidate says which version it read.
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("break_candidate_list_ref_idx").on(table.list, table.ref),
    index("break_candidate_status_idx").on(table.status, table.list),
    index("break_candidate_breakId_idx").on(table.breakId),
  ],
);

/** A picture a list's candidates show, by the name they give it. */
export const breakCandidateImage = pgTable(
  "break_candidate_image",
  {
    list: text("list").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.list, table.name] })],
);
