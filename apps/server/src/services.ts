import { createForecasts } from "@repo/api/forecasts";
import { createIdeas } from "@repo/api/ideas";
import { createPlaces } from "@repo/api/places";
import { createUsage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { createVerification } from "@repo/auth/verification";
import { createDb } from "@repo/db";
import { createMailer } from "@repo/mail";

import { ENV } from "./env.server";

export const db = createDb(ENV);
// The mail an instance sends, through the provider its settings name. None without one: no
// address is checked then, and no idea sent from the landing. Decision 026.
const mailer = createMailer(ENV);
export const verification = createVerification(ENV, db, mailer, ENV.EMAIL_DAILY_LIMIT);
export const ideas = createIdeas(db, mailer, ENV.EMAIL_DAILY_LIMIT);
export const auth = createAuth(ENV, db, [], verification);
// Counts the calls in memory and writes them every thirty seconds.
export const usage = createUsage(db);
// Keeps the forecasts in the database, and counts what it asks of their provider.
export const forecasts = createForecasts(db);
// Finds a place by its name, through the search service the settings name.
export const places = createPlaces(ENV);
