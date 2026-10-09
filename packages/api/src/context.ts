import type { Session } from "@repo/auth";
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
};
