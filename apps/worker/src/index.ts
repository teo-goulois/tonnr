import { createDb } from "@repo/db";
import { Effect } from "effect";
import { PgBoss } from "pg-boss";

import { evaluateAlerts } from "./alerts";
import { ENV } from "./env.server";
import { ingest, providers, retiredProviderIds } from "./ingest";
import { pruneReadings } from "./store";

const db = createDb(ENV);
const boss = new PgBoss(ENV.DATABASE_URL);

boss.on("error", (error) => console.error(error));
await boss.start();

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
  await boss.createQueue(queue, { policy: "stately", retryLimit: 0 });
  // createQueue leaves an existing queue as it is, so the retry limit is applied again.
  await boss.updateQueue(queue, { retryLimit: 0 });
  await boss.schedule(queue, provider.schedule);
  await boss.work(queue, async () => {
    await Effect.runPromise(ingest(provider, db));
  });
  // One run at startup, so a fresh deploy does not wait for the schedule.
  await boss.send(queue);

  console.log(`Scheduled ${queue} (${provider.schedule})`);
}

const PRUNE_QUEUE = "prune-readings";
await boss.createQueue(PRUNE_QUEUE, { policy: "stately", retryLimit: 0 });
await boss.updateQueue(PRUNE_QUEUE, { retryLimit: 0 });
// Once a night, at a quiet minute.
await boss.schedule(PRUNE_QUEUE, "17 3 * * *");
await boss.work(PRUNE_QUEUE, async () => {
  const deleted = await Effect.runPromise(pruneReadings(db));
  console.log(`Pruned ${deleted} old wind readings`);
});

const ALERTS_QUEUE = "evaluate-alerts";
await boss.createQueue(ALERTS_QUEUE, { policy: "stately", retryLimit: 0 });
await boss.updateQueue(ALERTS_QUEUE, { retryLimit: 0 });
// Forecast models are renewed every six to twelve hours, so every three hours is often enough.
await boss.schedule(ALERTS_QUEUE, "20 */3 * * *");
await boss.work(ALERTS_QUEUE, async () => {
  await Effect.runPromise(evaluateAlerts(db));
});
await boss.send(ALERTS_QUEUE);

async function shutdown() {
  await boss.stop();
  await db.$client.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
