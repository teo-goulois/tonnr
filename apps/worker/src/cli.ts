import { appleRevocationOf } from "@repo/auth/apple-revocation";
import { createDb, type Database } from "@repo/db";
import { Effect } from "effect";

import { evaluateAlerts } from "./alerts";
import {
  addBreaksFile,
  addCandidates,
  fetchBreaks,
  removeBreaksOf,
  removeCandidatesOf,
} from "./breaks/command";
import { mailOutOf, pushOutOf } from "./deliveries";
import { ENV } from "./env.server";
import { updateExposure } from "./exposure";
import { createForecasts } from "./forecasts";
import { ingest, providersOf } from "./ingest";
import { moderationDone, moderationOutOf, tellModeration } from "./moderation";
import { tellMoments } from "./moments";
import { keepListedForecasts } from "./pages";
import { mediaDone, processMedia } from "./media";
import { createAnalyser } from "@repo/media/analysis";
import { createStorage } from "@repo/media/storage";
import { join } from "node:path";
import { deleteAccountByCommand } from "./deletion";
import { grantOperator, removeOperator } from "./operators";
import { pushKeys } from "./push-keys";
import { reportNoticesDone, tellReports } from "./report-notices";

// Runs one job once and exits: `pnpm --filter worker run job ndbc`, `... job alerts`,
// `... job moments`, `... job exposure`, `... job pages`, `... job media`, `... job reports`, or
// `... job moderation`. Eight more take a value and write only with `--write`:
// `... job breaks <file>`, `... job breaks-fetch <source>`, `... job breaks-remove <list>`,
// `... job candidates <folder>`, `... job candidates-remove <list>`,
// `... job operator <account id>`, `... job operator-remove <account id>` and
// `... job account-delete <account id>`. One reads and writes nothing: `... job push-keys` makes
// the pair of keys an instance sends push with.
const [job, ...rest] = process.argv.slice(2);
// A provider that asks for an account is a job only with the instance's key for it.
const providers = providersOf(ENV);
const provider = providers.find((candidate) => candidate.id === job);
// The jobs that take a value, say what they would do, and do it with `--write`.
const commands = {
  breaks: addBreaksFile,
  "breaks-fetch": fetchBreaks,
  "breaks-remove": removeBreaksOf,
  candidates: addCandidates,
  "candidates-remove": removeCandidatesOf,
  operator: grantOperator,
  "operator-remove": removeOperator,
  // Deletes an account that asked by mail, and revokes its tokens at Apple's where the instance
  // offers Sign in with Apple: decision 071.
  "account-delete": (db: Database, args: string[]) =>
    deleteAccountByCommand(db, args, appleRevocationOf(ENV)),
};
const command = Object.entries(commands).find(([name]) => name === job)?.[1];
const others = [
  "alerts",
  "moments",
  "exposure",
  "pages",
  "media",
  "reports",
  "moderation",
  "push-keys",
  ...Object.keys(commands),
];

if (!provider && !others.includes(job ?? "")) {
  const names = [...providers.map((candidate) => candidate.id), ...others];
  console.error(`Usage: job <${names.join("|")}>`);
  process.exit(1);
}

const db = createDb(ENV);

try {
  if (provider) await Effect.runPromise(ingest(provider, db));
  else if (job === "exposure") console.log(await Effect.runPromise(updateExposure(db)));
  else if (job === "pages") {
    console.log(await Effect.runPromise(keepListedForecasts(db, createForecasts(db, "pages"))));
  } else if (job === "media") {
    // The photos and the videos that wait, on an instance that keeps some: decision 066.
    const storage = createStorage(ENV);
    if (!storage) throw new Error("This instance keeps no media: MEDIA_BUCKET is not set");
    const analyser = createAnalyser({
      folder: ENV.MEDIA_MODELS_DIR ?? join(process.cwd(), "models"),
    });
    mediaDone(
      await Effect.runPromise(
        processMedia(db, storage, {
          analyser,
          ...(ENV.REPORT_KEEP_DAYS !== undefined && { keepReportDays: ENV.REPORT_KEEP_DAYS }),
        }),
      ),
    );
  } else if (job === "reports") {
    // What the reports shown since tell the accounts that keep their break: decision 068.
    reportNoticesDone(
      await Effect.runPromise(
        tellReports(db, { push: pushOutOf(ENV), storage: createStorage(ENV) }),
      ),
    );
  } else if (job === "moderation") {
    // What accounts flagged and contested, mailed to the instance's address: decision 067.
    const out = moderationOutOf(ENV);
    if (!out) throw new Error("This instance sends no mail: neither UNOSEND_API_KEY nor SMTP_URL");
    moderationDone(await Effect.runPromise(tellModeration(db, out)));
  } else if (job === "moments") {
    await Effect.runPromise(tellMoments(db, mailOutOf(ENV), pushOutOf(ENV)));
  } else if (job === "push-keys") {
    // The pair alone goes to the standard output, so that it can be sent to a file.
    const made = pushKeys(Boolean(ENV.VAPID_PUBLIC_KEY || ENV.VAPID_PRIVATE_KEY));
    for (const note of made.notes) console.error(note);
    for (const line of made.lines) console.log(line);
  } else if (command) {
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
