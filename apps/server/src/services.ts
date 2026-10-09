import { createUsage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { createDb } from "@repo/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
// Counts the calls in memory and writes them every thirty seconds.
export const usage = createUsage(db);
