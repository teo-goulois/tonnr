import { createDb } from "@repo/db";
import { Effect } from "effect";

import { evaluateAlerts } from "./alerts";
import { ENV } from "./env.server";
import { ingest, providers } from "./ingest";

// Runs one job once and exits: `pnpm --filter worker run job ndbc`, or `... job alerts`.
const job = process.argv[2];
const provider = providers.find((candidate) => candidate.id === job);

if (!provider && job !== "alerts") {
  const names = [...providers.map((candidate) => candidate.id), "alerts"];
  console.error(`Usage: job <${names.join("|")}>`);
  process.exit(1);
}

const db = createDb(ENV);

try {
  if (provider) await Effect.runPromise(ingest(provider, db));
  else await Effect.runPromise(evaluateAlerts(db));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
