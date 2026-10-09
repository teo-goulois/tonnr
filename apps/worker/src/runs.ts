import { createDb, type Database } from "@repo/db";
import type { DatabaseConfig } from "@repo/db/config";
import { job, type JobFailure, workerProcess } from "@repo/db/schema/instance";
import { CronExpressionParser } from "cron-parser";
import { eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

// How the worker says what it does, for whoever runs the instance: decision 022. This is the
// worker's own bookkeeping. A provider's module knows nothing of it.

/** How long a run may take before the scheduler gives up on it, in seconds. */
export const RUN_SECONDS = 15 * 60;
/** How long a statement or a transaction of a job may last before the database ends it. */
export const WRITE_SECONDS = 5 * 60;

const SEEN_EVERY_MS = 30 * 1000;
// A worker's row is deleted this long after it was last seen.
const KEPT_DAYS = 7;
// What a write of the worker's own state may take: this long to get a connection, and this
// long to run.
const PATIENCE_MS = 5000;
// How much longer the driver waits for the database to say that it ended a write. A driver
// that gave up first would leave the database free to finish the write a moment later.
const ANSWER_MS = 1000;

// What the database is asked to enforce on a connection, given as the connection opens.
// `createDb` reads the settings an address carries of its own and puts these after them.
const enforced = (settings: Record<string, number>) =>
  Object.entries(settings)
    .map(([name, value]) => `-c ${name}=${value}`)
    .join(" ");

/**
 * The database as the jobs use it. The scheduler stops a run by stopping its requests, and
 * cannot stop what the run is writing. So the database ends it: a statement or a transaction
 * of a job lasts five minutes at most, whether its run was stopped or its worker died. The
 * limit on a transaction is a setting of Postgres 17 and later.
 */
export function jobDatabase(env: DatabaseConfig, seconds = WRITE_SECONDS): Database {
  const limit = seconds * 1000;
  const db = createDb(env, {
    statement_timeout: limit,
    options: enforced({ statement_timeout: limit, transaction_timeout: limit }),
  });
  db.$client.on("connect", (client) => {
    // The database closes the connection of a transaction it ends. Nothing else listens for
    // that on a connection in use, and an error that no one listens for stops the process.
    client.on("error", (error) => console.error("A connection of a job was closed", error));
  });
  return db;
}

/**
 * The database as one run uses it. Once the scheduler has stopped the run, nothing more starts
 * from here: a job that goes on after it was stopped, as a function that awaits does, finds a
 * database that takes nothing. The jobs write in transactions. One that was waiting for a
 * connection is checked again as it begins, and undone before it writes. One that was under
 * way ends by `jobDatabase`'s limit.
 */
export function stoppable(db: Database, signal: AbortSignal): Database {
  return new Proxy(db, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...given: unknown[]) => {
        signal.throwIfAborted();
        const [body, ...rest] = given;
        if (property !== "transaction" || typeof body !== "function") {
          return Reflect.apply(value, target, given);
        }
        const checked = (tx: unknown): unknown => {
          signal.throwIfAborted();
          return Reflect.apply(body, undefined, [tx]);
        };
        return Reflect.apply(value, target, [checked, ...rest]);
      };
    },
  });
}

/**
 * The database as the worker writes its own state to it: two connections of its own. A write
 * waits five seconds at most for one of them, and the database ends a write that runs for
 * five: the worker hears of it and knows the write did not happen. A write that got no answer
 * a second later is given up with its connection, which is a network that carries nothing. So
 * a write holds a job for eleven seconds at most.
 */
export function stateDatabase(env: DatabaseConfig, patience = PATIENCE_MS): Database {
  return createDb(env, {
    max: 2,
    connectionTimeoutMillis: patience,
    // The driver's own limit, for a connection that no longer carries anything: the pool lets
    // go of a connection whose statement failed. It comes after the database's, never before.
    query_timeout: patience + ANSWER_MS,
    statement_timeout: patience,
    lock_timeout: patience,
    options: enforced({ statement_timeout: patience, lock_timeout: patience }),
  });
}

/**
 * Runs a write that the worker can do without, and says whether it was written. It never
 * fails: a job is not failed because what it did could not be noted. How long it may take is
 * the database's to say, in `stateDatabase`.
 */
async function noted(what: string, write: () => Promise<unknown>) {
  try {
    await write();
    return true;
  } catch (error) {
    console.error(`state: could not note ${what}`, error);
    return false;
  }
}

const ago = (seconds: number) => sql`now() - make_interval(secs => ${seconds})`;

/**
 * Says that this worker process is there, and goes on saying it every thirty seconds. `ready`
 * notes the moment every queue is scheduled, and `stop` ends the saying. Each saying writes
 * the whole row, so a start that could not be written is written by the next one.
 */
