import { station } from "@repo/db/schema/buoys";
import {
  FAILURE_KINDS,
  job,
  JOB_OUTCOMES,
  type JobFailure,
  workerProcess,
} from "@repo/db/schema/instance";
import { asc, count, desc, gt, max, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

const MINUTE_MS = 60 * 1000;
// A worker that was seen within this time runs: it says it is there every thirty seconds.
const SEEN_WITHIN_S = 2 * 60;
// The worker processes shown: those seen in the last day, and fifty at most.
const SHOWN_HOURS = 24;
const SHOWN_PROCESSES = 50;
// When a reading leaves the map. It is no provider's rhythm: one that publishes a day late has
// no station under six hours and works as it should.
const RECENT_HOURS = 6;

const failureSchema = z.object({
  kind: z.enum(FAILURE_KINDS),
  // What a provider answered, and from which host, when it answered with an error.
  status: z.number().optional(),
  host: z.string().optional(),
});

// Where a job is: `waiting` for its first run, `running`, how its last attempt ended, or `late`
// when no attempt started for longer than its schedule leaves between two runs.
const JOB_STATES = ["waiting", "running", ...JOB_OUTCOMES, "late"] as const;

type JobRow = typeof job.$inferSelect;

/**
 * A job is late when nothing started for the time its schedule leaves between two runs and a
 * tenth of it more, ten minutes at least. Otherwise it is where its last attempt is: one that
 * has not ended runs, until its deadline, and has expired after it.
 */
export function jobState(row: JobRow, now: Date): (typeof JOB_STATES)[number] {
  const every = row.everySeconds * 1000;
  const allowed = every + Math.max(10 * MINUTE_MS, every / 10);
  const since = row.startedAt ?? row.firstSeenAt;
  if (now.getTime() - since.getTime() > allowed) return "late";

  if (!row.startedAt) return "waiting";
  if (row.outcome) return row.outcome;
  return row.deadlineAt && now > row.deadlineAt ? "expired" : "running";
}

const EXPIRED: JobFailure = { kind: "expired" };

// A newer worker may write a kind of failure that this API does not know yet. It is given as
// `other` rather than refused: the two programs are not always deployed together.
function known(failure: JobFailure | null): JobFailure | null {
  if (!failure) return null;
  return FAILURE_KINDS.includes(failure.kind) ? failure : { kind: "other" };
}

/**
 * A job as the route gives it. An attempt that passed its deadline without an end is a failure
 * that nothing wrote: the worker counts it when the next attempt starts, and until then it is
 * counted here.
 */
export function describeJob(row: JobRow, now: Date) {
  const state = jobState(row, now);
  const isLost = !row.outcome && !!row.deadlineAt && now > row.deadlineAt;
  return {
    name: row.name,
    schedule: row.schedule,
    everySeconds: row.everySeconds,
    state,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    counts: row.counts,
    failure: isLost ? EXPIRED : known(row.failure),
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: isLost ? row.deadlineAt : row.lastFailureAt,
    lastFailure: isLost ? EXPIRED : known(row.lastFailure),
    failuresInARow: row.failuresInARow + (isLost ? 1 : 0),
  };
}

export const instanceRouter = {
  state: adminProcedure
    .route({
      method: "GET",
      path: "/instance",
      summary: "The state of the instance: its worker, its jobs, its providers, and this API",
      description:
        `${ADMIN_ONLY} The worker writes what it does and this reads it: decision 022. A job ` +
        "is `late` when no attempt of it started for longer than its schedule leaves between " +
        "two runs. What failed is given as a kind, never as the error's text: `expired` for a " +
        "run that took longer than a run may, `stopped` for one whose worker stopped under it. " +
        "`api` is the process that answered this call, which may be one of several.",
      tags: ["Instance"],
    })
    .output(
      z.object({
        // When this was read, by the database's clock.
        at: z.date(),
        api: z.object({
          startedAt: z.date(),
          // The web app's address and the admin's site, as this process holds them.
          webOrigin: z.string(),
          adminSites: z.array(z.string()),
          // When the counts of calls were last written, and how many calls this process
          // counted and could not write since it started.
          usageWrittenAt: z.date().nullable(),
          usageLostCalls: z.number(),
        }),
        // The worker processes seen in the last day, the latest to start first: those that
        // run, then the latest of the others, fifty in all at most.
        workers: z.array(
          z.object({
            id: z.string(),
            startedAt: z.date(),
            // Null for a process that never got as far as scheduling its queues.
            readyAt: z.date().nullable(),
            seenAt: z.date(),
            // Whether it was seen in the last two minutes.
            running: z.boolean(),
          }),
        ),
        jobs: z.array(
          z.object({
            name: z.string(),
            // A five-field cron expression, in UTC.
            schedule: z.string(),
            everySeconds: z.number(),
            state: z.enum(JOB_STATES),
            // The last attempt. Null until the job first runs.
            startedAt: z.date().nullable(),
            finishedAt: z.date().nullable(),
            // The numbers the job returns, by name.
            counts: z.record(z.string(), z.number()).nullable(),
            failure: failureSchema.nullable(),
            // Kept across attempts.
            lastSuccessAt: z.date().nullable(),
            lastFailureAt: z.date().nullable(),
            lastFailure: failureSchema.nullable(),
            failuresInARow: z.number(),
          }),
        ),
        providers: z.array(
          z.object({
            id: z.string(),
            stations: z.number(),
            // The stations with a reading under six hours old, which is when one leaves the map.
            recent: z.number(),
            latestReadingAt: z.date().nullable(),
          }),
        ),
        database: z.object({ sizeBytes: z.number() }),
      }),
    )
    .handler(async ({ context }) => {
      const { db } = context;

      const [workers, jobs, providers, sized] = await Promise.all([
        db
          .select()
          .from(workerProcess)
          .where(gt(workerProcess.seenAt, sql`now() - make_interval(hours => ${SHOWN_HOURS})`))
          // The ones that run first, so that many failed starts never push them out.
          .orderBy(
            desc(gt(workerProcess.seenAt, sql`now() - make_interval(secs => ${SEEN_WITHIN_S})`)),
            desc(workerProcess.startedAt),
            desc(workerProcess.id),
          )
          .limit(SHOWN_PROCESSES),
        db.select().from(job).orderBy(asc(job.name)),
        db
          .select({
            id: station.provider,
            stations: count(),
            recent:
              sql<number>`count(*) filter (where ${station.latestObservedAt} > now() - make_interval(hours => ${RECENT_HOURS}))`.mapWith(
                Number,
              ),
            latestReadingAt: max(station.latestObservedAt),
          })
          .from(station)
          .groupBy(station.provider)
          .orderBy(asc(station.provider)),
        // The database's clock, which is the one the worker writes its moments with: this
        // program's own may differ from it.
        db.execute<{ size: string; at: string }>(
          sql`select pg_database_size(current_database()) as size, (extract(epoch from now()) * 1000)::bigint as at`,
        ),
      ]);

      const at = new Date(Number(sized.rows[0]?.at));
      const usage = context.usage.state();
      return {
        at,
        api: {
          startedAt: context.server.startedAt,
          webOrigin: context.server.webOrigin,
          adminSites: [...context.adminSites],
          usageWrittenAt: usage.lastWrittenAt,
          usageLostCalls: usage.lostCalls,
        },
        workers: workers
          .map((worker) => ({
            ...worker,
            running: at.getTime() - worker.seenAt.getTime() < SEEN_WITHIN_S * 1000,
          }))
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || (a.id < b.id ? 1 : -1)),
        jobs: jobs.map((row) => describeJob(row, at)),
        providers,
        database: { sizeBytes: Number(sized.rows[0]?.size ?? 0) },
      };
    }),
};
