import { createDb } from "@repo/db";
import { Effect } from "effect";

import { ENV } from "./env.server";
import { ingest, providers } from "./ingest";

// Runs one provider once and exits: `pnpm --filter worker run ingest ndbc`.
const providerId = process.argv[2];
const provider = providers.find((candidate) => candidate.id === providerId);

if (!provider) {
  console.error(`Usage: ingest <${providers.map((candidate) => candidate.id).join("|")}>`);
  process.exit(1);
}

const db = createDb(ENV);

try {
  await Effect.runPromise(ingest(provider, db));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
