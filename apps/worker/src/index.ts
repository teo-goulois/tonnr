import { createDb } from "@repo/db";
import { Effect } from "effect";
import { PgBoss } from "pg-boss";

import { ENV } from "./env.server";
import { ingest, providers } from "./ingest";

const db = createDb(ENV);
const boss = new PgBoss(ENV.DATABASE_URL);

boss.on("error", (error) => console.error(error));
await boss.start();

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

async function shutdown() {
  await boss.stop();
  await db.$client.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
