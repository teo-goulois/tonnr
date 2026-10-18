import { resolve } from "node:path";

import { fetchModels } from "@repo/media/models";

// Puts the models the worker analyses a report with in a folder, at the revisions and with the
// checksums `packages/media/src/models.ts` names: the worker's image runs it as it is built, and
// a developer once, before `pnpm --filter worker run job media`. Decision 067.
const folder = resolve(process.argv[2] ?? "models");
await fetchModels(folder, (line) => console.log(line));
console.log(`The models are in ${folder}`);
