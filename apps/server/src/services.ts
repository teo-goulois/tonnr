import { createAuth } from "@repo/auth";
import { createDb } from "@repo/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
