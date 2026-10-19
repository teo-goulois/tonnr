import { appOriginsOf } from "@repo/api/cross-site";
import { createForecasts } from "@repo/api/forecasts";
import { createIdeas } from "@repo/api/ideas";
import { createPlaces } from "@repo/api/places";
import { createPrivateCatalogue } from "@repo/api/private-catalogue";
import { createUsage } from "@repo/api/usage";
import { createAuth } from "@repo/auth";
import { appleRevocationOf } from "@repo/auth/apple-revocation";
import { createVerification } from "@repo/auth/verification";
import { APP_SCHEME } from "@repo/config/app";
import { createDb } from "@repo/db";
import { createMailer } from "@repo/mail";
import { createStorage } from "@repo/media/storage";

import { ENV } from "./env.server";

export const db = createDb(ENV);
// The mail an instance sends, through the provider its settings name. None without one: no
// address is checked then, and no idea sent from the landing. Decision 026.
const mailer = createMailer(ENV);
export const verification = createVerification(ENV, db, mailer, ENV.EMAIL_DAILY_LIMIT);
export const ideas = createIdeas(db, mailer, ENV.EMAIL_DAILY_LIMIT);
// The origins the apps for phones name themselves by: decision 069.
export const appOrigins = appOriginsOf(ENV.APP_ORIGINS, APP_SCHEME);
export const auth = createAuth(ENV, db, appOrigins, verification);
// Counts the calls in memory and writes them every thirty seconds.
export const usage = createUsage(db);
// Keeps the forecasts in the database, and counts what it asks of their provider.
export const forecasts = createForecasts(db);
// Finds a place by its name, through the search service the settings name.
export const places = createPlaces(ENV);
// Separate from the application database: no app migration, ingestion or write uses it.
export const privateCatalogue = ENV.CATALOGUE_DATABASE_URL
  ? createPrivateCatalogue({ DATABASE_URL: ENV.CATALOGUE_DATABASE_URL })
  : undefined;
// The bucket the photos and the videos are kept in. None without its settings: the instance then
// keeps no media, and the web app offers none. Decision 066.
export const storage = createStorage(ENV);
// What revokes at Apple's the tokens of an account that is deleted, on an instance that offers
// Sign in with Apple, with the client and the key its sign-in uses. None without them: Apple is
// then asked nothing. Decision 071.
export const apple = appleRevocationOf(ENV);