export async function announceWorker(db: Database) {
  const id = crypto.randomUUID();
  // This program's clock measures the time that passed. The database's says what time it is.
  const started = performance.now();
  let ready: number | null = null;

  const seen = () =>
    noted("that the worker is there", () => {
      const sinceStart = (performance.now() - started) / 1000;
      return db
        .insert(workerProcess)
        .values({
          id,
          startedAt: ago(sinceStart),
          readyAt: ready === null ? null : ago(sinceStart - ready),
          seenAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: workerProcess.id,
          set: {
            seenAt: sql`now()`,
            readyAt: sql`coalesce(${workerProcess.readyAt}, excluded.ready_at)`,
          },
        });
    });

  await noted("the workers that are gone", () =>
    db
      .delete(workerProcess)
      .where(lt(workerProcess.seenAt, sql`now() - make_interval(days => ${KEPT_DAYS})`)),
  );
  await seen();
  const timer = setInterval(() => void seen(), SEEN_EVERY_MS);
  // The saying does not keep the process alive on its own.
  timer.unref();

  return {
    id,
    ready: () => {
      ready = (performance.now() - started) / 1000;
      return seen();
    },
    stop: async () => {
      clearInterval(timer);
      await seen();
    },
  };
}

// How far a schedule is read to find its longest gap: far enough for one that runs once every
// leap year, and no further than this many runs for one that runs every minute.
const READ_YEARS = 9;
const READ_RUNS = 2000;
const gaps = new Map<string, number>();

/**
 * The longest time a schedule leaves between two runs, in seconds. The schedule is read as the
 * scheduler reads it, in UTC, from a fixed date, so that the answer is the same at every start.
 * It throws for a schedule that cannot be read or that does not run twice in nine years.
 */
export function everySecondsOf(schedule: string) {
  const known = gaps.get(schedule);
  if (known !== undefined) return known;

  const from = Date.UTC(2026, 0, 1);
  const fires = CronExpressionParser.parse(schedule, { tz: "UTC", currentDate: new Date(from) });
  const end = Date.UTC(2026 + READ_YEARS, 0, 1);
  let longest = 0;
  let previous = fires.next().getTime();
  for (let count = 0; count < READ_RUNS; count += 1) {
    const next = fires.next().getTime();
    if (next > end) break;
    longest = Math.max(longest, next - previous);
    previous = next;
  }
  if (longest <= 0) throw new Error(`The schedule ${schedule} does not run twice`);

  const seconds = Math.round(longest / 1000);
  gaps.set(schedule, seconds);
  return seconds;
}

/** A job as the worker runs it: the queue's name, and its schedule. */
export type Scheduled = { name: string; schedule: string };

const describe = ({ schedule }: Scheduled, expiresSeconds = RUN_SECONDS) => ({
  schedule,
  everySeconds: everySecondsOf(schedule),
  expiresSeconds,
});

/**
 * Adds the worker's jobs to the list, or brings their schedule up to date. It removes none:
 * another version of the worker may be running beside this one, with jobs this one does not
 * have. A job taken out of the code is removed by name, with `retireJobs`. A job that could
 * not be added does not keep the others out, and is added when it runs.
 */
export async function listJobs(db: Database, jobs: readonly Scheduled[]) {
  for (const listed of jobs) {
    await noted(`the job ${listed.name}`, async () => {
      const described = describe(listed);
      await db
        .insert(job)
        .values({ name: listed.name, ...described })
        .onConflictDoUpdate({ target: job.name, set: described });
    });
  }
}

export async function retireJobs(db: Database, names: readonly string[]) {
  if (names.length === 0) return;
  await noted("the retired jobs", () => db.delete(job).where(inArray(job.name, [...names])));
}

/**
 * What is kept of a failure: its kind and, for a provider that answered with an error, its
 * status and its host. The error's own text is left out. It can hold a line of a provider's
 * answer, an address with what it was asked, or a statement with its values.
 */
export function describeFailure(error: unknown): JobFailure {
  const tagged = typeof error === "object" && error !== null ? (error as { _tag?: unknown }) : {};

  if (tagged._tag === "UpstreamError") {
    const { url, status } = error as { url?: unknown; status?: unknown };
    return {
      kind: "provider",
      ...(typeof status === "number" && { status }),
      // The host, and nothing of the path or of what was asked.
      ...(typeof url === "string" && URL.canParse(url) && { host: new URL(url).host }),
    };
  }
  if (tagged._tag === "FormatError" || tagged._tag === "ForecastFormatError") {
    return { kind: "format" };
  }
  if (tagged._tag === "StoreError") return { kind: "database" };
  return { kind: "other" };
}

/** What a job did: the numbers it logs, and whether some of its work failed. */
export type Done = { counts: Record<string, number>; degraded?: boolean };

const EXPIRED: JobFailure = { kind: "expired" };
const STOPPED: JobFailure = { kind: "stopped" };
const json = (failure: JobFailure) => sql`${JSON.stringify(failure)}::jsonb`;

type Attempt = {
  job: Scheduled;
  workerId: string;
  /**
   * When the scheduler started the attempt, by the database's clock. It orders the attempts of
   * a job, whenever their writes arrive: one that started later keeps the row.
   */
  startedAt: Date;
  /** How long the scheduler lets the run take. */
  expiresSeconds?: number;
  /**
   * Why the scheduler stopped the run, when it did: the run took too long, or the worker is
   * stopping. Asked when the run fails, and null for a failure of the run's own.
   */
  givenUp?: () => "expired" | "stopped" | null;
};

