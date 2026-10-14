import type { Session } from "@repo/auth";
import type { Verification } from "@repo/auth/verification";
import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import type { Database } from "@repo/db";

import type { Analytics, AnalyticsRequest } from "./analytics";
import type { Ideas } from "./ideas";
import type { Places } from "./places";
import type { Usage, Way } from "./usage";

export type Context = {
  session: Session | null;
  analytics?: Analytics | undefined;
  analyticsRequest?: AnalyticsRequest | undefined;
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
  // The way the call came in, which it is counted with: the MCP server says `mcp`, and the
  // API's own transports say nothing. Decision 045.
  way?: Way;
  // What sends an account the mail that checks its address. Decision 026.
  verification: Verification;
  // What sends whoever makes the product the ideas sent from the landing. Without it, an idea is
  // answered as an instance that sends no mail answers it. Decision 026.
  ideas?: Ideas | undefined;
  // What a procedure says of its answer beyond its body. The program that serves it reads it.
  reply: {
    // After how many seconds a caller that was told to wait may ask again.
    retryAfterSeconds?: number;
  };
  // The forecasts of this program: kept in its memory, then in the database, and asked of the
  // provider within the instance's budget. Decision 023.
  forecasts: Forecasts;
  // The search of places by name, which asks the service the instance names. Decision 030.
  places: Places;
  // The process that answers, as the state of the instance shows it: when it started, and the
  // web app's address as it holds it. Both are the server's to say.
  // `revision` is the commit the program was built from, null or left out where it does not
  // know: a program that runs from its sources. `pushKey` is the public key of the pair the
  // instance sends push with, which a browser subscribes with: an instance without one sends
  // no push. Decision 031.
  server: {
    startedAt: Date;
    webOrigin: string;
    revision?: string | null;
    pushKey?: string | undefined;
  };
};
