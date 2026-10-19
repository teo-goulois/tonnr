import { FORECAST_BUDGET, FORECAST_PROVIDER } from "@repo/conditions/forecasts/open-meteo";
import { MAIL_PROVIDER } from "@repo/auth/verification";
import { currentCalls } from "@repo/db/calls";
import { countForecastCells } from "@repo/db/forecasts";
import { accountSuspension, apiUsage, USAGE_VIA } from "@repo/db/schema/access";
import { alertSettings } from "@repo/db/schema/alerts";
import { session, user } from "@repo/db/schema/auth";
import { station } from "@repo/db/schema/buoys";
import { media } from "@repo/db/schema/media";
import { reportNotice, surfReport } from "@repo/db/schema/reports";
import {
  FAILURE_KINDS,
  job,
  JOB_OUTCOMES,
  type JobFailure,
  workerProcess,
} from "@repo/db/schema/instance";
import { asc, count, countDistinct, desc, eq, gt, max, sql, sum } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db";

import { errorReportsPausedAt } from "../error-reports";
import { adminProcedure, publicProcedure } from "../index";
import { uploadsPausedAt } from "../media";
import { isDemandStrong, STRONG_DEMAND_AT, visitorsClosedAt } from "../visitors";

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
  { bucket: "day:pages", limit: FORECAST_BUDGET.day.pages },
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

/**
 * What the bucket keeps of the accounts' photos and videos, what waits for the worker, and since
 * when an operator has uploads stopped: decision 066.
 */
