import { FORECAST_BUDGET, FORECAST_PROVIDER } from "@repo/conditions/forecasts/open-meteo";
import { MAIL_PROVIDER } from "@repo/auth/verification";
import { currentCalls } from "@repo/db/calls";
import { countForecastCells } from "@repo/db/forecasts";
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

import type { Database } from "@repo/db";

import { adminProcedure, publicProcedure } from "../index";
import { visitorsClosedAt } from "../visitors";

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

// What the instance lets itself ask its forecast provider, as decision 023 counts it.
const BUDGETS = [
  { bucket: "day:people", limit: FORECAST_BUDGET.day.people },
  { bucket: "day:alerts", limit: FORECAST_BUDGET.day.alerts },
  { bucket: "hour", limit: FORECAST_BUDGET.hour },
  { bucket: "minute", limit: FORECAST_BUDGET.minute },
] as const;

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

// What anyone is told of the instance, kept a few seconds for each database: a route that asks
// no one who they are does not query at every call.
const HEALTH_KEPT_MS = 5 * 1000;
type Health = {
  at: Date;
  worker: {
    startedAt: Date;
    readyAt: Date | null;
    seenAt: Date;
    running: boolean;
    revision: string | null;
  } | null;
};
const healthKept = new WeakMap<Database, { until: number; health: Promise<Health> }>();

async function readHealth(db: Database): Promise<Health> {
  // The database's clock, which is the one the worker writes its moments with.
  const clock = await db.execute<{ at: string }>(
    sql`select (extract(epoch from now()) * 1000)::bigint as at`,
  );
  const at = new Date(Number(clock.rows[0]?.at));
  // The worker that started last: after a deployment, the one that the deployment started.
  const [latest] = await db
    .select({
      startedAt: workerProcess.startedAt,
      readyAt: workerProcess.readyAt,
      seenAt: workerProcess.seenAt,
      revision: workerProcess.revision,
    })
    .from(workerProcess)
    .orderBy(desc(workerProcess.startedAt), desc(workerProcess.id))
    .limit(1);
  return {
    at,
    worker: latest
      ? { ...latest, running: at.getTime() - latest.seenAt.getTime() < SEEN_WITHIN_S * 1000 }
      : null,
  };
}

function healthOf(db: Database) {
  const kept = healthKept.get(db);
  if (kept && kept.until > Date.now()) return kept.health;
  const health = readHealth(db);
  healthKept.set(db, { until: Date.now() + HEALTH_KEPT_MS, health });
  // An answer that could not be had is asked for again by the next call.
  health.catch(() => healthKept.delete(db));
  return health;
}

export const instanceRouter = {
  health: publicProcedure
    .route({
      method: "GET",
      path: "/health",
      summary: "Whether the API and the worker run, and since when",
      description:
        "Answers anyone, and is not counted. It says when this API process started, and of " +
        "the worker process that started last: when it started, when it had scheduled its " +
        "queues, when it was last seen, and whether that was in the last two minutes. Each " +
        "comes with `revision`, the commit its image was built from, null for a program that " +
        "does not know it. A " +
        "deployment took once a start is later than the moment it was asked for: " +
        "`pnpm run deploy:api` and `pnpm run deploy:worker` wait for that. The answer is up " +
        "to five seconds old. Decision 022.",
      tags: ["Instance"],
      // The reference says that this route asks for neither a key nor a session.
      spec: (operation) => ({ ...operation, security: [] }),
    })
    .output(
      z.object({
        // The database's clock when the answer was made.
        at: z.date(),
        api: z.object({ startedAt: z.date(), revision: z.string().nullable() }),
        // Null on an instance where no worker ever started.
        worker: z
          .object({
            startedAt: z.date(),
            // Null while it has not scheduled its queues.
            readyAt: z.date().nullable(),
            seenAt: z.date(),
            running: z.boolean(),
            revision: z.string().nullable(),
          })
          .nullable(),
      }),
    )
    .handler(async ({ context }) => {
      const health = await healthOf(context.db);
      return {
        ...health,
        api: { startedAt: context.server.startedAt, revision: context.server.revision ?? null },
      };
    }),

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
          // The commit its image was built from. Null for a process that does not know it.
          revision: z.string().nullable(),
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
            // The commit its image was built from. Null for one that did not know it.
            revision: z.string().nullable(),
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
        // Since when the instance answers no visitor of its web app. Null while it answers
        // them: decision 039.
        visitors: z.object({ closedAt: z.date().nullable() }),
        // The mail the API sends: through what, and how many mails it counted today, in UTC,
        // against what it lets out in a day. A mail is counted before it leaves, and stays
        // counted when it did not. `via` is null on an instance that sends none.
        mail: z.object({
          via: z.enum(["unosend", "smtp"]).nullable(),
          today: z.number(),
          dailyLimit: z.number(),
        }),
        forecasts: z.object({
          // The cells that have a forecast kept.
          cells: z.number(),
          // The requests sent to the forecast provider in the present day, hour and minute, in
          // UTC, against what the instance lets itself send. The day has a share for the
          // people who look and one for the alerts.
          calls: z.array(
            z.object({
              bucket: z.enum(["day:people", "day:alerts", "hour", "minute"]),
              calls: z.number(),
              limit: z.number(),
            }),
          ),
        }),
      }),
    )
    .handler(async ({ context }) => {
      const { db } = context;

      const [workers, jobs, providers, sized, cells, calls, mails, closedAt] = await Promise.all([
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
        countForecastCells(db),
        currentCalls(db, FORECAST_PROVIDER),
        currentCalls(db, MAIL_PROVIDER),
        visitorsClosedAt(db),
      ]);

      const at = new Date(Number(sized.rows[0]?.at));
      const usage = context.usage.state();
      return {
        at,
        api: {
          startedAt: context.server.startedAt,
          revision: context.server.revision ?? null,
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
        visitors: { closedAt },
        mail: {
          via: context.verification.via,
          today: mails.get("day") ?? 0,
          dailyLimit: context.verification.dailyLimit,
        },
        forecasts: {
          cells,
          calls: BUDGETS.map((budget) => ({ ...budget, calls: calls.get(budget.bucket) ?? 0 })),
        },
      };
    }),
};
