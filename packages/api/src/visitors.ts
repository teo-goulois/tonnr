import { ORPCError } from "@orpc/server";
import { FORECAST_BUDGET, FORECAST_PROVIDER } from "@repo/conditions/forecasts/open-meteo";
import type { Database } from "@repo/db";
import { currentCalls } from "@repo/db/calls";
import { visitorClosure } from "@repo/db/schema/access";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * What the instance takes as strong demand: four fifths of the requests it lets itself send its
 * forecast provider in a day for the people who look. Past it the instance answers no visitor
 * until the day turns, in UTC, and the last fifth is left to the accounts. Like the budget it
 * is a part of, it is written here and is no setting. Decision 039.
 */
export const STRONG_DEMAND_AT = (FORECAST_BUDGET.day.people * 4) / 5;

/** Whether the requests counted in the present day, by bucket, say that demand is strong. */
export function isDemandStrong(calls: ReadonlyMap<string, number>) {
  return (calls.get("day:people") ?? 0) >= STRONG_DEMAND_AT;
}

/**
 * Whether a request that names no one comes from the web app: a visitor, whom the instance
 * answers while it is open to them. The request says so in `Origin`, which a browser writes
 * itself and a page cannot change. A program can write it too: it then reads what a visitor
 * reads, and no more. Decision 039.
 */
export function isFromWebApp(site: string | null, webOrigin: string) {
  return site !== null && site === webOrigin;
}

/** Since when an operator has the instance answer no visitor. Null while none has. */
export async function visitorsClosedAt(db: Database | Transaction) {
  const [closure] = await db.select({ at: visitorClosure.at }).from(visitorClosure);
  return closure?.at ?? null;
}

/**
 * Whether the instance answers visitors now: no operator closed it to them, and demand is not
 * strong. Both are read at each call, so that every program of the instance closes at once and
 * opens again when the day turns, with nothing to run.
 */
export async function answersVisitors(db: Database) {
  if ((await visitorsClosedAt(db)) !== null) return false;
  return !isDemandStrong(await currentCalls(db, FORECAST_PROVIDER));
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
