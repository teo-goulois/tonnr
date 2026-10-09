import { createForecasts } from "@repo/api/forecasts";
import { createUsage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { createVerification } from "@repo/auth/verification";
import { createDb } from "@repo/db";
import { createMailer } from "@repo/mail";

import { ENV } from "./env.server";

export const db = createDb(ENV);
// The mail an instance sends, through the provider its settings name. None without one: no
// address is checked then. Decision 026.
export const verification = createVerification(ENV, db, createMailer(ENV), ENV.EMAIL_DAILY_LIMIT);
export const auth = createAuth(ENV, db, [], verification);
// Counts the calls in memory and writes them every thirty seconds.
export const usage = createUsage(db);
// Keeps the forecasts in the database, and counts what it asks of their provider.
export const forecasts = createForecasts(db);
