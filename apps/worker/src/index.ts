import type { Database } from "@repo/db";
import { Effect } from "effect";
import { PgBoss } from "pg-boss";

import { evaluateAlerts } from "./alerts";
import { breakSources } from "./breaks/import";
import { ENV } from "./env.server";
import { updateExposure } from "./exposure";
import { ingest, providers, retiredProviderIds } from "./ingest";
import {
  announceWorker,
  type Done,
  jobDatabase,
  listJobs,
  recorded,
  retireJobs,
  RUN_SECONDS,
  type Scheduled,
  stateDatabase,
  stoppable,
} from "./runs";
import { pruneReadings } from "./store";

// What the jobs read and write, and where the worker says what it does: decision 022.
const db = jobDatabase(ENV);
const state = stateDatabase(ENV);

// The worker says it is there before anything else, so that one which fails to start shows.
const worker = await announceWorker(state);

const boss = new PgBoss(ENV.DATABASE_URL);

boss.on("error", (error) => console.error(error));
await boss.start();

const PRUNE_QUEUE = "prune-readings";
const EXPOSURE_QUEUE = "classify-exposure";
const ALERTS_QUEUE = "evaluate-alerts";
// Every job the scheduler runs, with its schedule. A queue that is not here cannot be run.
const jobs: Scheduled[] = [
  ...providers.map((provider) => ({ name: `ingest-${provider.id}`, schedule: provider.schedule })),
  // Once a night, at a quiet minute.
  { name: PRUNE_QUEUE, schedule: "17 3 * * *" },
  // Once a night: a station's exposure is read from days of waves, and changes slowly.
  { name: EXPOSURE_QUEUE, schedule: "47 3 * * *" },
  // Forecast models are renewed every six to twelve hours, so every three hours is often enough.
  { name: ALERTS_QUEUE, schedule: "20 */3 * * *" },
];
// The queues an earlier version scheduled to import the catalogue of breaks. It is filled once
// and by hand since decision 024, so they are deleted below, and their jobs leave the list.
const retiredBreakQueues = breakSources.map((source) => `import-breaks-${source.id}`);
await listJobs(state, jobs);
await retireJobs(state, [...retiredProviderIds.map((id) => `ingest-${id}`), ...retiredBreakQueues]);

function scheduled(queue: string) {
  const found = jobs.find((listed) => listed.name === queue);
  if (!found) throw new Error(`The job ${queue} is not in the list of jobs`);
  return found;
}

// Set when the worker is asked to stop: a run cut short then was not one that took too long.
let isStopping = false;

// The scheduler hands a run the moment it started it, which orders the attempts of a job.
const withStart = { includeMetadata: true } as const;

/**
 * What the scheduler calls for a queue: one attempt of the job, noted in the job's row. When
 * the scheduler gives up on the run, its requests to providers are stopped and its database
 * takes nothing more. What it was writing at that moment is not stopped, and the database ends
 * that itself: see `jobDatabase`.
 */
function attemptOf<Result>(
  queue: string,
  effect: (db: Database) => Effect.Effect<Result, unknown>,
  done: (result: Result) => Done,
) {
  const job = scheduled(queue);
  return async ([asked]: readonly { signal: AbortSignal; startedOn: Date }[]) => {
    if (!asked) return;
    await recorded(
      state,
      {
        job,
        workerId: worker.id,
        startedAt: asked.startedOn,
        // The scheduler stops a run that took too long, and every run when the worker stops.
        givenUp: () => (isStopping ? "stopped" : asked.signal.aborted ? "expired" : null),
      },
      async () =>
        done(
          await Effect.runPromise(effect(stoppable(db, asked.signal)), { signal: asked.signal }),
        ),
    );
  };
}

// A provider taken out of the code leaves its queue in the database, with a schedule that would
// keep queueing runs that nothing works. Only the queues listed as retired are deleted: any
// other one may belong to a newer worker running next to this one.
for (const id of retiredProviderIds) {
  const queue = `ingest-${id}`;
  try {
    if (await boss.getQueue(queue)) {
      // Deleting a queue deletes its schedule with it.
      await boss.deleteQueue(queue);
      console.log(`Removed ${queue}, whose provider is retired`);
    }
  } catch (error) {
    // The next start tries again, and the other providers must still run.
    console.error(`Could not remove ${queue}`, error);
  }
}

