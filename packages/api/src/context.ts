import type { Session } from "@repo/auth";
import type { Database } from "@repo/db";

export type Context = {
  session: Session | null;
  db: Database;
  // The request's Authorization header, where a program gives its API key. Null without one.
  authorization: string | null;
};
