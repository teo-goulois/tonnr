import { createDb } from "@repo/db";
import { Effect } from "effect";

import { evaluateAlerts } from "./alerts";
import { addBreaksFile, fetchBreaks, removeBreaksOf } from "./breaks/command";
import { ENV } from "./env.server";
import { updateExposure } from "./exposure";
import { createForecasts } from "./forecasts";
import { ingest, providers } from "./ingest";
import { grantOperator, removeOperator } from "./operators";

// Runs one job once and exits: `pnpm --filter worker run job ndbc`, `... job alerts`, or
// `... job exposure`. Five more take a value and write only with `--write`:
// `... job breaks <file>`, `... job breaks-fetch <source>`, `... job breaks-remove <list>`,
// `... job operator <account id>` and `... job operator-remove <account id>`.
const [job, ...rest] = process.argv.slice(2);
const provider = providers.find((candidate) => candidate.id === job);
// The jobs that take a value, say what they would do, and do it with `--write`.
const commands = {
  breaks: addBreaksFile,
  "breaks-fetch": fetchBreaks,
  "breaks-remove": removeBreaksOf,
  operator: grantOperator,
  "operator-remove": removeOperator,
};
const command = Object.entries(commands).find(([name]) => name === job)?.[1];
const others = ["alerts", "exposure", ...Object.keys(commands)];

if (!provider && !others.includes(job ?? "")) {
  const names = [...providers.map((candidate) => candidate.id), ...others];
  console.error(`Usage: job <${names.join("|")}>`);
  process.exit(1);
}

const db = createDb(ENV);

try {
  if (provider) await Effect.runPromise(ingest(provider, db));
  else if (job === "exposure") console.log(await Effect.runPromise(updateExposure(db)));
  else if (command) {
    const outcome = await command(db, rest);
    for (const line of outcome.lines) (outcome.ok ? console.log : console.error)(line);
    if (!outcome.ok) process.exitCode = 1;
  } else await Effect.runPromise(evaluateAlerts(db, createForecasts(db)));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
