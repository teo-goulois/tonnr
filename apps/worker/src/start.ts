import path from "node:path";

import { migrateDatabase } from "@repo/db/migrate";

import { ENV } from "./env.server";

// What the container runs: it brings the schema up to date, then starts the worker, as the API's
// container does. Either may start first, and both may start together. `index.ts` alone starts
// the worker and leaves the schema as it is.

// The folder is at the same depth from `src/` and from `dist/`.
const migrationsFolder = path.resolve(import.meta.dirname, "../../../packages/db/src/migrations");

// A stop that comes before the worker has set its own handlers ends the process: a container's
// first process ignores a signal that nothing handles.
const stop = () => process.exit(1);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

await migrateDatabase(ENV.DATABASE_URL, migrationsFolder);
console.log("Migrations applied");

await import("./index");
process.off("SIGTERM", stop);
process.off("SIGINT", stop);
