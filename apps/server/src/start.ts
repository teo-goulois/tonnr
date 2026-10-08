import path from "node:path";

import { migrateDatabase } from "@repo/db/migrate";

import { ENV } from "./env.server";

// What the container runs: it brings the schema up to date, then starts the API, so deploying a
// version is one step. `index.ts` alone starts the API and leaves the schema as it is.

// The folder is at the same depth from `src/` and from `dist/`.
const migrationsFolder = path.resolve(import.meta.dirname, "../../../packages/db/src/migrations");

// A stop that comes before the API listens ends the process. Postgres rolls back the migrations
// under way when its connection drops. These handlers stay until the API has set its own: a
// container's first process ignores a signal that nothing handles.
const stop = () => process.exit(1);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

await migrateDatabase(ENV.DATABASE_URL, migrationsFolder);
console.log("Migrations applied");

await import("./index");
process.off("SIGTERM", stop);
process.off("SIGINT", stop);
