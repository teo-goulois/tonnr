import { createDb } from "@repo/db";
import { Effect } from "effect";

import { evaluateAlerts } from "./alerts";
import { breakSources, importBreaks } from "./breaks/import";
import { ENV } from "./env.server";
import { updateExposure } from "./exposure";
import { ingest, providers } from "./ingest";
import { grantOperator, removeOperator } from "./operators";
import { importPrivateFile, removePrivateFile } from "./private-breaks/command";

// Runs one job once and exits: `pnpm --filter worker run job ndbc`, `... job alerts`,
// `... job exposure`, or `... job breaks`. Four more take a value and write only with `--write`:
// `... job private-breaks <file>`, `... job private-breaks-remove <import>`,
// `... job operator <account id>` and `... job operator-remove <account id>`.
const [job, ...rest] = process.argv.slice(2);
const provider = providers.find((candidate) => candidate.id === job);
// The jobs that take a value, say what they would do, and do it with `--write`.
const commands = {
  "private-breaks": importPrivateFile,
  "private-breaks-remove": removePrivateFile,
  operator: grantOperator,
  "operator-remove": removeOperator,
};
const command = Object.entries(commands).find(([name]) => name === job)?.[1];
const others = ["alerts", "exposure", "breaks", ...Object.keys(commands)];

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
  } else if (command) {
    const outcome = await command(db, rest);
    for (const line of outcome.lines) (outcome.ok ? console.log : console.error)(line);
    if (!outcome.ok) process.exitCode = 1;
  } else await Effect.runPromise(evaluateAlerts(db));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
