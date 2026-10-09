import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * A worker process, which says here that it is there: when it started, when it was ready, and
 * when it was last seen. A row that stops moving is a worker that stopped. Several rows that
 * started minutes apart and never were ready are a worker that keeps failing to start.
 * Decision 022.
 */
export const workerProcess = pgTable("worker_process", {
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  // Null until every queue is scheduled.
  readyAt: timestamp("ready_at", { withTimezone: true }),
  // Written again every thirty seconds.
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
});

// How an attempt of a job ended. `degraded`: it ran to its end and some of its work failed.
// `expired`: it ended, or did not, past the time a run may take.
export const JOB_OUTCOMES = ["succeeded", "degraded", "failed", "expired"] as const;

// What failed, as far as the instance keeps it: the provider did not answer or answered with an
// error, its answer had changed shape, the database refused the write, the run took longer than
// a run may, the worker stopped under it, or anything else.
export const FAILURE_KINDS = [
  "provider",
  "format",
  "database",
  "expired",
  "stopped",
  "other",
] as const;

/**
 * What is kept of a failure. The error's own text is not: it can hold a line of a provider's
 * answer, an address with what it was asked, or a statement with its values.
 */
export type JobFailure = {
  kind: (typeof FAILURE_KINDS)[number];
  // What a provider answered, and from which host, when it answered with an error.
  status?: number;
  host?: string;
};

/**
 * A job of the worker and its last attempt. The row is written when an attempt starts and when
 * it ends, by that attempt alone: one that the scheduler gave up on changes nothing once
 * another has started. The worker adds its jobs when it starts, and a job when it runs, and
 * removes none: another version may be running beside it.
 */
export const job = pgTable("job", {
  // The queue's name, such as `ingest-ndbc`.
  name: text("name").primaryKey(),
  // A five-field cron expression, in UTC.
  schedule: text("schedule").notNull(),
  // The longest time the schedule leaves between two runs.
  everySeconds: integer("every_seconds").notNull(),
  // How long a run may take before the scheduler gives up on it.
  expiresSeconds: integer("expires_seconds").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),

  // The last attempt. Null until the job first runs.
  attemptId: text("attempt_id"),
  workerId: text("worker_id"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  // Null while the attempt runs, and until the next one when the worker stopped under it.
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  outcome: text("outcome", { enum: JOB_OUTCOMES }),
  // The numbers the job returns and logs, by name. Nothing of the data.
  counts: jsonb("counts").$type<Record<string, number>>(),
  failure: jsonb("failure").$type<JobFailure>(),

  // Kept across attempts: a job that fails now still says when it last worked.
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastFailure: jsonb("last_failure").$type<JobFailure>(),
  failuresInARow: integer("failures_in_a_row").default(0).notNull(),
});
