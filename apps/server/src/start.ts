import path from "node:path";

import { migrateDatabase } from "@repo/db/migrate";

import { ENV } from "./env.server";

// What the container runs: it brings the schema up to date, then starts the API, so deploying a
// version is one step. `index.ts` alone starts the API and leaves the schema as it is.

// The folder is at the same depth from `src/` and from `dist/`.
const migrationsFolder = path.resolve(import.meta.dirname, "../../../packages/db/src/migrations");

// A stop that comes during the migrations ends the process. Postgres rolls back the migration
// under way when its connection drops. The API takes the signals over once it starts.
const stop = () => process.exit(1);
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

await migrateDatabase(ENV.DATABASE_URL, migrationsFolder);
console.log("Migrations applied");

process.off("SIGTERM", stop);
process.off("SIGINT", stop);
await import("./index");
