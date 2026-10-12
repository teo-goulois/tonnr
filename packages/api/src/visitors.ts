import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { visitorClosure } from "@repo/db/schema/access";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Whether a request that names no one comes from the web app: a visitor, whom the instance
 * answers while it is open to them. The request says so in `Origin`, which a browser writes
 * itself and a page cannot change. A program can write it too: it then reads what a visitor
 * reads, and no more. Decision 039.
 */
export function isFromWebApp(site: string | null, webOrigin: string) {
  return site !== null && site === webOrigin;
}

/** Since when the instance answers no visitor. Null while it answers them. */
export async function visitorsClosedAt(db: Database | Transaction) {
  const [closure] = await db.select({ at: visitorClosure.at }).from(visitorClosure);
  return closure?.at ?? null;
}

/**
 * What a visitor is told while the instance answers none. Its `data` tells it from any other
 * refusal: the web app then asks for an account in place of the map.
 */
export function visitorsClosed() {
  return new ORPCError("UNAUTHORIZED", {
    message: "This instance takes an account for now. Sign in, or create one.",
    data: { visitors: "closed" },
  });
}
