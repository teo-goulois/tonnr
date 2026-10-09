import type { Session } from "@repo/auth";
import type { Verification } from "@repo/auth/verification";
import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import type { Database } from "@repo/db";

import type { Usage } from "./usage";

export type Context = {
  session: Session | null;
  db: Database;
  // The request's Authorization header, where a program gives its API key. Null without one.
  authorization: string | null;
  // The site the request says it comes from, in `Origin` or else in `Referer`. Null when it
  // says none.
  site: string | null;
  // The sites whose pages may run the instance: the admin app's, or the API's own on an
  // instance that has no admin app.
  adminSites: readonly string[];
  // Where the calls are counted.
  usage: Usage;
  // What sends an account the mail that checks its address. Decision 026.
  verification: Verification;
  // What a procedure says of its answer beyond its body. The program that serves it reads it.
  reply: {
    // After how many seconds a caller that was told to wait may ask again.
    retryAfterSeconds?: number;
  };
  // The forecasts of this program: kept in its memory, then in the database, and asked of the
  // provider within the instance's budget. Decision 023.
  forecasts: Forecasts;
  // The process that answers, as the state of the instance shows it: when it started, and the
  // web app's address as it holds it. Both are the server's to say.
  server: { startedAt: Date; webOrigin: string };
};