async function keptMedia(db: Database) {
  const [[figures], pausedAt] = await Promise.all([
    db
      .select({
        ready: sql<number>`count(*) filter (where ${media.state} = 'ready')`.mapWith(Number),
        bytes:
          sql<number>`coalesce(sum(${media.bytes}) filter (where ${media.state} = 'ready'), 0)`.mapWith(
            Number,
          ),
        waiting:
          sql<number>`count(*) filter (where ${media.state} in ('awaiting_upload', 'uploaded'))`.mapWith(
            Number,
          ),
        failed: sql<number>`count(*) filter (where ${media.state} = 'failed')`.mapWith(Number),
      })
      .from(media),
    uploadsPausedAt(db),
  ]);
  return {
    pausedAt,
    ready: figures?.ready ?? 0,
    bytes: figures?.bytes ?? 0,
    waiting: figures?.waiting ?? 0,
    failed: figures?.failed ?? 0,
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

  overview: adminProcedure
    .route({
      method: "GET",
      path: "/instance/overview",
      summary: "The instance at a glance: its accounts, its calls, its forecasts, its worker",
      description:
        `${ADMIN_ONLY} A few numbers, for an operator who wants to know in a moment whether ` +
        "many people are here and whether the instance keeps up. The accounts active this week " +
        "are those with a session that was used in the last seven days. The calls are those " +
        "of the last twenty-four hours, by the kind of caller, as the counts of decision 020 " +
        "keep them: approximate, written every thirty seconds. The forecasts are the requests " +
        "sent to the provider today, UTC, against each share of the day: decision 023.",
      tags: ["Instance"],
    })
    .output(
      z.object({
        at: z.date(),
        accounts: z.object({
          total: z.number(),
          // Made in the last seven days.
          newThisWeek: z.number(),
          // With a session used in the last seven days.
          activeThisWeek: z.number(),
          suspended: z.number(),
        }),
        // The calls of the last twenty-four hours, by who made them.
        calls: z.object({
          total: z.number(),
          byVia: z.array(z.object({ via: z.enum(USAGE_VIA), calls: z.number() })),
        }),
        forecasts: z.object({
          people: z.object({ calls: z.number(), limit: z.number() }),
          // The share of the pages of the listed breaks, which the worker keeps: decision 057.
          pages: z.object({ calls: z.number(), limit: z.number() }),
          alerts: z.object({ calls: z.number(), limit: z.number() }),
          cells: z.number(),
        }),
        visitors: z.object({
          // Whether a visitor reads the map now: no operator closed the instance to them, and
          // demand is not strong.
          open: z.boolean(),
          busy: z.boolean(),
          closedAt: z.date().nullable(),
        }),
        worker: z.object({
          // Whether a worker said it was there in the last two minutes.
          running: z.boolean(),
          // The jobs no attempt of started for longer than their schedule leaves, and those
          // whose last attempt failed or ran too long.
          late: z.number(),
          failed: z.number(),
        }),
        // The reports of the last seven days and what they told, each by when it happened, as
        // the rows keep them now: a report deleted since counts no more. Decisions 067 and 068.
        reports: z.object({
          // Sent, first shown by its checks or by an operator, and refused by its checks.
          sent: z.number(),
          shown: z.number(),
          refused: z.number(),
          // Left to an operator now, whenever they were sent: those its checks were unsure of,
          // and those the flags of accounts hid.
          waiting: z.number(),
          // The notices made, the pushes that a push service took, and the notices read.
          notices: z.number(),
          pushed: z.number(),
          read: z.number(),
          // The views and the opened photos of the reports sent in the seven days.
          views: z.number(),
          opens: z.number(),
          // The accounts that switched the reports off.
          switchedOff: z.number(),
        }),
      }),
    )
    .handler(async ({ context }) => {
      const { db } = context;
      const weekAgo = sql`now() - interval '7 days'`;
      const dayAgo = sql`now() - interval '24 hours'`;
      const [accounts, active, suspended, byVia, calls, cells, closedAt, workers, jobs, clock] =
        await Promise.all([
          db
            .select({
              total: count(),
              newThisWeek: count(sql`case when ${user.createdAt} > ${weekAgo} then 1 end`),
            })
            .from(user),
          db
            .select({ active: countDistinct(session.userId) })
            .from(session)
            .where(gt(session.updatedAt, weekAgo)),
          db.$count(accountSuspension),
          db
            .select({
              via: apiUsage.via,
              calls: sql<number>`coalesce(${sum(apiUsage.calls)}, 0)::int`.mapWith(Number),
            })
            .from(apiUsage)
            .where(gt(apiUsage.hour, dayAgo))
            .groupBy(apiUsage.via)
            .orderBy(sql`2 desc`),
          currentCalls(db, FORECAST_PROVIDER),
          countForecastCells(db),
          visitorsClosedAt(db),
          db.select({ seenAt: max(workerProcess.seenAt) }).from(workerProcess),
          db.select().from(job),
          db.execute<{ at: string }>(sql`select (extract(epoch from now()) * 1000)::bigint as at`),
        ]);

      const [[reports], [notices], switchedOff] = await Promise.all([
        db
          .select({
            sent: count(sql`case when ${surfReport.createdAt} > ${weekAgo} then 1 end`),
            shown: count(sql`case when ${surfReport.publishedAt} > ${weekAgo} then 1 end`),
            refused: count(
              sql`case when ${surfReport.state} = 'refused' and ${surfReport.checkedAt} > ${weekAgo} then 1 end`,
            ),
            waiting: count(sql`case when ${surfReport.state} in ('review', 'hidden') then 1 end`),
            views:
              sql<number>`coalesce(sum(case when ${surfReport.createdAt} > ${weekAgo} then ${surfReport.views} end), 0)::int`.mapWith(
                Number,
              ),
            opens:
              sql<number>`coalesce(sum(case when ${surfReport.createdAt} > ${weekAgo} then ${surfReport.opens} end), 0)::int`.mapWith(
                Number,
              ),
          })
          .from(surfReport),
        db
          .select({
            notices: count(sql`case when ${reportNotice.createdAt} > ${weekAgo} then 1 end`),
            pushed: count(
              sql`case when ${reportNotice.pushState} = 'sent' and ${reportNotice.settledAt} > ${weekAgo} then 1 end`,
            ),
            read: count(sql`case when ${reportNotice.readAt} > ${weekAgo} then 1 end`),
          })
          .from(reportNotice),
        db.$count(alertSettings, eq(alertSettings.onReports, false)),
      ]);

      const at = new Date(Number(clock.rows[0]?.at));
      const states = jobs.map((row) => jobState(row, at));
      const busy = isDemandStrong(calls);
      return {
        at,
        accounts: {
          total: accounts[0]?.total ?? 0,
          newThisWeek: accounts[0]?.newThisWeek ?? 0,
          activeThisWeek: active[0]?.active ?? 0,
          suspended,
        },
        calls: {
          total: byVia.reduce((total, row) => total + row.calls, 0),
          byVia,
        },
        forecasts: {
          people: { calls: calls.get("day:people") ?? 0, limit: FORECAST_BUDGET.day.people },
          pages: { calls: calls.get("day:pages") ?? 0, limit: FORECAST_BUDGET.day.pages },
          alerts: { calls: calls.get("day:alerts") ?? 0, limit: FORECAST_BUDGET.day.alerts },
          cells,
        },
        visitors: { open: closedAt === null && !busy, busy, closedAt },
        worker: {
          running:
            workers[0]?.seenAt !== null &&
            workers[0]?.seenAt !== undefined &&
            at.getTime() - workers[0].seenAt.getTime() < SEEN_WITHIN_S * 1000,
          late: states.filter((state) => state === "late").length,
          failed: states.filter((state) => state === "failed" || state === "expired").length,
        },
        reports: {
          sent: reports?.sent ?? 0,
          shown: reports?.shown ?? 0,
          refused: reports?.refused ?? 0,
          waiting: reports?.waiting ?? 0,
          notices: notices?.notices ?? 0,
          pushed: notices?.pushed ?? 0,
          read: notices?.read ?? 0,
          views: reports?.views ?? 0,
          opens: reports?.opens ?? 0,
          switchedOff,
        },
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
        // Whether the instance answers the visitors of its web app: decision 039.
        visitors: z.object({
          // Since when an operator has it answer none. Null while none has.
          closedAt: z.date().nullable(),
          // Whether demand is strong, which closes the instance to visitors by itself until
          // the day ends, in UTC: the requests of the day for the people who look, under
          // `forecasts`, have reached `closesAt`.
          busy: z.boolean(),
          closesAt: z.number(),
        }),
        // Since when an operator has the web app send no error report: decision 054. Null
        // while none has.
        errorReports: z.object({ pausedAt: z.date().nullable() }),
        // The photos and the videos of the accounts' sessions: decision 066.
        media: z.object({
          // Whether the instance keeps any: false while the bucket's settings are not all set.
          offered: z.boolean(),
          // Since when an operator has uploads stopped. Null while none has.
          pausedAt: z.date().nullable(),
          // The media made into what is shown, and how much of the bucket their files take.
          ready: z.number(),
          bytes: z.number(),
          // The media asked for and not yet sent, or sent and not yet made.
          waiting: z.number(),
          // The media the worker refused or gave up on, which an account still sees.
          failed: z.number(),
        }),
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
          // people who look, one for the pages of the listed breaks and one for the alerts.
          calls: z.array(
            z.object({
              bucket: z.enum(["day:people", "day:pages", "day:alerts", "hour", "minute"]),
              calls: z.number(),
              limit: z.number(),
            }),
          ),
        }),
      }),
    )
    .handler(async ({ context }) => {
      const { db } = context;

      const [workers, jobs, providers, sized, cells, calls, mails, closedAt, pausedAt, kept] =
        await Promise.all([
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
          errorReportsPausedAt(db),
          keptMedia(db),
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
        visitors: { closedAt, busy: isDemandStrong(calls), closesAt: STRONG_DEMAND_AT },
        errorReports: { pausedAt },
        media: { offered: Boolean(context.storage), ...kept },
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
