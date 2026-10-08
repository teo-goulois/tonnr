import { createDb } from "@repo/db";
import { Effect } from "effect";

import { evaluateAlerts } from "./alerts";
import { breakSources, importBreaks } from "./breaks/import";
import { ENV } from "./env.server";
import { updateExposure } from "./exposure";
import { ingest, providers } from "./ingest";

// Runs one job once and exits: `pnpm --filter worker run job ndbc`, `... job alerts`,
// `... job exposure`, or `... job breaks`.
const job = process.argv[2];
const provider = providers.find((candidate) => candidate.id === job);
const others = ["alerts", "exposure", "breaks"];

if (!provider && !others.includes(job ?? "")) {
  const names = [...providers.map((candidate) => candidate.id), ...others];
  console.error(`Usage: job <${names.join("|")}>`);
  process.exit(1);
}

const db = createDb(ENV);

try {
  if (provider) await Effect.runPromise(ingest(provider, db));
  else if (job === "exposure") console.log(await Effect.runPromise(updateExposure(db)));
  else if (job === "breaks") {
    for (const source of breakSources) await Effect.runPromise(importBreaks(source, db));
  } else await Effect.runPromise(evaluateAlerts(db));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
