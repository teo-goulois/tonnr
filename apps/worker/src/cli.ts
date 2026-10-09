import { createDb } from "@repo/db";
import { Effect } from "effect";

import { evaluateAlerts } from "./alerts";
import { breakSources, importBreaks } from "./breaks/import";
import { ENV } from "./env.server";
import { updateExposure } from "./exposure";
import { ingest, providers } from "./ingest";
import { importPrivateFile, removePrivateFile } from "./private-breaks/command";

// Runs one job once and exits: `pnpm --filter worker run job ndbc`, `... job alerts`,
// `... job exposure`, or `... job breaks`. Two more take a value and write only with `--write`:
// `... job private-breaks <file>` and `... job private-breaks-remove <import>`.
const [job, ...rest] = process.argv.slice(2);
const provider = providers.find((candidate) => candidate.id === job);
const others = ["alerts", "exposure", "breaks", "private-breaks", "private-breaks-remove"];

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
  } else if (job === "private-breaks" || job === "private-breaks-remove") {
    const run = job === "private-breaks" ? importPrivateFile : removePrivateFile;
    const outcome = await run(db, rest);
    for (const line of outcome.lines) (outcome.ok ? console.log : console.error)(line);
    if (!outcome.ok) process.exitCode = 1;
  } else await Effect.runPromise(evaluateAlerts(db));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