/**
 * Runs one attempt of a job and writes what became of it in the job's row: that it started,
 * with its deadline, then how it ended. Each of the two writes brings the whole attempt, so
 * the end says it all when the start could not be written. Neither changes a row that holds
 * an attempt the scheduler started later, so a write that comes in late changes nothing. An
 * end that comes after the deadline is an expired attempt whatever the run returned. A
 * failure is thrown again, for the scheduler to see.
 */
export async function recorded(db: Database, attempt: Attempt, run: () => Promise<Done>) {
  const { name } = attempt.job;
  const expires = attempt.expiresSeconds ?? RUN_SECONDS;
  const attemptId = crypto.randomUUID();
  const startedAt = sql`${attempt.startedAt.toISOString()}::timestamptz`;
  const deadlineAt = sql`${startedAt} + make_interval(secs => ${expires})`;
  const late = sql`now() > ${deadlineAt}`;
  // The schedule is read here and not before: one that cannot be read fails the note, not the job.
  const whole = () => ({
    ...describe(attempt.job, expires),
    attemptId,
    workerId: attempt.workerId,
    startedAt,
    deadlineAt,
  });

  // The attempt the row holds, when it is another one that never said how it ended: its worker
  // stopped under it. It is a failure, counted as this attempt takes the row.
  const lost = sql`${job.attemptId} is distinct from ${attemptId} and ${job.startedAt} is not null and ${job.finishedAt} is null`;
  const failuresBefore = sql`${job.failuresInARow} + case when ${lost} then 1 else 0 end`;

  await noted(`the start of ${name}`, () =>
    db
      .insert(job)
      .values({ name, ...whole() })
      .onConflictDoUpdate({
        target: job.name,
        set: {
          ...whole(),
          finishedAt: null,
          outcome: null,
          counts: null,
          failure: null,
          failuresInARow: failuresBefore,
          lastFailureAt: sql`case when ${lost} then now() else ${job.lastFailureAt} end`,
          lastFailure: sql`case when ${lost} then ${json(STOPPED)} else ${job.lastFailure} end`,
        },
        setWhere: or(isNull(job.startedAt), lte(job.startedAt, startedAt)),
      }),
  );

  // An end is written over this attempt's own start, or over an attempt that started before.
  // Two attempts that the scheduler started in the same millisecond are not told apart: the
  // one whose start was written keeps the row. A queue runs one attempt at a time.
  const takes = or(
    eq(job.attemptId, attemptId),
    isNull(job.startedAt),
    lt(job.startedAt, startedAt),
  );

  try {
    const done = await run();
    const outcome = done.degraded ? "degraded" : "succeeded";
    // A run that ended in time worked, in whole or in part. One that ended late did not,
    // whatever it returned.
    const ended = {
      finishedAt: sql`now()`,
      outcome: sql`case when ${late} then 'expired' else ${outcome} end`,
      counts: done.counts,
      failure: sql`case when ${late} then ${json(EXPIRED)} else null end`,
    };
    await noted(`the end of ${name}`, () =>
      db
        .insert(job)
        .values({
          name,
          ...whole(),
          ...ended,
          lastSuccessAt: sql`case when ${late} then null else now() end`,
          lastFailureAt: sql`case when ${late} then now() else null end`,
          lastFailure: sql`case when ${late} then ${json(EXPIRED)} else null end`,
          failuresInARow: sql`case when ${late} then 1 else 0 end`,
        })
        .onConflictDoUpdate({
          target: job.name,
          set: {
            ...whole(),
            ...ended,
            lastSuccessAt: sql`case when ${late} then ${job.lastSuccessAt} else now() end`,
            lastFailureAt: sql`case when ${late} or ${lost} then now() else ${job.lastFailureAt} end`,
            lastFailure: sql`case when ${late} then ${json(EXPIRED)} when ${lost} then ${json(STOPPED)} else ${job.lastFailure} end`,
            failuresInARow: sql`case when ${late} then ${failuresBefore} + 1 else 0 end`,
          },
          setWhere: takes,
        }),
    );
    return done;
  } catch (error) {
    // The scheduler's clock is the one that says a run took too long: it stopped the run.
    const given = attempt.givenUp?.() ?? null;
    const failure =
      given === "expired" ? EXPIRED : given === "stopped" ? STOPPED : describeFailure(error);
    const ended = {
      finishedAt: sql`now()`,
      outcome:
        given === "expired"
          ? ("expired" as const)
          : given === "stopped"
            ? ("failed" as const)
            : sql`case when ${late} then 'expired' else 'failed' end`,
      // What an attempt before returned is not this one's.
      counts: null,
      failure,
      lastFailureAt: sql`now()`,
      lastFailure: failure,
    };
    await noted(`the failure of ${name}`, () =>
      db
        .insert(job)
        .values({ name, ...whole(), ...ended, failuresInARow: 1 })
        .onConflictDoUpdate({
          target: job.name,
          set: { ...whole(), ...ended, failuresInARow: sql`${failuresBefore} + 1` },
          setWhere: takes,
        }),
    );
    throw error;
  }
}