for (const provider of providers) {
  const queue = `ingest-${provider.id}`;

  // "stately" keeps at most one run queued and one running, so a slow provider never piles up.
  // A failed run is not retried: the next scheduled run fetches the same data.
  const options = { retryLimit: 0, expireInSeconds: RUN_SECONDS };
  await boss.createQueue(queue, { policy: "stately", ...options });
  // createQueue leaves an existing queue as it is, so its options are applied again.
  await boss.updateQueue(queue, options);
  await boss.schedule(queue, scheduled(queue).schedule);
  await boss.work(
    queue,
    withStart,
    attemptOf(
      queue,
      (db) => ingest(provider, db),
      ({ stations, newReadings, completedReadings, failedStations, rejected }) => ({
        counts: { stations, newReadings, completedReadings, failedStations, rejected },
        // The run went to its end, and the database refused some of the stations.
        degraded: failedStations > 0,
      }),
    ),
  );
  // One run at startup, so a fresh deploy does not wait for the schedule.
  await boss.send(queue);

  console.log(`Scheduled ${queue} (${provider.schedule})`);
}

const once = { retryLimit: 0, expireInSeconds: RUN_SECONDS };

await boss.createQueue(PRUNE_QUEUE, { policy: "stately", ...once });
await boss.updateQueue(PRUNE_QUEUE, once);
await boss.schedule(PRUNE_QUEUE, scheduled(PRUNE_QUEUE).schedule);
await boss.work(
  PRUNE_QUEUE,
  withStart,
  attemptOf(
    PRUNE_QUEUE,
    (db) => pruneReadings(db),
    (deleted) => {
      console.log(`Pruned ${deleted} old wind readings`);
      return { counts: { deleted } };
    },
  ),
);

await boss.createQueue(EXPOSURE_QUEUE, { policy: "stately", ...once });
await boss.updateQueue(EXPOSURE_QUEUE, once);
await boss.schedule(EXPOSURE_QUEUE, scheduled(EXPOSURE_QUEUE).schedule);
await boss.work(
  EXPOSURE_QUEUE,
  withStart,
  attemptOf(
    EXPOSURE_QUEUE,
    (db) => updateExposure(db),
    ({ stations, open, sheltered, changed }) => {
      console.log(
        `Exposure: ${open} open and ${sheltered} sheltered of ${stations} wave stations, ${changed} changed`,
      );
      return { counts: { stations, open, sheltered, changed } };
    },
  ),
);
await boss.send(EXPOSURE_QUEUE);

await boss.createQueue(ALERTS_QUEUE, { policy: "stately", ...once });
await boss.updateQueue(ALERTS_QUEUE, once);
await boss.schedule(ALERTS_QUEUE, scheduled(ALERTS_QUEUE).schedule);
await boss.work(
  ALERTS_QUEUE,
  withStart,
  attemptOf(
    ALERTS_QUEUE,
    (db) => evaluateAlerts(db),
    ({ spots, created, failed }) => ({
      counts: { spots, created, failed },
      // The run went to its end, and some spots could not be checked.
      degraded: failed > 0,
    }),
  ),
);
await boss.send(ALERTS_QUEUE);

// A queue that stayed would keep queueing runs that nothing works.
for (const queue of retiredBreakQueues) {
  try {
    if (await boss.getQueue(queue)) {
      await boss.deleteQueue(queue);
      console.log(`Removed ${queue}: breaks are no longer imported on a schedule`);
    }
  } catch (error) {
    // The next start tries again, and the other jobs must still run.
    console.error(`Could not remove ${queue}`, error);
  }
}

// How long a stop may take: the runs under way are given fifteen seconds to end, then are
// stopped, and ten seconds are left to say so and to close the connections.
const DRAIN_MS = 15_000;
const STOP_MS = 25_000;

async function shutdown() {
  isStopping = true;
  // A connection that does not close does not hold the process.
  setTimeout(() => process.exit(1), STOP_MS);
  await boss.stop({ timeout: DRAIN_MS });
  await worker.stop();
  await Promise.allSettled([db.$client.end(), state.$client.end()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Every queue is scheduled, and a stop is handled from here on.
await worker.ready();
console.log("Worker ready");
